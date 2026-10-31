import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  apiTokens,
  feedback,
  integrations,
  issueSnapshots,
  issues,
  runs,
  sources,
  workspaceMembers,
  type IssueTrend,
  type IssueWorkflowStatus,
  type Product,
  type SourceRole,
  type Workspace,
} from "@/lib/db/schema";
import { buildSetupChecklist, type SetupChecklist } from "../setup-checklist";
import {
  toFeedbackDTO,
  toIssueDTO,
  toIssueSnapshotDTO,
  toRunDTO,
  toSourceDTO,
  type FeedbackDTO,
  type IssueDTO,
  type IssueSnapshotDTO,
  type RunDTO,
  type SourceDTO,
} from "@/lib/db/dto";
import type { WeekStripDay } from "@/components/ui/week-strip";
import { buildWeekDays, lastDayKeys, safeTimeZone } from "../week";

/**
 * Read-only data for the signed-in app pages (dashboard, issues, runs).
 * Server components call these after validating the workspace and product
 * (BUILD_CONTRACTS 6.5). Every query is scoped by workspace or product id.
 */

const DAY_MS = 86_400_000;
/** A queued or running run older than this is treated as stuck, not active. */
const ACTIVE_RUN_WINDOW_MS = 15 * 60_000;

const postedOrIngested = sql`coalesce(${feedback.postedAt}, ${feedback.ingestedAt})`;

// ---------------------------------------------------------------------------
// Feedback volume
// ---------------------------------------------------------------------------

export interface FeedbackVolume {
  days: WeekStripDay[];
  thisWeek: number;
  lastWeek: number;
}

/** Feedback per calendar day (workspace time zone) for the last 7 days, plus the 7 before for the delta. */
export async function getFeedbackVolume(productId: string, timeZone: string, now = new Date()): Promise<FeedbackVolume> {
  const tz = safeTimeZone(timeZone);
  const since = new Date(now.getTime() - 15 * DAY_MS);
  const rows = await db
    .select({
      day: sql<string>`to_char(${postedOrIngested} at time zone ${tz}, 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(feedback)
    .where(
      and(
        eq(feedback.productId, productId),
        eq(feedback.role, "own"),
        ne(feedback.status, "spam"),
        gte(postedOrIngested, since),
      ),
    )
    .groupBy(sql`1`);

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.day, Number(r.n) || 0);

  const keys14 = lastDayKeys(now, tz, 14);
  const lastWeekKeys = keys14.slice(0, 7);
  const thisWeekKeys = keys14.slice(7);
  const sum = (keys: string[]) => keys.reduce((s, k) => s + (counts.get(k) ?? 0), 0);

  return {
    days: buildWeekDays(counts, now, tz, 7),
    thisWeek: sum(thisWeekKeys),
    lastWeek: sum(lastWeekKeys),
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardIssue {
  issue: IssueDTO;
  /** Frequency per run, oldest first, at most 8 points. */
  history: number[];
  /** New feedback matched to this issue since the last run, not yet counted in its frequency. */
  pending?: number;
}

export interface DashboardData {
  volume: FeedbackVolume;
  openIssues: number;
  resolved30d: number;
  topIssues: DashboardIssue[];
  competitorIssues: IssueDTO[];
  sources: SourceDTO[];
  recentRuns: RunDTO[];
  activeRun: RunDTO | null;
  lastSucceededRun: RunDTO | null;
  hasAnyRun: boolean;
  feedbackTotal: number;
  /** New feedback matched to an existing issue on arrival, waiting for the next run. */
  pendingMatched: number;
}

/** Counts of feedback that arrived after the last run and was matched to each issue on ingest. */
async function pendingByIssue(issueIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (issueIds.length === 0) return out;
  const rows = await db
    .select({ issueId: feedback.issueId, n: sql<number>`count(*)::int` })
    .from(feedback)
    .where(and(inArray(feedback.issueId, issueIds), eq(feedback.status, "new")))
    .groupBy(feedback.issueId);
  for (const r of rows) if (r.issueId) out.set(r.issueId, Number(r.n));
  return out;
}

async function frequencyHistory(issueIds: string[], points = 8): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (issueIds.length === 0) return out;
  const rows = await db
    .select({ issueId: issueSnapshots.issueId, frequency: issueSnapshots.frequency })
    .from(issueSnapshots)
    .where(inArray(issueSnapshots.issueId, issueIds))
    .orderBy(asc(issueSnapshots.createdAt));
  for (const r of rows) {
    const list = out.get(r.issueId) ?? [];
    list.push(r.frequency);
    out.set(r.issueId, list);
  }
  for (const [id, list] of out) out.set(id, list.slice(-points));
  return out;
}

const OPEN_STATUSES: IssueWorkflowStatus[] = ["backlog", "in_progress"];

export async function getDashboardData(product: Product, timeZone: string, now = new Date()): Promise<DashboardData> {
  const productId = product.id;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [volume, openRow, resolvedRow, topRows, competitorRows, sourceRows, runRows, succeededRows, totalRow] =
    await Promise.all([
      getFeedbackVolume(productId, timeZone, now),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(issues)
        .where(
          and(
            eq(issues.productId, productId),
            eq(issues.scope, "own"),
            inArray(issues.status, OPEN_STATUSES),
            ne(issues.trend, "resolved"),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(eq(issues.productId, productId), eq(issues.scope, "own"), gte(issues.resolvedAt, thirtyDaysAgo))),
      db
        .select()
        .from(issues)
        .where(
          and(
            eq(issues.productId, productId),
            eq(issues.scope, "own"),
            ne(issues.status, "ignored"),
            ne(issues.trend, "resolved"),
          ),
        )
        .orderBy(sql`${issues.rank} asc nulls last`, desc(issues.priorityScore), desc(issues.frequency))
        .limit(10),
      db
        .select()
        .from(issues)
        .where(
          and(
            eq(issues.productId, productId),
            eq(issues.scope, "competitor"),
            ne(issues.status, "ignored"),
            ne(issues.trend, "resolved"),
          ),
        )
        .orderBy(desc(issues.priorityScore), desc(issues.frequency))
        .limit(5),
      db.select().from(sources).where(eq(sources.productId, productId)).orderBy(asc(sources.createdAt)),
      db.select().from(runs).where(eq(runs.productId, productId)).orderBy(desc(runs.createdAt)).limit(5),
      db
        .select()
        .from(runs)
        .where(and(eq(runs.productId, productId), eq(runs.status, "succeeded")))
        .orderBy(desc(runs.createdAt))
        .limit(1),
      db.select({ n: sql<number>`count(*)::int` }).from(feedback).where(eq(feedback.productId, productId)),
    ]);

  const [history, pending, pendingRow] = await Promise.all([
    frequencyHistory(topRows.map((r) => r.id)),
    pendingByIssue(topRows.map((r) => r.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(feedback)
      .where(and(eq(feedback.productId, productId), eq(feedback.status, "new"), isNotNull(feedback.issueId))),
  ]);
  const recentRuns = runRows.map(toRunDTO);
  const latest = runRows[0];
  const activeRun =
    latest &&
    (latest.status === "queued" || latest.status === "running") &&
    now.getTime() - new Date(latest.createdAt).getTime() < ACTIVE_RUN_WINDOW_MS
      ? toRunDTO(latest)
      : null;

  return {
    volume,
    openIssues: Number(openRow[0]?.n ?? 0),
    resolved30d: Number(resolvedRow[0]?.n ?? 0),
    topIssues: topRows.map((r) => ({
      issue: toIssueDTO(r),
      history: history.get(r.id) ?? [],
      pending: pending.get(r.id) ?? 0,
    })),
    competitorIssues: competitorRows.map(toIssueDTO),
    sources: sourceRows.map(toSourceDTO),
    recentRuns,
    activeRun,
    lastSucceededRun: succeededRows[0] ? toRunDTO(succeededRows[0]) : null,
    hasAnyRun: runRows.length > 0,
    feedbackTotal: Number(totalRow[0]?.n ?? 0),
    pendingMatched: Number(pendingRow[0]?.n ?? 0),
  };
}

/**
 * The dashboard's "Finish setting up" list: the automation that makes
 * BuildMonday run on its own. Null when the admin hid it.
 */
export async function getSetupChecklist(workspace: Workspace, product: Product): Promise<SetupChecklist | null> {
  if (workspace.onboardingAnswers?.checklistHiddenAt) return null;
  const [sourceRow, integrationRows, widgetRow, tokenRow, memberRow] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(sources).where(eq(sources.productId, product.id)),
    db.select({ kind: integrations.kind }).from(integrations).where(eq(integrations.workspaceId, workspace.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(feedback)
      .where(and(eq(feedback.workspaceId, workspace.id), eq(feedback.channel, "widget"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(apiTokens)
      .where(eq(apiTokens.workspaceId, workspace.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspace.id)),
  ]);
  const kinds = new Set(integrationRows.map((r) => r.kind));
  return buildSetupChecklist({
    sources: Number(sourceRow[0]?.n ?? 0),
    slack: kinds.has("slack"),
    trackerConnected: kinds.has("linear") || kinds.has("github"),
    autofileOn: product.autofileEnabled && Boolean(product.autofileTarget && kinds.has(product.autofileTarget)),
    widgetFeedback: Number(widgetRow[0]?.n ?? 0),
    extensionTokens: Number(tokenRow[0]?.n ?? 0),
    members: Number(memberRow[0]?.n ?? 0),
  });
}

// ---------------------------------------------------------------------------
// Issues list
// ---------------------------------------------------------------------------

export type IssueSort = "priority" | "frequency" | "recent";
export interface IssueListFilters {
  scope: SourceRole;
  status: IssueWorkflowStatus | "open" | "all";
  trend: IssueTrend | "all";
  sort: IssueSort;
  q: string;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listIssues(
  productId: string,
  filters: IssueListFilters,
): Promise<{ issues: DashboardIssue[]; counts: Record<SourceRole, number>; total: number }> {
  const where: SQL[] = [eq(issues.productId, productId), eq(issues.scope, filters.scope)];
  if (filters.status === "open") where.push(inArray(issues.status, OPEN_STATUSES));
  else if (filters.status !== "all") where.push(eq(issues.status, filters.status));
  if (filters.trend !== "all") where.push(eq(issues.trend, filters.trend));
  const q = filters.q.trim().slice(0, 100);
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    const match = or(ilike(issues.title, pattern), ilike(issues.affectedSegment, pattern), ilike(issues.category, pattern));
    if (match) where.push(match);
  }

  const order =
    filters.sort === "frequency"
      ? [desc(issues.frequency), desc(issues.priorityScore)]
      : filters.sort === "recent"
        ? [desc(issues.lastSeenAt), desc(issues.priorityScore)]
        : [sql`case when ${issues.trend} = 'resolved' then 1 else 0 end`, sql`${issues.rank} asc nulls last`, desc(issues.priorityScore)];

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(issues)
      .where(and(...where))
      .orderBy(...order)
      .limit(200),
    db
      .select({ scope: issues.scope, n: sql<number>`count(*)::int` })
      .from(issues)
      .where(eq(issues.productId, productId))
      .groupBy(issues.scope),
  ]);

  const history = await frequencyHistory(rows.map((r) => r.id));
  const counts: Record<SourceRole, number> = { own: 0, competitor: 0 };
  for (const c of countRows) counts[c.scope] = Number(c.n) || 0;
  return {
    issues: rows.map((r) => ({ issue: toIssueDTO(r), history: history.get(r.id) ?? [] })),
    counts,
    total: counts.own + counts.competitor,
  };
}

/** Lightweight id + title list for pickers (inbox "Link to issue", issue filter). */
export async function listIssueOptions(productId: string): Promise<Array<{ id: string; title: string; scope: SourceRole }>> {
  return db
    .select({ id: issues.id, title: issues.title, scope: issues.scope })
    .from(issues)
    .where(and(eq(issues.productId, productId), ne(issues.status, "ignored")))
    .orderBy(sql`${issues.rank} asc nulls last`, desc(issues.priorityScore))
    .limit(200);
}

// ---------------------------------------------------------------------------
// Issue detail
// ---------------------------------------------------------------------------

export interface IssueDetail {
  issue: IssueDTO;
  snapshots: IssueSnapshotDTO[];
  feedback: FeedbackDTO[];
  feedbackCount: number;
}

export async function getIssueDetail(workspaceId: string, issueId: string): Promise<IssueDetail | null> {
  if (!/^[0-9a-zA-Z-]{1,64}$/.test(issueId)) return null;
  const [row] = await db
    .select()
    .from(issues)
    .where(and(eq(issues.id, issueId), eq(issues.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;

  const [snapRows, feedbackRows, countRow] = await Promise.all([
    db
      .select()
      .from(issueSnapshots)
      .where(eq(issueSnapshots.issueId, issueId))
      .orderBy(desc(issueSnapshots.createdAt))
      .limit(26),
    db
      .select()
      .from(feedback)
      .where(and(eq(feedback.issueId, issueId), eq(feedback.workspaceId, workspaceId)))
      .orderBy(desc(postedOrIngested))
      .limit(50),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(feedback)
      .where(and(eq(feedback.issueId, issueId), eq(feedback.workspaceId, workspaceId))),
  ]);

  return {
    issue: toIssueDTO(row),
    snapshots: snapRows.reverse().map(toIssueSnapshotDTO),
    feedback: feedbackRows.map((f) => toFeedbackDTO(f, row.title)),
    feedbackCount: Number(countRow[0]?.n ?? 0),
  };
}

export interface TrackerStatus {
  linear: { connected: boolean; label: string | null };
  github: { connected: boolean; label: string | null };
}

export async function getTrackerStatus(workspaceId: string): Promise<TrackerStatus> {
  const rows = await db
    .select({ kind: integrations.kind, status: integrations.status, config: integrations.config })
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), inArray(integrations.kind, ["linear", "github"])));
  const out: TrackerStatus = {
    linear: { connected: false, label: null },
    github: { connected: false, label: null },
  };
  for (const r of rows) {
    if (r.config.kind === "linear") out.linear = { connected: true, label: r.config.teamName || r.config.teamKey };
    if (r.config.kind === "github") out.github = { connected: true, label: `${r.config.owner}/${r.config.repo}` };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function listRuns(
  productId: string,
  opts: { before?: Date | null; limit?: number } = {},
): Promise<{ runs: RunDTO[]; nextBefore: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const where: SQL[] = [eq(runs.productId, productId)];
  if (opts.before && !Number.isNaN(opts.before.getTime())) where.push(lt(runs.createdAt, opts.before));
  const rows = await db
    .select()
    .from(runs)
    .where(and(...where))
    .orderBy(desc(runs.createdAt))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const more = rows.length > limit;
  return {
    runs: page.map(toRunDTO),
    nextBefore: more && page.length > 0 ? new Date(page[page.length - 1].createdAt).toISOString() : null,
  };
}

export interface RunDetail {
  run: RunDTO;
  productId: string;
  issuesById: Record<string, IssueDTO>;
}

export async function getRunDetail(workspaceId: string, runId: string): Promise<RunDetail | null> {
  if (!/^[0-9a-zA-Z-]{1,64}$/.test(runId)) return null;
  const [row] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;
  const s = row.stats;
  const ids = Array.from(
    new Set([
      ...(s?.newIssueIds ?? []),
      ...(s?.worsenedIssueIds ?? []),
      ...(s?.improvedIssueIds ?? []),
      ...(s?.resolvedIssueIds ?? []),
    ]),
  ).slice(0, 400);
  const issueRows = ids.length
    ? await db
        .select()
        .from(issues)
        .where(and(inArray(issues.id, ids), eq(issues.workspaceId, workspaceId)))
    : [];
  const issuesById: Record<string, IssueDTO> = {};
  for (const r of issueRows) issuesById[r.id] = toIssueDTO(r);
  return { run: toRunDTO(row), productId: row.productId, issuesById };
}

/** Whether the product has any feedback with a usable source (for empty states). */
export async function countEnabledSources(productId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sources)
    .where(and(eq(sources.productId, productId), eq(sources.enabled, true), isNotNull(sources.id)));
  return Number(row?.n ?? 0);
}
