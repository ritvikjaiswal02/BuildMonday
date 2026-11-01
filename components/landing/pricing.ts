/**
 * Pure helpers shared by the landing pricing summary and the /pricing page.
 * Client-safe: only reads the plan catalog.
 */
import {
  FEATURE_LABELS,
  LIMIT_LABELS,
  PLANS,
  PLAN_ORDER,
  formatLimit,
  formatPrice,
  isUnlimited,
  type BillingInterval,
  type Currency,
  type FeatureKey,
  type LimitKey,
  type Plan,
  type PlanId,
} from "@/lib/plans";

export const START_FREE_HREF = "/login?next=/onboarding";

/** Where a plan's button goes. Free starts onboarding; paid plans go to billing with the plan preselected. */
export function planCtaHref(planId: PlanId, interval: BillingInterval, signedIn: boolean): string {
  if (planId === "free") return signedIn ? "/dashboard" : START_FREE_HREF;
  const billing = `/billing?plan=${planId}&interval=${interval}`;
  return signedIn ? billing : `/login?next=${encodeURIComponent(billing)}`;
}

/** Button label for a plan column. Verbs, no arrows. */
export function planCtaLabel(planId: PlanId, signedIn: boolean): string {
  if (planId === "free") return signedIn ? "Open dashboard" : "Start free";
  const name = PLANS[planId].name;
  return signedIn ? `Upgrade to ${name}` : `Choose ${name}`;
}

export interface PriceDisplay {
  /** "₹1,499", "$0" */
  amount: string;
  /** "/ month", "/ year", or "" for Free. */
  suffix: string;
  /** One quiet line under the price. */
  note: string;
}

/** Price block for a plan, interval and currency. Yearly is ten times monthly (two months free). */
export function priceDisplay(plan: Plan, currency: Currency, interval: BillingInterval): PriceDisplay {
  const price = plan.prices[currency][interval];
  if (price === 0) {
    return { amount: formatPrice(0, currency), suffix: "", note: "Includes 14 days of Pro. No card needed." };
  }
  if (interval === "year") {
    const perMonth = formatPrice(price / 12, currency);
    return { amount: formatPrice(price, currency), suffix: "/ year", note: `Billed yearly, about ${perMonth} a month.` };
  }
  const yearly = formatPrice(plan.prices[currency].year, currency);
  return { amount: formatPrice(price, currency), suffix: "/ month", note: `Billed monthly, or ${yearly} a year.` };
}

/** How many months a yearly plan saves versus paying monthly (2 with the current catalog). */
export function yearlyMonthsFree(plan: Plan, currency: Currency): number {
  const monthly = plan.prices[currency].month;
  if (monthly <= 0) return 0;
  return Math.round((monthly * 12 - plan.prices[currency].year) / monthly);
}

export type ComparisonValue = { kind: "text"; text: string } | { kind: "bool"; included: boolean };

export interface ComparisonRow {
  key: string;
  label: string;
  hint?: string;
  values: Record<PlanId, ComparisonValue>;
}

export interface ComparisonGroup {
  title: string;
  rows: ComparisonRow[];
}

function historyText(days: number): string {
  if (isUnlimited(days)) return "Unlimited";
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? "1 year" : `${years} years`;
  }
  return `${days} days`;
}

function limitRow(key: LimitKey, hint?: string): ComparisonRow {
  const values = {} as Record<PlanId, ComparisonValue>;
  for (const id of PLAN_ORDER) {
    const n = PLANS[id].limits[key];
    let text = key === "history_days" ? historyText(n) : formatLimit(n);
    if (key === "competitors" && n === 0) text = "None";
    values[id] = { kind: "text", text };
  }
  const label = key === "history_days" ? "History" : LIMIT_LABELS[key];
  return { key, label, hint, values };
}

function featureRow(key: FeatureKey, hint?: string): ComparisonRow {
  const values = {} as Record<PlanId, ComparisonValue>;
  for (const id of PLAN_ORDER) values[id] = { kind: "bool", included: PLANS[id].features[key] };
  return { key, label: FEATURE_LABELS[key], hint, values };
}

function cadenceRow(): ComparisonRow {
  const values = {} as Record<PlanId, ComparisonValue>;
  for (const id of PLAN_ORDER) {
    const plan = PLANS[id];
    const text = plan.features.daily_runs ? "Every day" : "Weekly, on Sunday";
    values[id] = { kind: "text", text };
  }
  return {
    key: "cadence",
    label: "How often sources are checked",
    hint: "Every plan can also run a check on demand.",
    values,
  };
}

/** Full comparison, grouped the way buyers read it. Every limit and feature key appears exactly once. */
export function comparisonGroups(): ComparisonGroup[] {
  return [
    {
      title: "Monitoring",
      rows: [
        cadenceRow(),
        limitRow("products"),
        limitRow("sources_per_product", "App Store, Google Play, Reddit, Hacker News and Trustpilot."),
        featureRow("competitor_tracking"),
        limitRow("competitors"),
        limitRow("feedback_items_per_month", "New items from sources, the widget and the extension."),
        limitRow("manual_runs_per_month"),
        limitRow("history_days"),
      ],
    },
    {
      title: "Analysis",
      rows: [limitRow("prds_per_month"), limitRow("chat_messages_per_month"), featureRow("export")],
    },
    {
      title: "Alerts and filing",
      rows: [featureRow("instant_email_alerts"), featureRow("slack_alerts"), featureRow("auto_file")],
    },
    {
      title: "Collecting feedback",
      rows: [
        limitRow("extension_clips_per_month"),
        featureRow("widget_unbranded"),
      ],
    },
    {
      title: "Team",
      rows: [limitRow("seats"), featureRow("team_members"), featureRow("priority_support")],
    },
  ];
}

/** The Monday email is on every plan; spelled out as its own fact for the plan columns. */
export const EVERY_PLAN_INCLUDES = [
  "The Monday email with your ranked list",
  "Website widget and Chrome extension",
  "Free analyzer, no account needed",
];
