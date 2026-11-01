/**
 * Edge-safe cookie and header names shared by middleware.ts and the session
 * helpers. No Node-only imports here.
 */

export const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

/** Request header carrying the current path + search to server components. */
export const PATH_HEADER = "x-bm-path";

/** Active product cookie, set by setActiveProductAction. */
export const ACTIVE_PRODUCT_COOKIE = "bm_product";

/** True when an Auth.js session cookie (possibly chunked as ".0", ".1", ...) is present. */
export function hasSessionCookie(names: Iterable<string>): boolean {
  for (const name of names) {
    for (const base of SESSION_COOKIE_NAMES) {
      if (name === base || name.startsWith(`${base}.`)) return true;
    }
  }
  return false;
}

/**
 * Only same-site relative paths are allowed as a post-login destination.
 * Anything else (absolute URLs, protocol-relative "//host") falls back.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/**
 * The onboarding URL for a user who still has to set up, carrying where they
 * were headed (`then`) so the wizard can continue there afterwards. Only
 * billing destinations are carried; everything else ends on the dashboard.
 */
export function onboardingPath(target: string | null | undefined): string {
  const then = onboardingThen(target);
  return then ? `/onboarding?then=${encodeURIComponent(then)}` : "/onboarding";
}

/** A post-onboarding destination worth carrying: a same-site /billing path, else null. */
export function onboardingThen(target: string | null | undefined): string | null {
  const safe = safeNextPath(target ?? null, "");
  return safe.startsWith("/billing") ? safe : null;
}

/**
 * Where to land after onboarding when the visitor came to pay: the dashboard
 * with the plan they picked, so it can offer to finish the upgrade.
 */
export function dashboardAfterOnboarding(then: string | null): string {
  if (!then) return "/dashboard?first=1";
  let plan: string | null = null;
  let interval: string | null = null;
  try {
    const url = new URL(then, "https://x.invalid");
    plan = url.searchParams.get("plan");
    interval = url.searchParams.get("interval");
  } catch {
    plan = null;
  }
  const params = new URLSearchParams({ first: "1" });
  params.set("upgrade", plan === "team" ? "team" : "pro");
  params.set("interval", interval === "month" ? "month" : "year");
  return `/dashboard?${params.toString()}`;
}
