import "server-only";

import { eq } from "drizzle-orm";
import { hasRole, type SessionContext } from "@/lib/auth/session";
import { detectCurrency } from "@/lib/billing/currency";
import { getUsageSummary, getWorkspacePlan, type UsageSummary } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import {
  subscriptions,
  type BillingInterval,
  type Currency,
  type PlanId,
  type SubscriptionStatus,
  type Workspace,
} from "@/lib/db/schema";
import { isBillingConfigured } from "@/lib/env";
import { PLANS } from "@/lib/plans";

export type PaidPlan = Exclude<PlanId, "free">;

/** Response body of GET /api/billing/status (BUILD_CONTRACTS 7.4). */
export interface BillingStatusBody {
  plan: PlanId;
  status: SubscriptionStatus | "trialing";
  trialEndsAt: string | null;
  interval: BillingInterval | null;
  currency: Currency | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: UsageSummary;
  billingEnabled: boolean;
  suggestedCurrency: Currency;
  canManage: boolean;
}

/** "Pro, billed monthly", "Team, billed yearly". */
export function checkoutDescription(plan: PaidPlan, interval: BillingInterval): string {
  return `${PLANS[plan].name}, billed ${interval === "month" ? "monthly" : "yearly"}`;
}

/** Statuses where Razorpay is still charging (or about to charge) the subscription. */
const LIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  "active",
  "authenticated",
  "past_due",
]);

type PlanFields = Pick<
  Workspace,
  "plan" | "planStatus" | "planInterval" | "cancelAtPeriodEnd" | "razorpaySubscriptionId"
>;

/**
 * Checkout is refused when the workspace already pays for the same plan and
 * interval and has not cancelled it. Returns the human message for the 409,
 * or null when checkout may proceed (new plan, new interval, or a cancelled
 * subscription the customer wants to restart).
 */
export function findCheckoutConflict(ws: PlanFields, plan: PaidPlan, interval: BillingInterval): string | null {
  if (ws.plan !== plan || ws.planInterval !== interval) return null;
  if (!LIVE_STATUSES.has(ws.planStatus)) return null;
  if (ws.cancelAtPeriodEnd) return null;
  return `You are already on ${PLANS[plan].name}, billed ${interval === "month" ? "monthly" : "yearly"}.`;
}

/** The suggested checkout currency: what the workspace already pays in, else the visitor's country. */
export function suggestCurrency(ws: Pick<Workspace, "planCurrency">, headers: Headers): Currency {
  return ws.planCurrency ?? detectCurrency(headers);
}

export async function loadBillingStatus(ctx: SessionContext, headers: Headers): Promise<BillingStatusBody> {
  const [state, usage] = await Promise.all([
    getWorkspacePlan(ctx.workspace.id),
    getUsageSummary(ctx.workspace.id),
  ]);
  return {
    plan: state.plan.id,
    status: state.status,
    trialEndsAt: state.trialEndsAt ? state.trialEndsAt.toISOString() : null,
    interval: state.interval,
    currency: state.currency,
    currentPeriodEnd: state.currentPeriodEnd ? state.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    usage,
    billingEnabled: isBillingConfigured(),
    suggestedCurrency: suggestCurrency(ctx.workspace, headers),
    canManage: hasRole(ctx, "admin"),
  };
}

export { otherLiveSubscriptionIds } from "@/lib/billing/sync";

/** The workspace id a subscription belongs to, from our row or the notes we set at creation. */
export async function subscriptionWorkspaceId(
  subscriptionId: string,
  notes: Record<string, string> | undefined,
): Promise<string | null> {
  const [row] = await db
    .select({ workspaceId: subscriptions.workspaceId })
    .from(subscriptions)
    .where(eq(subscriptions.razorpaySubscriptionId, subscriptionId))
    .limit(1);
  return row?.workspaceId ?? notes?.workspace_id ?? null;
}
