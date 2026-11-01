/** Pure and client-safe: decides INR or USD for a visitor. */
import type { Currency } from "@/lib/db/schema";

/** Cookie holding a visitor's manual currency choice on the pricing page. */
export const CURRENCY_COOKIE = "bm-currency";

/** "INR" | "USD" from a cookie value, else null. */
export function currencyFromCookie(value: string | null | undefined): Currency | null {
  return value === "INR" || value === "USD" ? value : null;
}

/** "IN" -> "INR", anything else (including unknown) -> "USD". */
export function currencyFromCountry(country: string | null | undefined): Currency {
  return country?.trim().toUpperCase() === "IN" ? "INR" : "USD";
}

/** Uses Vercel's x-vercel-ip-country header. */
export function detectCurrency(headers: Headers): Currency {
  return currencyFromCountry(headers.get("x-vercel-ip-country"));
}
