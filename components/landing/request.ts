import "server-only";

import { cookies, headers } from "next/headers";
import { CURRENCY_COOKIE, currencyFromCookie, detectCurrency } from "@/lib/billing/currency";
import { hasSessionCookie } from "@/lib/auth/cookies";
import type { Currency } from "@/lib/plans";

/**
 * The visitor's saved currency choice (bm-currency cookie), else the currency
 * of their country (x-vercel-ip-country). Makes the calling page dynamic.
 */
export function requestCurrency(): Currency {
  try {
    const saved = currencyFromCookie(cookies().get(CURRENCY_COOKIE)?.value);
    if (saved) return saved;
  } catch {
    // No request scope (tests): fall back to the header.
  }
  return detectCurrency(headers());
}

/**
 * Cheap signed-in check for marketing pages: only looks for the Auth.js session cookie.
 * No database or auth call, so it works on deployments without either.
 */
export function requestSignedIn(): boolean {
  try {
    return hasSessionCookie(cookies().getAll().map((c) => c.name));
  } catch {
    return false;
  }
}
