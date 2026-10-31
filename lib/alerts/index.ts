import "server-only";

import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { decryptSecret } from "@/lib/auth/crypto";
import { sendEmail } from "@/lib/auth/mailer";
import { getWorkspaceRecipients } from "@/lib/auth/workspace";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import {
  alerts,
  integrations,
  issueSnapshots,
  issues,
  products,
  type AlertKind,
  type Run,
  type TrackerTarget,
} from "@/lib/db/schema";
import { absoluteUrl } from "@/lib/env";
import {
  buildSlackAlert,
  buildSlackAutofiled,
  renderAlertEmail,
  selectAlertIssues,
  type AlertCandidate,
} from "./render";
import { postSlackMessage } from "./slack";

export { postSlackMessage, isValidSlackWebhook, slackEscape } from "./slack";
export {
  selectAlertIssues,
  renderAlertEmail,
  buildSlackAlert,
  buildSlackAutofiled,
  alertSubject,
  type AlertCandidate,
} from "./render";

const WORSENED_COOLDOWN_MS = 72 * 60 * 60 * 1000;

/**
 * The workspace's decrypted Slack webhook URL, or null when Slack is not
 * connected or the secret cannot be read.
 */
export async function getSlackWebhookUrl(workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, "slack")))
    .limit(1);
  if (!row) return null;
  try {
    return decryptSecret(row.secretEncrypted);
  } catch (err) {
    console.error("[alerts] could not decrypt the Slack webhook", err);
    return null;
  }
}

/** Records a Slack delivery failure on the integration so Settings can show it. */
export async function markSlackError(workspaceId: string, message: string | null): Promise<void> {
  try {
    await db
      .update(integrations)
      .set({ status: message ? "error" : "connected", lastError: message })
      .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, "slack")));
  } catch (err) {
    console.warn("[alerts] could not update Slack status", err);
  }
}

/** Posts to the workspace's Slack if connected and allowed; never throws. Returns true when delivered. */
export async function postToWorkspaceSlack(
  workspaceId: string,
  message: { text: string; blocks?: unknown[] },
): Promise<boolean> {
  const plan = await getWorkspacePlan(workspaceId);
  if (!plan.plan.features.slack_alerts) return false;
  const url = await getSlackWebhookUrl(workspaceId);
  if (!url) return false;
  try {
    await postSlackMessage(url, message);
    await markSlackError(workspaceId, null);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Slack rejected the message.";
    console.warn("[alerts] Slack post failed", msg);
    await markSlackError(workspaceId, msg);
    return false;
  }
}

/**
 * Sends the alerts for one run: one email per recipient (serious or all,
 * by their alert mode) and one Slack message with the serious issues.
 * Respects plan features, dedupes through the `alerts` table, never throws.
 * Returns the number of issues that were alerted on at least one channel.
 */
export async function sendRunAlerts(run: Run): Promise<number> {
  try {
    return await sendRunAlertsUnsafe(run);
  } catch (err) {
    console.error("[alerts] sending run alerts failed", err);
    return 0;
  }
}

async function sendRunAlertsUnsafe(run: Run): Promise<number> {
  const newIds = run.stats.newIssueIds ?? [];
  const worsenedIds = run.stats.worsenedIssueIds ?? [];
  const ids = Array.from(new Set([...newIds, ...worsenedIds]));
  if (ids.length === 0) return 0;

  const planState = await getWorkspacePlan(run.workspaceId);
  const emailOn = planState.plan.features.instant_email_alerts;
  const slackOn = planState.plan.features.slack_alerts;
  if (!emailOn && !slackOn) return 0;

  const [product] = await db.select().from(products).where(eq(products.id, run.productId)).limit(1);
  if (!product) return 0;

  const rows = await db
    .select()
    .from(issues)
    .where(and(inArray(issues.id, ids), eq(issues.productId, run.productId), eq(issues.scope, "own"), ne(issues.status, "ignored")));
  if (rows.length === 0) return 0;

  const previous = new Map<string, number>();
  if (worsenedIds.length > 0) {
    const snaps = await db
      .select({ issueId: issueSnapshots.issueId, frequency: issueSnapshots.frequency })
      .from(issueSnapshots)
      .where(and(inArray(issueSnapshots.issueId, worsenedIds), ne(issueSnapshots.runId, run.id)))
      .orderBy(desc(issueSnapshots.createdAt));
    for (const s of snaps) if (!previous.has(s.issueId)) previous.set(s.issueId, s.frequency);
  }

  const prior = await db
    .select({ issueId: alerts.issueId, kind: alerts.kind, createdAt: alerts.createdAt })
    .from(alerts)
    .where(and(inArray(alerts.issueId, ids), ne(alerts.kind, "autofiled")));
  const alreadyAlertedNew = new Set(prior.filter((a) => a.kind === "new_issue").map((a) => a.issueId));
  const cutoff = Date.now() - WORSENED_COOLDOWN_MS;
  const recentlyAlertedWorsened = new Set(
    prior.filter((a) => a.kind === "worsened" && a.createdAt.getTime() > cutoff).map((a) => a.issueId),
  );

  const newSet = new Set(newIds);
  const candidates: AlertCandidate[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: newSet.has(r.id) ? "new_issue" : "worsened",
    priorityScore: r.priorityScore,
    recommendedAction: r.recommendedAction,
    frequency: r.frequency,
    previousFrequency: previous.get(r.id) ?? null,
    quote: r.evidence?.[0] ?? null,
    url: absoluteUrl(`/issues/${r.id}`),
  }));

  const { serious, all } = selectAlertIssues({
    candidates,
    threshold: product.alertThreshold,
    alreadyAlertedNew,
    recentlyAlertedWorsened,
  });
  if (all.length === 0) return 0;

  const delivered = new Map<string, Set<"email" | "slack">>();
  const mark = (list: AlertCandidate[], channel: "email" | "slack") => {
    for (const c of list) {
      const set = delivered.get(c.id) ?? new Set();
      set.add(channel);
      delivered.set(c.id, set);
    }
  };

  const dashboardUrl = absoluteUrl("/dashboard");
  const settingsUrl = absoluteUrl("/settings/alerts");

  if (emailOn) {
    const recipients = await getWorkspaceRecipients(run.workspaceId, "alerts");
    const groups: Array<{ list: AlertCandidate[]; emails: string[] }> = [
      { list: serious, emails: recipients.filter((r) => r.alertMode === "serious").map((r) => r.email) },
      { list: all, emails: recipients.filter((r) => r.alertMode === "all").map((r) => r.email) },
    ];
    for (const group of groups) {
      if (group.list.length === 0 || group.emails.length === 0) continue;
      const email = renderAlertEmail({ productName: product.name, issues: group.list, dashboardUrl, settingsUrl });
      const results = await Promise.allSettled(
        group.emails.map((to) =>
          sendEmail({ to, subject: email.subject, html: email.html, text: email.text, tags: [{ name: "type", value: "alert" }] }),
        ),
      );
      const ok = results.some((r) => r.status === "fulfilled" && !r.value.skipped);
      results.forEach((r) => {
        if (r.status === "rejected") console.warn("[alerts] email failed", r.reason);
      });
      if (ok) mark(group.list, "email");
    }
  }

  if (slackOn && serious.length > 0) {
    const sent = await postToWorkspaceSlack(
      run.workspaceId,
      buildSlackAlert({ productName: product.name, issues: serious, dashboardUrl }),
    );
    if (sent) mark(serious, "slack");
  }

  if (delivered.size === 0) return 0;

  const byId = new Map(candidates.map((c) => [c.id, c]));
  await db
    .insert(alerts)
    .values(
      Array.from(delivered.entries()).map(([issueId, channels]) => ({
        workspaceId: run.workspaceId,
        productId: run.productId,
        issueId,
        runId: run.id,
        kind: (byId.get(issueId)?.kind ?? "new_issue") as AlertKind,
        channels: Array.from(channels),
      })),
    )
    .onConflictDoNothing();

  return delivered.size;
}

/**
 * Records `autofiled` alert rows and posts one Slack message listing the
 * filed issues. Never throws.
 */
export async function notifyAutofiled(args: {
  run: Run;
  productName: string;
  filed: Array<{ issueId: string; title: string; externalUrl: string; target: TrackerTarget }>;
}): Promise<void> {
  if (args.filed.length === 0) return;
  try {
    const sent = await postToWorkspaceSlack(
      args.run.workspaceId,
      buildSlackAutofiled({
        productName: args.productName,
        filed: args.filed.map((f) => ({ ...f, issueUrl: absoluteUrl(`/issues/${f.issueId}`) })),
      }),
    );
    await db
      .insert(alerts)
      .values(
        args.filed.map((f) => ({
          workspaceId: args.run.workspaceId,
          productId: args.run.productId,
          issueId: f.issueId,
          runId: args.run.id,
          kind: "autofiled" as const,
          channels: sent ? (["slack"] as Array<"email" | "slack">) : [],
        })),
      )
      .onConflictDoNothing();
  } catch (err) {
    console.error("[alerts] autofile notification failed", err);
  }
}

/** Alerts sent for one issue recently, newest first (for the issue page). */
export async function recentAlertsForIssue(issueId: string, sinceMs = 30 * 24 * 60 * 60 * 1000) {
  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.issueId, issueId), gt(alerts.createdAt, new Date(Date.now() - sinceMs))))
    .orderBy(desc(alerts.createdAt));
}
