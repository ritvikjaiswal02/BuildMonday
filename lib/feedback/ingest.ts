import "server-only";

import { waitUntil } from "@vercel/functions";
import { and, eq, inArray, sql } from "drizzle-orm";
import { consumeUsage, currentPeriod } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { feedback, usageCounters, type IngestChannel } from "@/lib/db/schema";
import { assignToExistingIssues } from "./assign";
import { prepareIngestItems, type IngestItem, type PreparedFeedback } from "./prepare";

export type { IngestItem } from "./prepare";

export interface IngestResult {
  inserted: number;
  duplicates: number;
  rejected: number;
  ids: string[];
  quotaExceeded: boolean;
  /** Items linked to an existing issue on arrival (see assignToExistingIssues). */
  matched?: number;
}

export interface IngestArgs {
  workspaceId: string;
  productId: string;
  channel: IngestChannel;
  sourceId?: string | null;
  items: IngestItem[];
  /** Default true. */
  enforceQuota?: boolean;
  /** The extension route passes "extension_clips_per_month"; feedback_items_per_month is always counted. */
  quotaMetric?: "feedback_items_per_month" | "extension_clips_per_month";
  /**
   * Match new items to existing issues right away. "await" (default for
   * people adding feedback) waits up to a few seconds so the answer can say
   * what matched; "background" (the public widget) does it after the
   * response; "off" (scheduled runs, which cluster everything anyway).
   */
  assign?: "await" | "background" | "off";
}

const ASSIGN_WAIT_MS = 8_000;

type QuotaMetric = "feedback_items_per_month" | "extension_clips_per_month";

/** The storage operations ingest needs; the default uses Postgres. Tests pass a fake. */
export interface IngestStore {
  existingKeys(productId: string, keys: string[]): Promise<Set<string>>;
  consume(workspaceId: string, metric: QuotaMetric, amount: number): Promise<number>;
  refund(workspaceId: string, metric: QuotaMetric, amount: number): Promise<void>;
  insert(
    rows: Array<PreparedFeedback & { workspaceId: string; productId: string; channel: IngestChannel; sourceId: string | null }>,
  ): Promise<string[]>;
}

const KEY_CHUNK = 500;
const INSERT_CHUNK = 200;

export const dbIngestStore: IngestStore = {
  async existingKeys(productId, keys) {
    const found = new Set<string>();
    for (let i = 0; i < keys.length; i += KEY_CHUNK) {
      const slice = keys.slice(i, i + KEY_CHUNK);
      const rows = await db
        .select({ key: feedback.dedupeKey })
        .from(feedback)
        .where(and(eq(feedback.productId, productId), inArray(feedback.dedupeKey, slice)));
      for (const r of rows) found.add(r.key);
    }
    return found;
  },
  async consume(workspaceId, metric, amount) {
    if (amount <= 0) return 0;
    const r = await consumeUsage(workspaceId, metric, amount);
    return r.allowed;
  },
  async refund(workspaceId, metric, amount) {
    if (amount <= 0) return;
    await db
      .update(usageCounters)
      .set({ count: sql`greatest(${usageCounters.count} - ${amount}, 0)` })
      .where(
        and(
          eq(usageCounters.workspaceId, workspaceId),
          eq(usageCounters.period, currentPeriod()),
          eq(usageCounters.metric, metric),
        ),
      );
  },
  async insert(rows) {
    const ids: string[] = [];
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const slice = rows.slice(i, i + INSERT_CHUNK);
      const inserted = await db
        .insert(feedback)
        .values(
          slice.map((r) => ({
            workspaceId: r.workspaceId,
            productId: r.productId,
            sourceId: r.sourceId,
            channel: r.channel,
            sourceKind: r.sourceKind,
            role: r.role,
            competitorName: r.competitorName,
            externalId: r.externalId,
            dedupeKey: r.dedupeKey,
            text: r.text,
            title: r.title,
            author: r.author,
            authorEmail: r.authorEmail,
            rating: r.rating,
            url: r.url,
            postedAt: r.postedAt,
            status: r.status,
            meta: r.meta,
          })),
        )
        .onConflictDoNothing({ target: [feedback.productId, feedback.dedupeKey] })
        .returning({ id: feedback.id });
      for (const row of inserted) ids.push(row.id);
    }
    return ids;
  },
};

/**
 * The ingest core with explicit storage. Order of operations:
 * prepare -> drop known duplicates (they never use quota) -> reserve quota ->
 * insert with ON CONFLICT DO NOTHING -> give back quota for rows that lost a
 * race to a concurrent insert.
 */
export async function ingestWithStore(store: IngestStore, args: IngestArgs): Promise<IngestResult> {
  const { rows, rejected, batchDuplicates } = prepareIngestItems(args.productId, args.items);
  if (rows.length === 0) {
    return { inserted: 0, duplicates: batchDuplicates, rejected, ids: [], quotaExceeded: false };
  }

  const known = await store.existingKeys(
    args.productId,
    rows.map((r) => r.dedupeKey),
  );
  const fresh = rows.filter((r) => !known.has(r.dedupeKey));
  let duplicates = batchDuplicates + (rows.length - fresh.length);
  if (fresh.length === 0) {
    return { inserted: 0, duplicates, rejected, ids: [], quotaExceeded: false };
  }

  const enforce = args.enforceQuota !== false;
  const clipMetric = args.quotaMetric === "extension_clips_per_month";
  let allowed = fresh.length;
  let clipsReserved = 0;

  if (enforce) {
    if (clipMetric) {
      clipsReserved = await store.consume(args.workspaceId, "extension_clips_per_month", allowed);
      allowed = clipsReserved;
    }
    const feedbackAllowed = allowed > 0 ? await store.consume(args.workspaceId, "feedback_items_per_month", allowed) : 0;
    if (clipMetric && feedbackAllowed < clipsReserved) {
      await store.refund(args.workspaceId, "extension_clips_per_month", clipsReserved - feedbackAllowed);
    }
    allowed = feedbackAllowed;
  }

  const quotaExceeded = allowed < fresh.length;
  const toInsert = fresh.slice(0, allowed).map((r) => ({
    ...r,
    workspaceId: args.workspaceId,
    productId: args.productId,
    channel: args.channel,
    sourceId: args.sourceId ?? null,
  }));

  const ids = toInsert.length > 0 ? await store.insert(toInsert) : [];
  const lostRaces = toInsert.length - ids.length;
  if (lostRaces > 0) {
    duplicates += lostRaces;
    if (enforce) {
      await store.refund(args.workspaceId, "feedback_items_per_month", lostRaces);
      if (clipMetric) await store.refund(args.workspaceId, "extension_clips_per_month", lostRaces);
    }
  }

  return { inserted: ids.length, duplicates, rejected, ids, quotaExceeded };
}

/**
 * Stores feedback from any channel (source fetches, widget, extension,
 * manual add, import). Idempotent per (productId, dedupeKey).
 */
export async function ingestFeedback(args: IngestArgs): Promise<IngestResult> {
  const result = await ingestWithStore(dbIngestStore, args);
  const mode = args.assign ?? (args.channel === "source" ? "off" : args.channel === "widget" ? "background" : "await");
  if (result.ids.length === 0 || mode === "off") return result;

  const work = assignToExistingIssues(args.productId, result.ids);
  if (mode === "background") {
    waitUntil(work.then(() => undefined));
    return result;
  }
  const matched = await Promise.race([
    work,
    new Promise<number>((resolve) => setTimeout(() => resolve(0), ASSIGN_WAIT_MS)),
  ]);
  return { ...result, matched };
}
