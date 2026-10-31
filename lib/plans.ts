/**
 * Plan catalog and pure entitlement helpers. Client-safe: no imports from the
 * database, auth or billing modules (type-only imports are erased).
 *
 * Values follow PRODUCT_SPEC section 8 exactly.
 */
import type { BillingInterval, Currency, PlanId } from "@/lib/db/schema";

export type { PlanId, BillingInterval, Currency } from "@/lib/db/schema";

export type FeatureKey =
  | "daily_runs"
  | "instant_email_alerts"
  | "slack_alerts"
  | "auto_file"
  | "competitor_tracking"
  | "export"
  | "widget_unbranded"
  | "team_members"
  | "priority_support";

export type LimitKey =
  | "products"
  | "sources_per_product"
  | "competitors"
  | "feedback_items_per_month"
  | "manual_runs_per_month"
  | "prds_per_month"
  | "chat_messages_per_month"
  | "extension_clips_per_month"
  | "seats"
  | "history_days";

export type MeteredLimitKey =
  | "feedback_items_per_month"
  | "manual_runs_per_month"
  | "prds_per_month"
  | "chat_messages_per_month"
  | "extension_clips_per_month";

export const UNLIMITED = -1;

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Major units, e.g. { INR: { month: 1499, year: 14990 }, USD: { month: 19, year: 190 } }. */
  prices: Record<Currency, Record<BillingInterval, number>>;
  /** UNLIMITED (-1) means no limit. */
  limits: Record<LimitKey, number>;
  features: Record<FeatureKey, boolean>;
  /** 168 (weekly) or 24 (daily). */
  runIntervalHours: number;
  /** Pricing bullets, plain sentences. */
  highlights: string[];
}

export const PLAN_ORDER: PlanId[] = ["free", "pro", "team"];

export const FEATURE_KEYS: FeatureKey[] = [
  "daily_runs",
  "instant_email_alerts",
  "slack_alerts",
  "auto_file",
  "competitor_tracking",
  "export",
  "widget_unbranded",
  "team_members",
  "priority_support",
];

export const LIMIT_KEYS: LimitKey[] = [
  "products",
  "sources_per_product",
  "competitors",
  "feedback_items_per_month",
  "manual_runs_per_month",
  "prds_per_month",
  "chat_messages_per_month",
  "extension_clips_per_month",
  "seats",
  "history_days",
];

export const METERED_LIMIT_KEYS: MeteredLimitKey[] = [
  "feedback_items_per_month",
  "manual_runs_per_month",
  "prds_per_month",
  "chat_messages_per_month",
  "extension_clips_per_month",
];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Watch one product, get the Monday email.",
    prices: { INR: { month: 0, year: 0 }, USD: { month: 0, year: 0 } },
    limits: {
      products: 1,
      sources_per_product: 3,
      competitors: 0,
      feedback_items_per_month: 500,
      manual_runs_per_month: 4,
      prds_per_month: 3,
      chat_messages_per_month: 20,
      extension_clips_per_month: 100,
      seats: 1,
      history_days: 30,
    },
    features: {
      daily_runs: false,
      instant_email_alerts: false,
      slack_alerts: false,
      auto_file: false,
      competitor_tracking: false,
      export: false,
      widget_unbranded: false,
      team_members: false,
      priority_support: false,
    },
    runIntervalHours: 168,
    highlights: [
      "One product with up to 3 sources.",
      "A weekly check every Sunday, ready for the Monday email.",
      "500 feedback items a month from sources, the widget and the extension.",
      "Website widget and Chrome extension included.",
      "30 days of history.",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Daily monitoring, instant alerts and auto-filed issues.",
    prices: { INR: { month: 1499, year: 14990 }, USD: { month: 19, year: 190 } },
    limits: {
      products: 3,
      sources_per_product: 10,
      competitors: 2,
      feedback_items_per_month: 5000,
      manual_runs_per_month: 60,
      prds_per_month: UNLIMITED,
      chat_messages_per_month: UNLIMITED,
      extension_clips_per_month: UNLIMITED,
      seats: 2,
      history_days: 365,
    },
    features: {
      daily_runs: true,
      instant_email_alerts: true,
      slack_alerts: true,
      auto_file: true,
      competitor_tracking: true,
      export: true,
      widget_unbranded: true,
      team_members: false,
      priority_support: false,
    },
    runIntervalHours: 24,
    highlights: [
      "Up to 3 products with 10 sources each.",
      "Checks every day, with email and Slack alerts for serious new issues.",
      "Files issues to Linear or GitHub once they cross your threshold.",
      "Track 2 competitors and see the complaints you could win on.",
      "5,000 feedback items a month and a year of history.",
      "2 seats, so a co-founder can join.",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    tagline: "More products, more sources, your whole team on the list.",
    prices: { INR: { month: 4999, year: 49990 }, USD: { month: 59, year: 590 } },
    limits: {
      products: 10,
      sources_per_product: 25,
      competitors: 10,
      feedback_items_per_month: 25000,
      manual_runs_per_month: 300,
      prds_per_month: UNLIMITED,
      chat_messages_per_month: UNLIMITED,
      extension_clips_per_month: UNLIMITED,
      seats: 10,
      history_days: 730,
    },
    features: {
      daily_runs: true,
      instant_email_alerts: true,
      slack_alerts: true,
      auto_file: true,
      competitor_tracking: true,
      export: true,
      widget_unbranded: true,
      team_members: true,
      priority_support: true,
    },
    runIntervalHours: 24,
    highlights: [
      "Up to 10 products with 25 sources each.",
      "10 seats with admin roles for your team.",
      "Track 10 competitors per product.",
      "25,000 feedback items a month and two years of history.",
      "Email support with a reply within one business day.",
    ],
  },
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  daily_runs: "Daily checks",
  instant_email_alerts: "Instant email alerts",
  slack_alerts: "Slack alerts",
  auto_file: "Auto-file to Linear and GitHub",
  competitor_tracking: "Competitor tracking",
  export: "Export issues as CSV or JSON",
  widget_unbranded: "Widget without BuildMonday branding",
  team_members: "Admin roles for team members",
  priority_support: "Email support, reply within one business day",
};

export const LIMIT_LABELS: Record<LimitKey, string> = {
  products: "Products",
  sources_per_product: "Sources per product",
  competitors: "Competitors per product",
  feedback_items_per_month: "Feedback items per month",
  manual_runs_per_month: "Manual runs per month",
  prds_per_month: "PRDs per month",
  chat_messages_per_month: "Chat messages per month",
  extension_clips_per_month: "Extension clips per month",
  seats: "Seats",
  history_days: "History (days)",
};

/** Short unit nouns for usage text such as "412 of 500 feedback items". */
export const LIMIT_UNITS: Record<LimitKey, { singular: string; plural: string }> = {
  products: { singular: "product", plural: "products" },
  sources_per_product: { singular: "source", plural: "sources" },
  competitors: { singular: "competitor", plural: "competitors" },
  feedback_items_per_month: { singular: "feedback item", plural: "feedback items" },
  manual_runs_per_month: { singular: "manual run", plural: "manual runs" },
  prds_per_month: { singular: "PRD", plural: "PRDs" },
  chat_messages_per_month: { singular: "chat message", plural: "chat messages" },
  extension_clips_per_month: { singular: "clip", plural: "clips" },
  seats: { singular: "seat", plural: "seats" },
  history_days: { singular: "day", plural: "days" },
};

function isPlanId(id: unknown): id is PlanId {
  return id === "free" || id === "pro" || id === "team";
}

/** Unknown, null or undefined ids resolve to Free. */
export function getPlan(id: PlanId | null | undefined): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS.free;
}

export function hasFeature(plan: PlanId, key: FeatureKey): boolean {
  return getPlan(plan).features[key] === true;
}

export function limitFor(plan: PlanId, key: LimitKey): number {
  return getPlan(plan).limits[key];
}

export function isUnlimited(n: number): boolean {
  return n === UNLIMITED || n < 0;
}

export function formatLimit(n: number): string {
  return isUnlimited(n) ? "Unlimited" : new Intl.NumberFormat("en-US").format(n);
}

function isFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(key);
}

/**
 * Cheapest plan that has the feature, or whose limit is at least `needed`
 * (default: any non-zero allowance). Falls back to the top plan when no plan
 * is enough.
 */
export function minimumPlanFor(key: FeatureKey | LimitKey, needed?: number): PlanId {
  for (const id of PLAN_ORDER) {
    const plan = PLANS[id];
    if (isFeatureKey(key)) {
      if (plan.features[key]) return id;
      continue;
    }
    const limit = plan.limits[key];
    if (isUnlimited(limit)) return id;
    const required = needed ?? 1;
    if (limit >= required) return id;
  }
  return PLAN_ORDER[PLAN_ORDER.length - 1];
}

const PRICE_FORMATTERS: Record<Currency, Intl.NumberFormat> = {
  INR: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0, minimumFractionDigits: 0 }),
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, minimumFractionDigits: 0 }),
};

/** "₹1,499", "$19". Whole major units only. */
export function formatPrice(amount: number, currency: Currency): string {
  return PRICE_FORMATTERS[currency].format(Math.round(amount));
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Next scheduled run for a product on `plan`.
 * Pro and Team: the next daily cron slot (05:00 UTC) that is at least 12 hours
 * after `from`. Runs finish a few minutes after the slot, so adding exactly
 * 24 hours would land just after the next cron and skip a day.
 * Free: the next Sunday 05:00 UTC strictly after `from`, so the Monday digest
 * always has a fresh run behind it.
 */
export const DAILY_RUN_HOUR_UTC = 5;
const MIN_GAP_BETWEEN_DAILY_RUNS_MS = 12 * HOUR_MS;

export function computeNextRunAt(plan: PlanId, from: Date): Date {
  const p = getPlan(plan);
  if (p.features.daily_runs) {
    const slot = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), DAILY_RUN_HOUR_UTC, 0, 0, 0),
    );
    while (slot.getTime() < from.getTime() + MIN_GAP_BETWEEN_DAILY_RUNS_MS) {
      slot.setUTCDate(slot.getUTCDate() + 1);
    }
    return slot;
  }
  const candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 5, 0, 0, 0));
  const daysUntilSunday = (7 - candidate.getUTCDay()) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + daysUntilSunday);
  if (candidate.getTime() <= from.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  return candidate;
}

export interface PlanErrorBody {
  error: string;
  code: "plan_required" | "limit_reached";
  feature?: FeatureKey;
  limit?: LimitKey;
  used?: number;
  max?: number;
  requiredPlan: PlanId;
}

/** For clients handling a 402: returns the typed body, or null if it is not a plan error. */
export function parsePlanError(body: unknown): PlanErrorBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.code !== "plan_required" && b.code !== "limit_reached") return null;
  const requiredPlan = isPlanId(b.requiredPlan) ? b.requiredPlan : "pro";
  const out: PlanErrorBody = {
    error: typeof b.error === "string" ? b.error : "This needs a paid plan.",
    code: b.code,
    requiredPlan,
  };
  if (typeof b.feature === "string" && isFeatureKey(b.feature)) out.feature = b.feature;
  if (typeof b.limit === "string" && (LIMIT_KEYS as string[]).includes(b.limit)) out.limit = b.limit as LimitKey;
  if (typeof b.used === "number") out.used = b.used;
  if (typeof b.max === "number") out.max = b.max;
  return out;
}

/** "Pro and Team" for features available from Pro, "Team" for Team-only features. */
export function plansWith(key: FeatureKey): string {
  const names = PLAN_ORDER.filter((id) => PLANS[id].features[key]).map((id) => PLANS[id].name);
  if (names.length === 0) return "no plan";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
