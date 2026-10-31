import "server-only";

import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  BILLING_INTERVALS,
  CURRENCIES,
  billingEvents,
  products,
  subscriptions,
  workspaces,
  type Subscription,
  type BillingInterval,
  type Currency,
  type PlanId,
  type SubscriptionStatus,
} from "@/lib/db/schema";
import { PLANS, isUnlimited, limitFor } from "@/lib/plans";
import { getWorkspacePlan } from "./entitlements";
import {
  cancelSubscription,
  planFromRazorpayPlanId,
  refundPayment,
  type PaidPlanId,
  type RazorpaySubscription,
} from "./razorpay";

/**
 * Razorpay subscription status -> our status.
 * created, authenticated, active, pending, halted, cancelled, completed, expired, paused.
 */
export function mapRazorpayStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "created":
      return "created";
    case "authenticated":
      return "authenticated";
    case "active":
      return "active";
    case "pending":
      return "past_due";
    case "halted":
    case "paused":
      return "halted";
    case "cancelled":
    case "expired":
      return "cancelled";
    case "completed":
      return "completed";
    default:
      return "created";
  }
}

function fromUnix(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1000) : null;
}

function isPaidPlanId(v: unknown): v is PaidPlanId {
  return v === "pro" || v === "team";
}

/** Plan details from the configured plan ids, else from the notes we set at creation. */
export function resolveSubscriptionPlan(
  sub: RazorpaySubscription,
): { plan: PaidPlanId; interval: BillingInterval; currency: Currency } | null {
  const fromId = planFromRazorpayPlanId(sub.plan_id);
  if (fromId) return fromId;
  const notes = sub.notes ?? {};
  const interval = (BILLING_INTERVALS as readonly string[]).includes(notes.interval) ? (notes.interval as BillingInterval) : null;
  const currency = (CURRENCIES as readonly string[]).includes(notes.currency) ? (notes.currency as Currency) : null;
  if (isPaidPlanId(notes.plan) && interval && currency) {
    return { plan: notes.plan, interval, currency };
  }
  return null;
}

/** Stores a subscription created at checkout before the customer has paid. */
export async function recordPendingSubscription(args: {
  workspaceId: string;
  sub: RazorpaySubscription;
  plan: PlanId;
  interval: BillingInterval;
  currency: Currency;
}): Promise<void> {
  const status = mapRazorpayStatus(args.sub.status);
  await db
    .insert(subscriptions)
    .values({
      workspaceId: args.workspaceId,
      razorpaySubscriptionId: args.sub.id,
      razorpayPlanId: args.sub.plan_id,
      plan: args.plan,
      interval: args.interval,
      currency: args.currency,
      status,
      currentPeriodStart: fromUnix(args.sub.current_start),
      currentPeriodEnd: fromUnix(args.sub.current_end),
    })
    .onConflictDoUpdate({
      target: subscriptions.razorpaySubscriptionId,
      set: {
        razorpayPlanId: args.sub.plan_id,
        plan: args.plan,
        interval: args.interval,
        currency: args.currency,
        status,
        updatedAt: new Date(),
      },
    });
}

const PAID_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>(["active", "authenticated"]);
/** Statuses where a subscription still holds the workspace's plan. */
const LIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>(["active", "authenticated", "past_due"]);

/**
 * Upserts the subscriptions row from Razorpay's view of the subscription, then
 * mirrors it onto the workspace. Another subscription's late events never
 * overwrite a workspace that has moved on to a newer subscription.
 * Returns null when the subscription cannot be tied to a workspace or plan.
 */
export async function syncSubscription(
  sub: RazorpaySubscription,
  opts?: { paymentId?: string; eventStatus?: SubscriptionStatus; cancelAtPeriodEnd?: boolean },
): Promise<{ workspaceId: string; plan: PlanId; status: SubscriptionStatus; owns?: boolean } | null> {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.razorpaySubscriptionId, sub.id))
    .limit(1);

  const workspaceId = existing?.workspaceId ?? sub.notes?.workspace_id;
  if (!workspaceId) {
    console.warn(`[billing] subscription ${sub.id} has no workspace; ignoring`);
    return null;
  }

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) {
    console.warn(`[billing] subscription ${sub.id} points at missing workspace ${workspaceId}`);
    return null;
  }

  const resolved =
    resolveSubscriptionPlan(sub) ??
    (existing ? { plan: existing.plan as PaidPlanId, interval: existing.interval, currency: existing.currency } : null);
  if (!resolved) {
    console.warn(`[billing] subscription ${sub.id} uses an unknown plan ${sub.plan_id}`);
    return null;
  }

  const status = opts?.eventStatus ?? mapRazorpayStatus(sub.status);
  const currentPeriodStart = fromUnix(sub.current_start) ?? existing?.currentPeriodStart ?? null;
  const currentPeriodEnd = fromUnix(sub.current_end) ?? existing?.currentPeriodEnd ?? null;
  const cancelAtPeriodEnd =
    opts?.cancelAtPeriodEnd ??
    (status === "cancelled" || status === "completed" ? true : (existing?.cancelAtPeriodEnd ?? false));

  await db
    .insert(subscriptions)
    .values({
      workspaceId,
      razorpaySubscriptionId: sub.id,
      razorpayPlanId: sub.plan_id,
      plan: resolved.plan,
      interval: resolved.interval,
      currency: resolved.currency,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      lastPaymentId: opts?.paymentId ?? null,
    })
    .onConflictDoUpdate({
      target: subscriptions.razorpaySubscriptionId,
      set: {
        razorpayPlanId: sub.plan_id,
        plan: resolved.plan,
        interval: resolved.interval,
        currency: resolved.currency,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        ...(opts?.paymentId ? { lastPaymentId: opts.paymentId } : {}),
        updatedAt: new Date(),
      },
    });

  // Only mirror onto the workspace when this subscription is (or becomes) the
  // workspace's current one. A "created" subscription has not been paid yet.
  let ownsWorkspace = workspace.razorpaySubscriptionId === null || workspace.razorpaySubscriptionId === sub.id;
  if (!ownsWorkspace && PAID_STATUSES.has(status)) {
    // A different paid subscription may only take over when the workspace's
    // current one is no longer live, or when this one was started (checked out)
    // more recently. A late event from a replaced subscription therefore never
    // flips the plan back.
    const [current] = await db
      .select({ status: subscriptions.status, createdAt: subscriptions.createdAt })
      .from(subscriptions)
      .where(eq(subscriptions.razorpaySubscriptionId, workspace.razorpaySubscriptionId as string))
      .limit(1);
    if (!current || !LIVE_STATUSES.has(current.status)) {
      ownsWorkspace = true;
    } else {
      // No stored row means this subscription was first seen just now.
      const incomingCreated = existing?.createdAt?.getTime() ?? Date.now();
      ownsWorkspace = incomingCreated > current.createdAt.getTime();
    }
  }

  if (ownsWorkspace && status !== "created") {
    await db
      .update(workspaces)
      .set({
        plan: resolved.plan,
        planInterval: resolved.interval,
        planCurrency: resolved.currency,
        planStatus: status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        razorpaySubscriptionId: sub.id,
      })
      .where(eq(workspaces.id, workspaceId));
    // `owns`: this subscription is now the workspace's current one.
    return { workspaceId, plan: resolved.plan, status, owns: true };
  }

  return { workspaceId, plan: workspace.plan, status: workspace.planStatus, owns: false };
}

/**
 * After a downgrade or lapse: turns monitoring off for products beyond the
 * plan's product limit (newest first) and turns auto-filing off when the plan
 * no longer includes it. Never deletes data.
 */
export async function enforcePlanLimits(workspaceId: string): Promise<void> {
  const state = await getWorkspacePlan(workspaceId);
  const planId = state.plan.id;

  const active = await db
    .select({ id: products.id, monitoringEnabled: products.monitoringEnabled })
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), isNull(products.archivedAt)))
    .orderBy(asc(products.createdAt));

  const maxProducts = limitFor(planId, "products");
  if (!isUnlimited(maxProducts) && active.length > maxProducts) {
    const overLimit = active.slice(maxProducts).filter((p) => p.monitoringEnabled);
    for (const p of overLimit) {
      await db.update(products).set({ monitoringEnabled: false }).where(eq(products.id, p.id));
    }
  }

  if (!state.plan.features.auto_file) {
    await db
      .update(products)
      .set({ autofileEnabled: false })
      .where(and(eq(products.workspaceId, workspaceId), eq(products.autofileEnabled, true)));
  }
}

/**
 * Other subscriptions of this workspace that Razorpay may still charge, apart
 * from `keepId`, newest first.
 */
export async function otherLiveSubscriptionIds(workspaceId: string, keepId: string): Promise<string[]> {
  const rows = await db
    .select({ id: subscriptions.razorpaySubscriptionId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        ne(subscriptions.razorpaySubscriptionId, keepId),
        inArray(subscriptions.status, ["active", "authenticated", "past_due"]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt));
  return rows.map((r) => r.id);
}

/** Pure: the unused share of a paid period, in the smallest currency unit (paise or cents). */
export function unusedPeriodCredit(
  sub: Pick<Subscription, "plan" | "interval" | "currency" | "currentPeriodStart" | "currentPeriodEnd">,
  now: Date = new Date(),
): number {
  if (sub.plan === "free" || !sub.currentPeriodStart || !sub.currentPeriodEnd) return 0;
  const start = new Date(sub.currentPeriodStart).getTime();
  const end = new Date(sub.currentPeriodEnd).getTime();
  const at = now.getTime();
  if (!(end > start) || at <= start || at >= end) return 0;
  const price = PLANS[sub.plan].prices[sub.currency][sub.interval];
  return Math.floor(price * 100 * ((end - at) / (end - start)));
}

/** Smaller credits are not worth a refund (1 rupee or 1 cent's worth of rounding). */
const MIN_CREDIT = 100;

/**
 * Refunds the unused part of a replaced subscription's last payment, once.
 * Best effort: a failure is logged (and left in billing_events for support)
 * but never blocks the plan switch.
 */
async function creditUnusedPeriod(row: Subscription): Promise<void> {
  const amount = unusedPeriodCredit(row);
  if (amount < MIN_CREDIT || !row.lastPaymentId) return;
  const eventId = `credit_${row.razorpaySubscriptionId}`;
  const [claimed] = await db
    .insert(billingEvents)
    .values({
      eventId,
      type: "credit.plan_change",
      workspaceId: row.workspaceId,
      payload: { subscriptionId: row.razorpaySubscriptionId, paymentId: row.lastPaymentId, amount, currency: row.currency },
    })
    .onConflictDoNothing({ target: billingEvents.eventId })
    .returning({ id: billingEvents.id });
  if (!claimed) return;
  try {
    await refundPayment(row.lastPaymentId, amount, {
      reason: "plan_change",
      subscription_id: row.razorpaySubscriptionId,
    });
    await db.update(billingEvents).set({ processedAt: new Date() }).where(eq(billingEvents.eventId, eventId));
  } catch (err) {
    console.error(`[billing] could not credit the unused period of ${row.razorpaySubscriptionId}`, err);
  }
}

/**
 * After a workspace moves to `keepId`, cancels every other subscription that
 * could still charge it (now, not at cycle end, so it never bills again) and
 * credits the unused part of the old period. Called from the Checkout verify
 * route and from the webhook, so it also runs when the customer closed the
 * tab before verify. Throws when a cancel fails, so the webhook is retried.
 */
export async function cancelReplacedSubscriptions(workspaceId: string, keepId: string): Promise<string[]> {
  const stale = await otherLiveSubscriptionIds(workspaceId, keepId);
  for (const id of stale) {
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.razorpaySubscriptionId, id)).limit(1);
    const cancelled = await cancelSubscription(id, false);
    await syncSubscription(cancelled, { eventStatus: "cancelled", cancelAtPeriodEnd: true });
    if (row) await creditUnusedPeriod(row);
  }
  return stale;
}
