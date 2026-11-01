/**
 * Pure, client-safe copy and formatting helpers for billing UI. No React.
 */
import {
  FEATURE_LABELS,
  LIMIT_LABELS,
  PLANS,
  PLAN_ORDER,
  formatLimit,
  formatPrice,
  isUnlimited,
  minimumPlanFor,
  plansWith,
  type BillingInterval,
  type Currency,
  type FeatureKey,
  type LimitKey,
  type PlanId,
} from "@/lib/plans";
import type { SubscriptionStatus } from "@/lib/db/schema";

export type PaidPlanId = Exclude<PlanId, "free">;

/** Feature labels that read as plural nouns take "are". */
const PLURAL_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "daily_runs",
  "instant_email_alerts",
  "slack_alerts",
  "team_members",
]);

/** "Slack alerts are on Pro and Team." */
export function featureGateMessage(key: FeatureKey): string {
  return `${FEATURE_LABELS[key]} ${PLURAL_FEATURES.has(key) ? "are" : "is"} on ${plansWith(key)}.`;
}

/** The paid plan to suggest. Never Free: a Free requirement means "any paid plan", so Pro. */
export function resolveRequiredPlan(opts: {
  feature?: FeatureKey;
  limit?: LimitKey;
  requiredPlan?: PaidPlanId;
  current?: PlanId;
}): PaidPlanId {
  if (opts.requiredPlan) return opts.requiredPlan;
  let needed: PlanId = "pro";
  if (opts.feature) {
    needed = minimumPlanFor(opts.feature);
  } else if (opts.limit) {
    const current = opts.current ?? "free";
    const currentMax = PLANS[current].limits[opts.limit];
    needed = isUnlimited(currentMax) ? current : minimumPlanFor(opts.limit, currentMax + 1);
  }
  if (needed === "free") return "pro";
  return needed;
}

export function planRank(plan: PlanId): number {
  return PLAN_ORDER.indexOf(plan);
}

/** Days-and-month date, with the year: "12 Dec 2026". */
export function formatBillingDate(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** "November 2026" for a "2026-11" usage period. */
export function formatPeriod(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

/** First day of the month after a "2026-11" period: "1 Dec 2026". */
export function periodResetDate(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return "";
  return formatBillingDate(new Date(Date.UTC(Number(match[1]), Number(match[2]), 1)));
}

/** "₹1,499 / month", "$190 / year". */
export function priceLabel(plan: PlanId, currency: Currency, interval: BillingInterval): string {
  const amount = PLANS[plan].prices[currency][interval];
  return `${formatPrice(amount, currency)} / ${interval}`;
}

/** Monthly equivalent of a yearly price: "₹1,249". */
export function perMonthOfYearly(plan: PlanId, currency: Currency): string {
  return formatPrice(PLANS[plan].prices[currency].year / 12, currency);
}

/** Guess the currency in the browser when the server has not told us: India's zone means INR. */
export function guessCurrencyFromTimeZone(timeZone: string | undefined | null): Currency {
  return timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta" ? "INR" : "USD";
}

export type UsageTone = "brand" | "warning" | "danger";

/** brand below 80%, warning from 80 to 99%, danger at 100% and above. */
export function usageTone(used: number, limit: number): UsageTone {
  if (isUnlimited(limit)) return "brand";
  if (limit <= 0) return used > 0 ? "danger" : "brand";
  const ratio = used / limit;
  if (ratio >= 1) return "danger";
  if (ratio >= 0.8) return "warning";
  return "brand";
}

/** "412 of 500 feedback items", "1,204 feedback items" (unlimited). */
export function usageText(used: number, limit: number, unit?: string): string {
  const fmt = new Intl.NumberFormat("en-US");
  const tail = unit ? ` ${unit}` : "";
  if (isUnlimited(limit)) return `${fmt.format(used)}${tail}`;
  return `${fmt.format(used)} of ${fmt.format(limit)}${tail}`;
}

/** One line under the current plan saying what happens next. */
export function subscriptionStatusLine(args: {
  plan: PlanId;
  status: SubscriptionStatus | "trialing";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt?: string | null;
}): { text: string; tone: "neutral" | "warning" | "danger" } {
  const name = PLANS[args.plan].name;
  const end = formatBillingDate(args.currentPeriodEnd);
  if (args.status === "trialing") {
    const trialEnd = formatBillingDate(args.trialEndsAt ?? null);
    return {
      text: trialEnd
        ? `Free ${name} trial until ${trialEnd}. After that you keep the Free plan unless you upgrade. Nothing is deleted.`
        : `Free ${name} trial. After it ends you keep the Free plan unless you upgrade.`,
      tone: "neutral",
    };
  }
  if (args.plan === "free") {
    return { text: "Weekly check every Sunday and the Monday email. No card on file.", tone: "neutral" };
  }
  if (args.status === "past_due") {
    return {
      text: end
        ? `Your last payment did not go through. Razorpay will retry it; ${name} stays on until at least ${end}.`
        : `Your last payment did not go through. Razorpay will retry it.`,
      tone: "danger",
    };
  }
  if (args.status === "halted") {
    return {
      text: `Razorpay stopped retrying the payment. Subscribe again to keep ${name}.`,
      tone: "danger",
    };
  }
  if (args.cancelAtPeriodEnd || args.status === "cancelled" || args.status === "completed") {
    return {
      text: end
        ? `Cancelled. You keep ${name} until ${end}, then the workspace moves to Free.`
        : `Cancelled. The workspace moves to Free at the end of the paid period.`,
      tone: "warning",
    };
  }
  return { text: end ? `Renews on ${end}.` : "Active.", tone: "neutral" };
}

/** Rows for the plan comparison in UpgradeDialog: the locked item first, then the most telling limits. */
export type CompareRow =
  | { kind: "limit"; key: LimitKey; label: string; highlight: boolean }
  | { kind: "feature"; key: FeatureKey; label: string; highlight: boolean };

const DEFAULT_ROWS: Array<{ kind: "limit"; key: LimitKey } | { kind: "feature"; key: FeatureKey }> = [
  { kind: "feature", key: "daily_runs" },
  { kind: "limit", key: "products" },
  { kind: "limit", key: "sources_per_product" },
  { kind: "limit", key: "feedback_items_per_month" },
  { kind: "feature", key: "instant_email_alerts" },
  { kind: "feature", key: "auto_file" },
];

export function compareRows(opts: { feature?: FeatureKey; limit?: LimitKey }, max = 6): CompareRow[] {
  const rows: CompareRow[] = [];
  if (opts.feature) rows.push({ kind: "feature", key: opts.feature, label: FEATURE_LABELS[opts.feature], highlight: true });
  if (opts.limit) rows.push({ kind: "limit", key: opts.limit, label: LIMIT_LABELS[opts.limit], highlight: true });
  for (const row of DEFAULT_ROWS) {
    if (rows.length >= max) break;
    if (rows.some((r) => r.kind === row.kind && r.key === row.key)) continue;
    rows.push(
      row.kind === "feature"
        ? { kind: "feature", key: row.key, label: FEATURE_LABELS[row.key], highlight: false }
        : { kind: "limit", key: row.key, label: LIMIT_LABELS[row.key], highlight: false },
    );
  }
  return rows;
}

/** Cell value for a limit: "3", "Unlimited", "Not included" for 0. */
export function limitCell(plan: PlanId, key: LimitKey): string {
  const n = PLANS[plan].limits[key];
  if (n === 0) return "Not included";
  return formatLimit(n);
}
