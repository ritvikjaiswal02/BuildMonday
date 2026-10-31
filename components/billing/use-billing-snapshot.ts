"use client";

import * as React from "react";
import type { Currency, PlanId } from "@/lib/plans";
import { guessCurrencyFromTimeZone } from "./copy";

export interface BillingSnapshot {
  plan: PlanId;
  currency: Currency;
  canManage: boolean;
  billingEnabled: boolean;
  /** False until /api/billing/status answered (or failed). */
  loaded: boolean;
}

function browserCurrency(): Currency {
  try {
    return guessCurrencyFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "USD";
  }
}

const FALLBACK: BillingSnapshot = { plan: "free", currency: "USD", canManage: true, billingEnabled: true, loaded: false };

let cached: Promise<BillingSnapshot> | null = null;

function isPlanId(v: unknown): v is PlanId {
  return v === "free" || v === "pro" || v === "team";
}

async function fetchSnapshot(): Promise<BillingSnapshot> {
  const guess = browserCurrency();
  try {
    const res = await fetch("/api/billing/status", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return { ...FALLBACK, currency: guess, loaded: true };
    const body = (await res.json()) as Record<string, unknown>;
    const currency =
      body.currency === "INR" || body.currency === "USD"
        ? body.currency
        : body.suggestedCurrency === "INR" || body.suggestedCurrency === "USD"
          ? body.suggestedCurrency
          : guess;
    return {
      plan: isPlanId(body.plan) ? body.plan : "free",
      currency,
      canManage: body.canManage !== false,
      billingEnabled: body.billingEnabled !== false,
      loaded: true,
    };
  } catch {
    return { ...FALLBACK, currency: guess, loaded: true };
  }
}

/** Forget the cached status, e.g. after a plan change. */
export function invalidateBillingSnapshot(): void {
  cached = null;
}

/**
 * Current plan and display currency for upgrade prompts. Fetches
 * /api/billing/status once per page load, only when `enabled` first becomes
 * true, and falls back to Free plus a time-zone currency guess when signed out
 * or offline.
 */
export function useBillingSnapshot(enabled: boolean, initial?: Partial<BillingSnapshot>): BillingSnapshot {
  const initialRef = React.useRef(initial);
  const [snapshot, setSnapshot] = React.useState<BillingSnapshot>(() => ({ ...FALLBACK, ...initial }));
  const loaded = snapshot.loaded;

  React.useEffect(() => {
    if (!enabled || loaded) return;
    let alive = true;
    const seed = initialRef.current;
    setSnapshot((s) => (s.loaded ? s : { ...s, currency: seed?.currency ?? browserCurrency() }));
    if (!cached) cached = fetchSnapshot();
    cached.then((next) => {
      if (alive) setSnapshot({ ...next, ...(seed?.plan ? { plan: seed.plan } : {}) });
    });
    return () => {
      alive = false;
    };
  }, [enabled, loaded]);

  return snapshot;
}
