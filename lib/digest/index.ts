import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { postToWorkspaceSlack } from "@/lib/alerts";
import { sendEmail } from "@/lib/auth/mailer";
import { getWorkspaceRecipients } from "@/lib/auth/workspace";
import { db } from "@/lib/db";
import {
  digestSends,
  feedback,
  issues,
  products,
  runs,
  workspaces,
  type FeedbackSourceKind,
  type Issue as IssueRow,
  type Product,
  type Workspace,
} from "@/lib/db/schema";
import { absoluteUrl, env } from "@/lib/env";
import { buildSlackDigest, isoWeekKey, renderDigestEmail, weekLabel, type DigestData, type DigestIssue } from "./render";
import { digestSlot, parseDigestMode, type DigestScheduleMode } from "./schedule";

export { digestSlot, digestTimingCopy, parseDigestMode, type DigestScheduleMode } from "./schedule";
export { renderDigestEmail, isoWeekKey, weekLabel, digestSubject, buildSlackDigest, type DigestData, type DigestIssue } from "./render";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_DAYS = 14;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDigestIssue(r: IssueRow): DigestIssue {
  return {
    id: r.id,
    title: r.title,
    trend: r.trend,
    status: r.status,
    frequency: r.frequency,
    priorityScore: r.priorityScore,
    rank: r.rank,
    quote: r.evidence?.[0] ? (r.evidence[0].length > 220 ? `${r.evidence[0].slice(0, 219)}…` : r.evidence[0]) : null,
    url: absoluteUrl(`/issues/${r.id}`),
  };
}

/** Collects one product's digest content for the week ending at `now`. */
export async function buildDigestData(workspace: Workspace, product: Product, now: Date): Promise<DigestData> {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS);
  const own = and(eq(issues.productId, product.id), eq(issues.scope, "own"));

  const top = await db
    .select()
    .from(issues)
    .where(and(own, ne(issues.status, "ignored"), ne(issues.trend, "resolved"), gte(issues.lastSeenAt, activeSince)))
    .orderBy(sql`${issues.rank} asc nulls last`, desc(issues.priorityScore))
    .limit(5);

  const newWhere = and(own, ne(issues.status, "ignored"), ne(issues.trend, "resolved"), gte(issues.firstSeenAt, weekAgo));
  const newIssues = await db.select().from(issues).where(newWhere).orderBy(desc(issues.priorityScore)).limit(5);
  const [{ n: newCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(issues).where(newWhere);

  const worseWhere = and(own, ne(issues.status, "ignored"), eq(issues.trend, "worsened"), gte(issues.lastSeenAt, weekAgo));
  const worsened = await db.select().from(issues).where(worseWhere).orderBy(desc(issues.priorityScore)).limit(5);
  const [{ n: worsenedCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(issues).where(worseWhere);

  const resolved = await db
    .select()
    .from(issues)
    .where(
      and(
        own,
        or(
          gte(issues.resolvedAt, weekAgo),
          and(eq(issues.status, "shipped"), gte(issues.updatedAt, weekAgo)),
        ),
      ),
    )
    .orderBy(desc(issues.updatedAt))
    .limit(5);

  const bySource = await db
    .select({ kind: feedback.sourceKind, n: sql<number>`count(*)::int` })
    .from(feedback)
    .where(and(eq(feedback.productId, product.id), eq(feedback.role, "own"), gte(feedback.ingestedAt, weekAgo)))
    .groupBy(feedback.sourceKind);
  const feedbackBySource: Partial<Record<FeedbackSourceKind, number>> = {};
  let feedbackTotal = 0;
  for (const row of bySource) {
    feedbackBySource[row.kind] = Number(row.n);
    feedbackTotal += Number(row.n);
  }

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * DAY_MS);
  const byDayRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${feedback.ingestedAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(feedback)
    .where(and(eq(feedback.productId, product.id), eq(feedback.role, "own"), gte(feedback.ingestedAt, dayStart)))
    .groupBy(sql`1`);
  const counts = new Map(byDayRows.map((r) => [r.day, Number(r.n)]));
  const feedbackByDay = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dayStart.getTime() + i * DAY_MS);
    return { label: DAY_LABELS[d.getUTCDay()], count: counts.get(d.toISOString().slice(0, 10)) ?? 0 };
  });

  return {
    workspaceName: workspace.name,
    productName: product.name,
    weekKey: isoWeekKey(now),
    weekLabel: weekLabel(now),
    topIssues: top.map(toDigestIssue),
    newIssues: newIssues.map(toDigestIssue),
    newCount: Number(newCount),
    worsened: worsened.map(toDigestIssue),
    worsenedCount: Number(worsenedCount),
    resolved: resolved.map(toDigestIssue),
    feedbackBySource,
    feedbackTotal,
    feedbackByDay,
    listUrl: absoluteUrl("/dashboard"),
    settingsUrl: absoluteUrl("/settings/account"),
  };
}

/**
 * Sends this week's Monday digest to every workspace that has a product with
 * a successful run in the last 14 days, is due (see digestSlot: always in
 * "weekly" mode, from 9:00 local on Monday in "local" mode) and has not had
 * one this week. One email per product per recipient, plus a Slack summary on
 * paid plans. Each workspace is claimed in `digest_sends` before sending so
 * overlapping invocations never double-send.
 *
 * Stops claiming new workspaces once `budgetMs` is spent and reports how many
 * due workspaces are left, so the cron route can hand them to a follow-up call.
 */
export async function sendWeeklyDigests(opts?: {
  now?: Date;
  workspaceId?: string;
  budgetMs?: number;
  mode?: DigestScheduleMode;
}): Promise<{ sent: number; skipped: number; remaining: number }> {
  const started = Date.now();
  const now = opts?.now ?? new Date();
  const mode = opts?.mode ?? parseDigestMode(env.DIGEST_SCHEDULE);
  const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS);

  const recentRuns = await db
    .selectDistinct({ workspaceId: runs.workspaceId, productId: runs.productId })
    .from(runs)
    .where(
      and(
        eq(runs.status, "succeeded"),
        gte(runs.createdAt, activeSince),
        opts?.workspaceId ? eq(runs.workspaceId, opts.workspaceId) : undefined,
      ),
    );
  const productsByWorkspace = new Map<string, Set<string>>();
  for (const r of recentRuns) {
    const set = productsByWorkspace.get(r.workspaceId) ?? new Set<string>();
    set.add(r.productId);
    productsByWorkspace.set(r.workspaceId, set);
  }

  const workspaceRows =
    productsByWorkspace.size > 0
      ? await db.select().from(workspaces).where(inArray(workspaces.id, Array.from(productsByWorkspace.keys())))
      : [];
  const workspaceById = new Map(workspaceRows.map((w) => [w.id, w]));

  // Only workspaces whose send time has come; already-sent ones are filtered by the claim below.
  const due: Array<{ workspace: Workspace; productIds: Set<string>; weekKey: string }> = [];
  for (const [workspaceId, productIds] of productsByWorkspace) {
    const workspace = workspaceById.get(workspaceId);
    if (!workspace) continue;
    const slot = digestSlot(now, workspace.timezone, mode);
    if (slot.due) due.push({ workspace, productIds, weekKey: slot.weekKey });
  }

  let sent = 0;
  let skipped = 0;
  let processedCount = 0;

  for (const { workspace, productIds, weekKey } of due) {
    if (opts?.budgetMs !== undefined && Date.now() - started > opts.budgetMs) break;
    processedCount++;
    const workspaceId = workspace.id;

    const [claim] = await db
      .insert(digestSends)
      .values({ workspaceId, weekKey, recipients: 0, sentAt: now })
      .onConflictDoNothing()
      .returning({ id: digestSends.id });
    if (!claim) {
      skipped++;
      continue;
    }

    try {
      const recipients = await getWorkspaceRecipients(workspaceId, "digest");
      const productRows = await db
        .select()
        .from(products)
        .where(and(inArray(products.id, Array.from(productIds)), isNull(products.archivedAt)))
        .orderBy(asc(products.createdAt));

      if (productRows.length === 0) {
        skipped++;
        continue;
      }

      let delivered = 0;
      let attempted = 0;
      for (const product of productRows) {
        const data = await buildDigestData(workspace, product, now);
        const email = renderDigestEmail(data);
        for (const r of recipients) {
          attempted++;
          try {
            const res = await sendEmail({
              to: r.email,
              subject: email.subject,
              html: email.html,
              text: email.text,
              tags: [
                { name: "type", value: "digest" },
                { name: "week", value: weekKey },
              ],
            });
            if (!res.skipped) delivered++;
          } catch (err) {
            console.warn(`[digest] email to a member of ${workspaceId} failed`, err);
          }
        }
        if (await postToWorkspaceSlack(workspaceId, buildSlackDigest(data))) delivered++;
      }

      if (attempted > 0 && delivered === 0 && recipients.length > 0) {
        // Nothing went out (email provider down or misconfigured): release the claim so a retry can send.
        await db.delete(digestSends).where(eq(digestSends.id, claim.id));
        skipped++;
        continue;
      }
      await db.update(digestSends).set({ recipients: recipients.length }).where(eq(digestSends.id, claim.id));
      if (delivered > 0) sent++;
      else skipped++;
    } catch (err) {
      console.error(`[digest] workspace ${workspaceId} failed`, err);
      await db.delete(digestSends).where(eq(digestSends.id, claim.id)).catch(() => undefined);
      skipped++;
    }
  }

  return { sent, skipped, remaining: due.length - processedCount };
}
