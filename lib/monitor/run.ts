import "server-only";

import { and, desc, eq, gt, gte, inArray, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { HttpError } from "@/lib/auth/http";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { toRunDTO } from "@/lib/db/dto";
import {
  EMPTY_RUN_STATS,
  feedback,
  issues,
  products,
  runs,
  sources,
  type Feedback,
  type Product,
  type Run,
  type RunSourceResult,
  type RunStage,
  type RunStats,
  type RunTrigger,
  type Source as SourceRow,
  type SourceRole,
} from "@/lib/db/schema";
import { sendRunAlerts, notifyAutofiled } from "@/lib/alerts";
import { ingestFeedback } from "@/lib/feedback/ingest";
import { computeNextRunAt } from "@/lib/plans";
import { fetchSource, SourceError, type FetchResult } from "@/lib/sources";
import { feedbackKindToSource } from "@/lib/types";
import { analyzeItems } from "./analyze";
import { fileIssue } from "./file";
import { persistScope, saveFeedbackTags } from "./persist";
import { selectSourcesForPlan } from "./plan";

/** A queued or running run older than this is treated as dead. */
export const STALE_RUN_MS = 10 * 60 * 1000;
/** Feedback considered by each analysis. */
export const ANALYSIS_WINDOW_DAYS = 30;
export const OWN_ANALYSIS_CAP = 400;
export const COMPETITOR_ANALYSIS_CAP = 200;
/** Items requested per source per run. */
export const FETCH_LIMIT = 100;
/** Re-read this much before the last successful fetch so nothing slips between runs (dedupe absorbs the overlap). */
const FETCH_OVERLAP_MS = 2 * 24 * 60 * 60 * 1000;
const FETCH_CONCURRENCY = 3;
/** Safety cap on auto-filed issues per run. */
const AUTOFILE_PER_RUN = 10;

export const SKIP_NO_NEW_FEEDBACK = "No new feedback since last run";
export const SKIP_NO_FEEDBACK = "No feedback yet. Add a source, install the widget, or paste feedback to get started.";
export const SKIP_EMPTY_WINDOW = "No feedback from the last 30 days to analyze.";

function errorMessage(err: unknown, fallback: string): string {
  // Only our own errors carry user-facing messages. SDK and database errors
  // (endpoint URLs, model, table and constraint names) are logged, not shown.
  if (err instanceof SourceError || err instanceof HttpError) return err.message.slice(0, 500);
  return fallback;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Marks queued/running runs older than STALE_RUN_MS as failed. */
export async function failStaleRuns(productId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  await db
    .update(runs)
    .set({ status: "failed", error: "The run did not finish in time.", finishedAt: new Date() })
    .where(and(eq(runs.productId, productId), inArray(runs.status, ["queued", "running"]), lte(runs.createdAt, cutoff)));
}

/** The product's queued or running run started in the last 10 minutes, if any. */
export async function findActiveRun(productId: string): Promise<Run | null> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const [row] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.productId, productId), inArray(runs.status, ["queued", "running"]), gt(runs.createdAt, cutoff)))
    .orderBy(desc(runs.createdAt))
    .limit(1);
  return row ?? null;
}

/** Inserts a queued run. 409 conflict when one is already in progress for the product. */
export async function startRun(productId: string, trigger: RunTrigger): Promise<Run> {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.archivedAt)))
    .limit(1);
  if (!product) throw new HttpError(404, "not_found", "Product not found.");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bm:run:${productId}`}))`);
    const cutoff = new Date(Date.now() - STALE_RUN_MS);
    await tx
      .update(runs)
      .set({ status: "failed", error: "The run did not finish in time.", finishedAt: new Date() })
      .where(and(eq(runs.productId, productId), inArray(runs.status, ["queued", "running"]), lte(runs.createdAt, cutoff)));
    const [active] = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.productId, productId), inArray(runs.status, ["queued", "running"])))
      .limit(1);
    if (active) {
      throw new HttpError(409, "conflict", "A run is already in progress for this product.", {
        runId: active.id,
        run: toRunDTO(active),
      });
    }
    const [run] = await tx
      .insert(runs)
      .values({
        workspaceId: product.workspaceId,
        productId,
        trigger,
        status: "queued",
        stats: { ...EMPTY_RUN_STATS, perSource: [] },
      })
      .returning();
    return run;
  });
}

async function saveStats(runId: string, stats: RunStats, extra?: Partial<Pick<Run, "status" | "error" | "finishedAt" | "startedAt">>) {
  await db
    .update(runs)
    .set({ stats: { ...stats }, ...(extra ?? {}) })
    .where(eq(runs.id, runId));
}

async function loadAnalysisWindow(productId: string, role: SourceRole, cap: number, now: Date): Promise<Feedback[]> {
  const since = new Date(now.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const when = sql`coalesce(${feedback.postedAt}, ${feedback.ingestedAt})`;
  return db
    .select()
    .from(feedback)
    .where(
      and(
        eq(feedback.productId, productId),
        eq(feedback.role, role),
        notInArray(feedback.status, ["archived", "spam"]),
        gte(when, since),
      ),
    )
    .orderBy(desc(when), desc(feedback.ingestedAt))
    .limit(cap);
}

interface FetchedSource {
  source: SourceRow;
  result: FetchResult | null;
  error: string | null;
}

async function fetchOne(source: SourceRow, now: Date): Promise<FetchedSource> {
  const since = source.lastSuccessAt ? new Date(new Date(source.lastSuccessAt).getTime() - FETCH_OVERLAP_MS) : null;
  try {
    const result = await fetchSource(source.kind, source.config, { since, limit: FETCH_LIMIT });
    await db
      .update(sources)
      .set({ lastFetchedAt: now, lastSuccessAt: now, lastError: null, lastItemCount: result.items.length })
      .where(eq(sources.id, source.id));
    return { source, result, error: null };
  } catch (err) {
    const message = errorMessage(err, "We could not read this source.");
    if (!(err instanceof SourceError)) console.error(`[monitor] source ${source.id} failed`, err);
    await db.update(sources).set({ lastFetchedAt: now, lastError: message }).where(eq(sources.id, source.id));
    return { source, result: null, error: message };
  }
}

async function finishRun(
  run: Run,
  product: Product,
  planId: Parameters<typeof computeNextRunAt>[0],
  stats: RunStats,
  status: "succeeded" | "skipped" | "failed",
  error: string | null,
): Promise<Run> {
  const now = new Date();
  stats.stage = "done";
  const [updated] = await db
    .update(runs)
    .set({ status, stats: { ...stats }, error, finishedAt: now })
    .where(eq(runs.id, run.id))
    .returning();
  await db
    .update(products)
    .set({ lastRunAt: now, nextRunAt: computeNextRunAt(planId, now) })
    .where(eq(products.id, product.id));
  return updated ?? run;
}

/**
 * The full pipeline for one queued run:
 * fetch -> dedupe and store -> skip check -> cluster -> diff and persist ->
 * alerts -> auto-file -> finish. Updates `stats.stage` as it goes. Never
 * throws for pipeline failures; they are stored on the run.
 */
export async function executeRun(runId: string): Promise<Run> {
  const [initial] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!initial) throw new HttpError(404, "not_found", "Run not found.");
  if (initial.status !== "queued") return initial;

  const [product] = await db.select().from(products).where(eq(products.id, initial.productId)).limit(1);
  if (!product) throw new HttpError(404, "not_found", "Product not found.");

  const stats: RunStats = { ...EMPTY_RUN_STATS, perSource: [], newIssueIds: [], worsenedIssueIds: [], improvedIssueIds: [], resolvedIssueIds: [] };
  const startedAt = new Date();
  let planId: Parameters<typeof computeNextRunAt>[0] = "free";

  const [claimed] = await db
    .update(runs)
    .set({ status: "running", startedAt, stats: { ...stats, stage: "fetching" } })
    .where(and(eq(runs.id, runId), eq(runs.status, "queued")))
    .returning();
  if (!claimed) {
    const [current] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    return current ?? initial;
  }
  let run = claimed;

  const setStage = async (stage: RunStage) => {
    stats.stage = stage;
    await saveStats(runId, stats);
  };

  try {
    const planState = await getWorkspacePlan(product.workspaceId);
    const plan = planState.plan;
    planId = plan.id;
    const now = new Date();

    // 1. Fetch.
    await setStage("fetching");
    const allSources = await db.select().from(sources).where(eq(sources.productId, product.id));
    const { active, paused } = selectSourcesForPlan(allSources, {
      sourcesPerProduct: plan.limits.sources_per_product,
      competitors: plan.limits.competitors,
      competitorTracking: plan.features.competitor_tracking,
    });
    const fetched = await mapLimit(active, FETCH_CONCURRENCY, (s) => fetchOne(s, now));

    const perSource = new Map<string, RunSourceResult>();
    for (const f of fetched) {
      perSource.set(f.source.id, {
        sourceId: f.source.id,
        label: f.source.label,
        kind: f.source.kind,
        role: f.source.role,
        fetched: f.result?.items.length ?? 0,
        inserted: 0,
        duplicates: 0,
        error: f.error,
        pausedByPlan: false,
      });
    }
    for (const s of paused) {
      perSource.set(s.id, {
        sourceId: s.id,
        label: s.label,
        kind: s.kind,
        role: s.role,
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        error: null,
        pausedByPlan: true,
      });
    }
    stats.fetched = fetched.reduce((n, f) => n + (f.result?.items.length ?? 0), 0);
    stats.perSource = Array.from(perSource.values());

    // 2. Dedupe and store.
    await setStage("storing");
    for (const f of fetched) {
      if (!f.result || f.result.items.length === 0) continue;
      const result = await ingestFeedback({
        workspaceId: product.workspaceId,
        productId: product.id,
        channel: "source",
        sourceId: f.source.id,
        items: f.result.items.map((i) => ({
          text: i.text,
          title: i.title ?? null,
          author: i.author ?? null,
          rating: i.rating ?? null,
          url: i.url ?? null,
          postedAt: i.postedAt ?? null,
          externalId: i.externalId,
          sourceKind: f.source.kind,
          role: f.source.role,
          competitorName: f.source.competitorName,
          meta: { site: f.source.kind, via: f.result?.via ?? "direct" },
        })),
      });
      const row = perSource.get(f.source.id);
      if (row) {
        row.inserted = result.inserted;
        row.duplicates = result.duplicates;
      }
      stats.inserted += result.inserted;
      stats.duplicates += result.duplicates;
      if (result.quotaExceeded) stats.quotaReached = true;
    }
    stats.perSource = Array.from(perSource.values());
    await saveStats(runId, stats);

    // 3. Skip check.
    const [previous] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.productId, product.id), eq(runs.status, "succeeded"), ne(runs.id, runId)))
      .orderBy(desc(runs.createdAt))
      .limit(1);
    if (previous) {
      // Feedback stored during the previous run was analysed by it, so count from when it finished.
      const since = previous.finishedAt ?? previous.startedAt ?? previous.createdAt;
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(feedback)
        .where(and(eq(feedback.productId, product.id), gt(feedback.ingestedAt, since)));
      if (Number(n) === 0) {
        stats.skippedReason = SKIP_NO_NEW_FEEDBACK;
        return await finishRun(run, product, planId, stats, "skipped", null);
      }
    }

    // 4. Cluster.
    await setStage("clustering");
    const ownWindow = await loadAnalysisWindow(product.id, "own", OWN_ANALYSIS_CAP, now);
    const competitorWindow = plan.features.competitor_tracking
      ? await loadAnalysisWindow(product.id, "competitor", COMPETITOR_ANALYSIS_CAP, now)
      : [];
    if (ownWindow.length === 0 && competitorWindow.length === 0) {
      stats.skippedReason = previous ? SKIP_EMPTY_WINDOW : SKIP_NO_FEEDBACK;
      return await finishRun(run, product, planId, stats, "skipped", null);
    }

    const ctx = { productName: product.name, productDescription: product.description };
    const own = ownWindow.length
      ? await analyzeItems(
          ownWindow.map((f) => ({ text: f.text, source: feedbackKindToSource(f.sourceKind) })),
          ctx,
        )
      : null;
    const competitor = competitorWindow.length
      ? await analyzeItems(
          competitorWindow.map((f) => ({ text: f.text, source: feedbackKindToSource(f.sourceKind) })),
          {
            productName: Array.from(new Set(competitorWindow.map((f) => f.competitorName).filter(Boolean))).join(", ") || "a competitor",
            productDescription: `Reviews of products that compete with ${product.name}. Group the complaints people have about them.`,
          },
        )
      : null;
    stats.analyzed = ownWindow.length + competitorWindow.length;
    if (own) await saveFeedbackTags(ownWindow, own.tagged);
    if (competitor) await saveFeedbackTags(competitorWindow, competitor.tagged);

    // 5. Diff and persist.
    await setStage("diffing");
    const previousRunId = previous?.id ?? null;
    if (own) {
      const outcome = await persistScope({
        run,
        product,
        scope: "own",
        clusters: own.issues,
        analysed: ownWindow,
        previousRunId,
        now,
      });
      stats.newIssueIds = outcome.newIds;
      stats.worsenedIssueIds = outcome.worsenedIds;
      stats.improvedIssueIds = outcome.improvedIds;
      stats.resolvedIssueIds = outcome.resolvedIds;
      stats.issuesNew = outcome.newIds.length;
      stats.issuesWorsened = outcome.worsenedIds.length;
      stats.issuesImproved = outcome.improvedIds.length;
      stats.issuesPersistent = outcome.persistentIds.length;
      stats.issuesResolved = outcome.resolvedIds.length;
    }
    if (competitor) {
      await persistScope({
        run,
        product,
        scope: "competitor",
        clusters: competitor.issues,
        analysed: competitorWindow,
        previousRunId,
        now,
      });
    }
    await saveStats(runId, stats);

    // 6. Alerts.
    await setStage("alerting");
    run = { ...run, stats: { ...stats } };
    stats.alertsSent = await sendRunAlerts(run);

    // 7. Auto-file.
    if (product.autofileEnabled && product.autofileTarget && plan.features.auto_file) {
      await setStage("filing");
      stats.filed = await autofile(run, product);
    }

    return await finishRun(run, product, planId, stats, "succeeded", null);
  } catch (err) {
    const message = errorMessage(err, "The run failed unexpectedly.");
    console.error(`[monitor] run ${runId} failed`, err);
    try {
      return await finishRun(run, product, planId, stats, "failed", message);
    } catch (inner) {
      console.error(`[monitor] could not record failure for run ${runId}`, inner);
      return { ...run, status: "failed", error: message };
    }
  }
}

async function autofile(run: Run, product: Product): Promise<number> {
  const target = product.autofileTarget;
  if (!target) return 0;
  const candidates = await db
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.productId, product.id),
        eq(issues.scope, "own"),
        eq(issues.lastSeenRunId, run.id),
        gte(issues.priorityScore, product.autofileThreshold),
        notInArray(issues.status, ["ignored", "shipped"]),
        isNull(issues.externalId),
      ),
    )
    .orderBy(desc(issues.priorityScore))
    .limit(AUTOFILE_PER_RUN);

  const filed: Array<{ issueId: string; title: string; externalUrl: string; target: typeof target }> = [];
  for (const issue of candidates) {
    try {
      const result = await fileIssue(issue.id, target);
      filed.push({ issueId: issue.id, title: issue.title, externalUrl: result.externalUrl, target });
    } catch (err) {
      console.warn(`[monitor] auto-file failed for issue ${issue.id}`, errorMessage(err, "unknown"));
      // A broken integration fails every issue the same way; stop early.
      if (err instanceof HttpError && (err.status === 400 || err.status === 402 || err.status === 502)) break;
    }
  }
  await notifyAutofiled({ run, productName: product.name, filed });
  return filed.length;
}

/** startRun + executeRun. */
export async function runProduct(productId: string, trigger: RunTrigger): Promise<Run> {
  const run = await startRun(productId, trigger);
  return executeRun(run.id);
}

/** Whether the product has any run at all (its first run is the free "onboarding" run). */
export async function hasAnyRun(productId: string): Promise<boolean> {
  const [row] = await db.select({ id: runs.id }).from(runs).where(eq(runs.productId, productId)).limit(1);
  return Boolean(row);
}

/** Products due for a scheduled run: monitoring on, not archived, nextRunAt unset or in the past. */
export function dueCondition(now: Date) {
  return and(
    eq(products.monitoringEnabled, true),
    isNull(products.archivedAt),
    or(isNull(products.nextRunAt), lte(products.nextRunAt, now)),
  );
}
