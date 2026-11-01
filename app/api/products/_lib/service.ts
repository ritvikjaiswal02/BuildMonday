import "server-only";

import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { HttpError } from "@/lib/auth/http";
import type { SessionContext } from "@/lib/auth/session";
import { generatePublicKey } from "@/lib/auth/tokens";
import {
  assertFeature,
  assertWithinLimit,
  assertWithinPlanLimit,
  getWorkspacePlan,
  withWorkspaceLimitLock,
} from "@/lib/billing/entitlements";
import { db, type Db } from "@/lib/db";
import {
  feedback,
  integrations,
  issues,
  products,
  type Product,
  type TrackerTarget,
} from "@/lib/db/schema";
import { computeNextRunAt } from "@/lib/plans";
import { mergeWidgetSettings, type ProductPatch } from "./rules";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

export async function countActiveProducts(workspaceId: string, executor: Executor = db): Promise<number> {
  const [row] = await executor
    .select({ n: count() })
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), isNull(products.archivedAt)));
  return Number(row?.n ?? 0);
}

/** Throws 402 limit_reached when the workspace already has as many products as the plan allows. */
export async function assertCanAddProduct(workspaceId: string): Promise<void> {
  const current = await countActiveProducts(workspaceId);
  await assertWithinLimit(workspaceId, "products", current);
}

export async function insertProduct(
  executor: Executor,
  args: {
    workspaceId: string;
    plan: Parameters<typeof computeNextRunAt>[0];
    name: string;
    websiteUrl: string | null;
    description: string | null;
    now?: Date;
  },
): Promise<Product> {
  const now = args.now ?? new Date();
  const [row] = await executor
    .insert(products)
    .values({
      workspaceId: args.workspaceId,
      name: args.name,
      websiteUrl: args.websiteUrl,
      description: args.description,
      publicKey: generatePublicKey(),
      monitoringEnabled: true,
      nextRunAt: computeNextRunAt(args.plan, now),
    })
    .returning();
  return row;
}

export async function createProduct(
  ctx: SessionContext,
  input: { name: string; websiteUrl?: string | null; description?: string | null },
): Promise<Product> {
  const state = await getWorkspacePlan(ctx.workspace.id);
  return withWorkspaceLimitLock(ctx.workspace.id, async (tx) => {
    const current = await countActiveProducts(ctx.workspace.id, tx);
    assertWithinPlanLimit(state.plan.id, "products", current);
    return insertProduct(tx, {
      workspaceId: ctx.workspace.id,
      plan: state.plan.id,
      name: input.name,
      websiteUrl: input.websiteUrl ?? null,
      description: input.description ?? null,
    });
  });
}

export async function productCounts(productId: string): Promise<{ feedback: number; openIssues: number; newFeedback: number }> {
  const [[all], [fresh], [open]] = await Promise.all([
    db.select({ n: count() }).from(feedback).where(eq(feedback.productId, productId)),
    db
      .select({ n: count() })
      .from(feedback)
      .where(and(eq(feedback.productId, productId), eq(feedback.status, "new"))),
    db
      .select({ n: count() })
      .from(issues)
      .where(
        and(
          eq(issues.productId, productId),
          eq(issues.scope, "own"),
          inArray(issues.status, ["backlog", "in_progress"]),
          ne(issues.trend, "resolved"),
        ),
      ),
  ]);
  return {
    feedback: Number(all?.n ?? 0),
    newFeedback: Number(fresh?.n ?? 0),
    openIssues: Number(open?.n ?? 0),
  };
}

export async function isIntegrationConnected(workspaceId: string, kind: TrackerTarget): Promise<boolean> {
  const [row] = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, kind)))
    .limit(1);
  return Boolean(row);
}

const TRACKER_NAMES: Record<TrackerTarget, string> = { linear: "Linear", github: "GitHub" };

/** Applies a validated PATCH, enforcing plan gates for monitoring and auto-filing. */
export async function updateProduct(ctx: SessionContext, product: Product, patch: ProductPatch): Promise<Product> {
  const values: Partial<typeof products.$inferInsert> = {};

  if (patch.name !== undefined) values.name = patch.name;
  if (patch.websiteUrl !== undefined) values.websiteUrl = patch.websiteUrl;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.alertThreshold !== undefined) values.alertThreshold = patch.alertThreshold;
  if (patch.autofileThreshold !== undefined) values.autofileThreshold = patch.autofileThreshold;
  if (patch.autofileTarget !== undefined) values.autofileTarget = patch.autofileTarget;
  if (patch.allowedOrigins !== undefined) values.allowedOrigins = patch.allowedOrigins;
  if (patch.widgetSettings !== undefined) {
    values.widgetSettings = mergeWidgetSettings(product.widgetSettings, patch.widgetSettings);
  }

  if (patch.monitoringEnabled !== undefined) {
    if (patch.monitoringEnabled && !product.monitoringEnabled) {
      // Re-enabling counts against the products limit: monitored products only.
      const [row] = await db
        .select({ n: count() })
        .from(products)
        .where(
          and(
            eq(products.workspaceId, ctx.workspace.id),
            isNull(products.archivedAt),
            eq(products.monitoringEnabled, true),
            ne(products.id, product.id),
          ),
        );
      await assertWithinLimit(ctx.workspace.id, "products", Number(row?.n ?? 0));
      const state = await getWorkspacePlan(ctx.workspace.id);
      values.nextRunAt = computeNextRunAt(state.plan.id, new Date());
    }
    values.monitoringEnabled = patch.monitoringEnabled;
  }

  const autofileOn = patch.autofileEnabled ?? product.autofileEnabled;
  const target = patch.autofileTarget !== undefined ? patch.autofileTarget : product.autofileTarget;
  if (patch.autofileEnabled === true || (autofileOn && patch.autofileTarget !== undefined)) {
    await assertFeature(ctx.workspace.id, "auto_file");
    if (!target) {
      throw new HttpError(400, "invalid_request", "Choose Linear or GitHub to file issues to.");
    }
    if (!(await isIntegrationConnected(ctx.workspace.id, target))) {
      throw new HttpError(400, "invalid_request", `Connect ${TRACKER_NAMES[target]} in Settings first.`);
    }
  }
  if (patch.autofileEnabled !== undefined) values.autofileEnabled = patch.autofileEnabled;

  if (Object.keys(values).length === 0) return product;

  const [row] = await db
    .update(products)
    .set(values)
    .where(and(eq(products.id, product.id), eq(products.workspaceId, ctx.workspace.id)))
    .returning();
  if (!row) throw new HttpError(404, "not_found", "Product not found.");
  return row;
}

export async function archiveProduct(ctx: SessionContext, product: Product): Promise<void> {
  await db
    .update(products)
    .set({ archivedAt: new Date(), monitoringEnabled: false, autofileEnabled: false })
    .where(and(eq(products.id, product.id), eq(products.workspaceId, ctx.workspace.id)));
}

export async function rotatePublicKey(ctx: SessionContext, product: Product): Promise<string> {
  const publicKey = generatePublicKey();
  await db
    .update(products)
    .set({ publicKey })
    .where(and(eq(products.id, product.id), eq(products.workspaceId, ctx.workspace.id)));
  return publicKey;
}
