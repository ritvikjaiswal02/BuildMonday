import type { BillingInterval, Currency } from "@/lib/plans";
import type { BillingPreselect } from "./types";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Reads ?plan=pro|team&interval=month|year&currency=INR|USD from /billing, ignoring anything else. */
export function parsePreselect(params: SearchParams | null | undefined): BillingPreselect {
  const p = params ?? {};
  const plan = first(p.plan);
  const interval = first(p.interval);
  const currency = first(p.currency)?.toUpperCase();
  return {
    plan: plan === "pro" || plan === "team" ? plan : null,
    interval: interval === "month" || interval === "year" ? (interval as BillingInterval) : null,
    currency: currency === "INR" || currency === "USD" ? (currency as Currency) : null,
  };
}
