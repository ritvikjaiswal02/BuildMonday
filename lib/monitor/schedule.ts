import "server-only";

import { and, asc, count, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { HttpError } from "@/lib/auth/http";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { computeNextRunAt } from "@/lib/plans";
import { dueCondition, runProduct } from "./run";

/** While a product is being processed its nextRunAt is pushed this far ahead (a lease). */
const CLAIM_LEASE_MS = 15 * 60 * 1000;
/** In-process fallback: do not start another batch when less than this much budget is left. */
const MIN_HEADROOM_MS = 120_000;
/** In-process fallback: products run side by side. */
const CONCURRENCY = 3;

export interface ClaimedProduct {
  id: string;
  workspaceId: string;
  createdAt: Date;
}

/**
 * Claims up to `limit` due products by moving their nextRunAt forward
 * atomically (a 15-minute lease), so overlapping cron invocations never
 * process the same product twice.
 */
export async function claimDueProducts(limit: number, now: Date = new Date()): Promise<ClaimedProduct[]> {
  const claimed: ClaimedProduct[] = [];
  const skip = new Set<string>();
  for (let attempt = 0; attempt < 5 && claimed.length < limit; attempt++) {
    const candidates = await db
      .select({ id: products.id, workspaceId: products.workspaceId, createdAt: products.createdAt })
      .from(products)
      .where(dueCondition(now))
      .orderBy(sql`${products.nextRunAt} asc nulls first`, asc(products.createdAt))
      .limit(limit * 2);
    const fresh = candidates.filter((c) => !skip.has(c.id));
    if (fresh.length === 0) break;
    for (const candidate of fresh) {
      if (claimed.length >= limit) break;
      skip.add(candidate.id);
      const [won] = await db
        .update(products)
        .set({ nextRunAt: new Date(now.getTime() + CLAIM_LEASE_MS) })
        .where(and(eq(products.id, candidate.id), or(isNull(products.nextRunAt), lte(products.nextRunAt, now))))
        .returning({ id: products.id });
      if (won) claimed.push(candidate);
    }
  }
  return claimed;
}

/** Gives a claimed product back (due now), for example when handing it to a worker failed. */
export async function releaseClaim(productId: string, now: Date = new Date()): Promise<void> {
  await db.update(products).set({ nextRunAt: now }).where(eq(products.id, productId));
}

/** Due products that nobody has claimed. */
export async function countDueProducts(now: Date = new Date()): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(products).where(dueCondition(now));
  return Number(n);
}

/** True when the product is within its workspace's product limit (oldest products first). */
async function withinProductLimit(product: ClaimedProduct): Promise<{ ok: boolean; planId: Parameters<typeof computeNextRunAt>[0] }> {
  const state = await getWorkspacePlan(product.workspaceId);
  const max = state.plan.limits.products;
  if (max === -1) return { ok: true, planId: state.plan.id };
  const [{ n }] = await db
    .select({ n: count() })
    .from(products)
    .where(
      and(
        eq(products.workspaceId, product.workspaceId),
        isNull(products.archivedAt),
        lt(products.createdAt, product.createdAt),
      ),
    );
  return { ok: Number(n) < max, planId: state.plan.id };
}

/**
 * Runs one claimed product: skips it (keeping its data) when it is beyond the
 * plan's product limit after a downgrade, otherwise runs the full pipeline.
 */
export async function runClaimedProduct(productId: string): Promise<"ran" | "over_limit" | "busy" | "missing"> {
  const [product] = await db
    .select({ id: products.id, workspaceId: products.workspaceId, createdAt: products.createdAt })
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.archivedAt)))
    .limit(1);
  if (!product) return "missing";
  try {
    const limit = await withinProductLimit(product);
    if (!limit.ok) {
      await db
        .update(products)
        .set({ nextRunAt: computeNextRunAt(limit.planId, new Date()) })
        .where(eq(products.id, product.id));
      return "over_limit";
    }
    await runProduct(product.id, "schedule");
    return "ran";
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) return "busy"; // already running elsewhere
    console.error(`[monitor] scheduled run for product ${product.id} failed to start`, err);
    throw err;
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i]);
      }
    }),
  );
}

/**
 * In-process fallback for when products cannot be handed to their own
 * invocations: runs due products three at a time and stops claiming once less
 * than two minutes of budget remain, so no run is cut off by maxDuration.
 */
export async function runDueProducts(opts: { budgetMs: number }): Promise<{ processed: string[]; remaining: number }> {
  const started = Date.now();
  const processed: string[] = [];

  while (Date.now() - started < opts.budgetMs - MIN_HEADROOM_MS) {
    const batch = await claimDueProducts(CONCURRENCY);
    if (batch.length === 0) break;
    await mapLimit(batch, CONCURRENCY, async (product) => {
      try {
        if ((await runClaimedProduct(product.id)) === "ran") processed.push(product.id);
      } catch {
        // Logged in runClaimedProduct; the lease expires and the next tick retries.
      }
    });
  }

  return { processed, remaining: await countDueProducts() };
}
