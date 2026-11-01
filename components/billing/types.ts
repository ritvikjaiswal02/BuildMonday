/**
 * Shapes the billing page passes from the server to client components.
 * Structural copies of the server types so client code never imports lib/billing.
 */
import type { BillingInterval, Currency, MeteredLimitKey, PlanId } from "@/lib/plans";
import type { SubscriptionStatus } from "@/lib/db/schema";

export interface UsageFigure {
  used: number;
  max: number;
}

export interface BillingUsage {
  period: string;
  metrics: Record<MeteredLimitKey, UsageFigure>;
  counts: { products: UsageFigure; seats: UsageFigure };
}

export interface BillingState {
  /** Effective plan right now (after the grace period rules). */
  plan: PlanId;
  /** Plan stored on the workspace; differs from `plan` once a lapsed subscription's grace period is over. */
  storedPlan: PlanId;
  status: SubscriptionStatus | "trialing";
  /** ISO end of the Pro trial while it runs, else null. */
  trialEndsAt: string | null;
  interval: BillingInterval | null;
  currency: Currency | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isPaid: boolean;
}

export interface BillingPreselect {
  plan: Exclude<PlanId, "free"> | null;
  interval: BillingInterval | null;
  currency: Currency | null;
}
