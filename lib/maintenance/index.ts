import "server-only";

import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, notInArray, sql } from "drizzle-orm";
import { sendEmail } from "@/lib/auth/mailer";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import { enforcePlanLimits } from "@/lib/billing/sync";
import { db } from "@/lib/db";
import {
  alerts,
  feedback,
  issueSnapshots,
  issues,
  products,
  runs,
  users,
  workspaceMembers,
  workspaces,
  type SubscriptionStatus,
} from "@/lib/db/schema";
import { absoluteUrl } from "@/lib/env";
import { computeNextRunAt, limitFor } from "@/lib/plans";
import { renderTrialEndingEmail } from "./emails";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The reminder goes out on day 12 of 14. */
const REMINDER_BEFORE_MS = 2 * DAY_MS;
/** Rows deleted per statement, so a large workspace never holds a long lock. */
const DELETE_CHUNK = 2_000;
const PAID: SubscriptionStatus[] = ["active", "authenticated", "past_due"];

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

export interface MaintenanceResult {
  trialReminders: number;
  trialsEnded: number;
  retention: { workspaces: number; feedback: number; runs: number; issues: number };
  complete: boolean;
}

/** Emails owners and admins two days before the Pro trial ends (workspaces that have not paid). */
async function sendTrialReminders(now: Date): Promise<number> {
  const due = await db
    .select()
    .from(workspaces)
    .where(
      and(
        isNotNull(workspaces.trialEndsAt),
        isNull(workspaces.trialReminderSentAt),
        gt(workspaces.trialEndsAt, now),
        lte(workspaces.trialEndsAt, new Date(now.getTime() + REMINDER_BEFORE_MS)),
        notInArray(workspaces.planStatus, PAID),
      ),
    )
    .limit(200);

  let sent = 0;
  for (const ws of due) {
    // Claim first so overlapping runs never send twice.
    const [claimed] = await db
      .update(workspaces)
      .set({ trialReminderSentAt: now })
      .where(and(eq(workspaces.id, ws.id), isNull(workspaces.trialReminderSentAt)))
      .returning({ id: workspaces.id });
    if (!claimed || !ws.trialEndsAt) continue;

    const admins = await db
      .select({ email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, ws.id), inArray(workspaceMembers.role, ["owner", "admin"])));
    const [{ n: issuesFound }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(issues)
      .where(eq(issues.workspaceId, ws.id));
    const [{ n: alertsSent }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(alerts)
      .where(eq(alerts.workspaceId, ws.id));

    const daysLeft = Math.max(1, Math.ceil((ws.trialEndsAt.getTime() - now.getTime()) / DAY_MS));
    const email = renderTrialEndingEmail({
      workspaceName: ws.name,
      daysLeft,
      endsOn: DATE.format(ws.trialEndsAt),
      billingUrl: absoluteUrl("/billing?plan=pro&interval=year"),
      issuesFound: Number(issuesFound),
      alertsSent: Number(alertsSent),
    });
    let delivered = false;
    for (const a of admins) {
      try {
        const res = await sendEmail({
          to: a.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          tags: [{ name: "type", value: "trial_ending" }],
        });
        if (!res.skipped) delivered = true;
      } catch (err) {
        console.warn(`[maintenance] trial reminder for ${ws.id} failed`, err);
      }
    }
    if (delivered) sent++;
    else await db.update(workspaces).set({ trialReminderSentAt: null }).where(eq(workspaces.id, ws.id));
  }
  return sent;
}

/**
 * Applies the downgrade rules (PRODUCT_SPEC 8.3) to workspaces whose trial
 * ended without a subscription: products beyond the Free limit stop
 * monitoring, auto-filing turns off, the next run moves to the weekly slot.
 * Nothing is deleted.
 */
async function endTrials(now: Date): Promise<number> {
  const ended = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(isNotNull(workspaces.trialEndsAt), lte(workspaces.trialEndsAt, now), isNull(workspaces.trialEndedAt)))
    .limit(200);
  let count = 0;
  for (const { id } of ended) {
    const [claimed] = await db
      .update(workspaces)
      .set({ trialEndedAt: now })
      .where(and(eq(workspaces.id, id), isNull(workspaces.trialEndedAt)))
      .returning({ id: workspaces.id });
    if (!claimed) continue;
    try {
      const state = await getWorkspacePlan(id);
      if (state.isPaid) continue; // They upgraded; nothing to undo.
      await enforcePlanLimits(id);
      await db
        .update(products)
        .set({ nextRunAt: computeNextRunAt(state.plan.id, now) })
        .where(and(eq(products.workspaceId, id), isNull(products.archivedAt)));
      count++;
    } catch (err) {
      console.error(`[maintenance] could not end the trial of ${id}`, err);
      await db.update(workspaces).set({ trialEndedAt: null }).where(eq(workspaces.id, id));
    }
  }
  return count;
}

async function deleteInChunks(run: () => Promise<number>, deadline: number): Promise<number> {
  let total = 0;
  for (;;) {
    const n = await run();
    total += n;
    if (n < DELETE_CHUNK || Date.now() > deadline) return total;
  }
}

/**
 * Keeps the published retention promise: feedback, runs (and their
 * snapshots) and issues older than the plan's history window are deleted.
 */
async function sweepRetention(now: Date, deadline: number): Promise<MaintenanceResult["retention"] & { complete: boolean }> {
  const out = { workspaces: 0, feedback: 0, runs: 0, issues: 0, complete: true };
  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  for (const { id } of rows) {
    if (Date.now() > deadline) {
      out.complete = false;
      break;
    }
    const state = await getWorkspacePlan(id);
    const days = limitFor(state.plan.id, "history_days");
    if (days < 0) continue;
    const cutoff = new Date(now.getTime() - days * DAY_MS);

    const fb = await deleteInChunks(async () => {
      const deleted = await db
        .delete(feedback)
        .where(
          inArray(
            feedback.id,
            db
              .select({ id: feedback.id })
              .from(feedback)
              .where(and(eq(feedback.workspaceId, id), lt(sql`coalesce(${feedback.postedAt}, ${feedback.ingestedAt})`, cutoff)))
              .limit(DELETE_CHUNK),
          ),
        )
        .returning({ id: feedback.id });
      return deleted.length;
    }, deadline);

    const oldRuns = await deleteInChunks(async () => {
      const deleted = await db
        .delete(runs)
        .where(
          inArray(
            runs.id,
            db
              .select({ id: runs.id })
              .from(runs)
              .where(and(eq(runs.workspaceId, id), lt(runs.createdAt, cutoff)))
              .limit(DELETE_CHUNK),
          ),
        )
        .returning({ id: runs.id });
      return deleted.length;
    }, deadline);

    await db
      .delete(issueSnapshots)
      .where(
        and(
          lt(issueSnapshots.createdAt, cutoff),
          inArray(issueSnapshots.productId, db.select({ id: products.id }).from(products).where(eq(products.workspaceId, id))),
        ),
      );

    const oldIssues = await db
      .delete(issues)
      .where(and(eq(issues.workspaceId, id), lt(issues.lastSeenAt, cutoff)))
      .returning({ id: issues.id });

    out.feedback += fb;
    out.runs += oldRuns;
    out.issues += oldIssues.length;
    if (fb + oldRuns + oldIssues.length > 0) out.workspaces++;
  }
  return out;
}

/** The daily maintenance job: trial reminders, trial expiry and the retention sweep, within `budgetMs`. */
export async function runMaintenance(opts: { budgetMs: number; now?: Date }): Promise<MaintenanceResult> {
  const now = opts.now ?? new Date();
  const deadline = Date.now() + opts.budgetMs;
  const trialReminders = await sendTrialReminders(now);
  const trialsEnded = await endTrials(now);
  const { complete, ...retention } = await sweepRetention(now, deadline);
  return { trialReminders, trialsEnded, retention, complete };
}
