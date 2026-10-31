/** Small JSON client for the settings screens. Client-safe. */
import { parsePlanError, type PlanErrorBody } from "@/lib/plans";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; plan: PlanErrorBody | null; code: string | null };

export async function apiRequest<T>(
  url: string,
  init?: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal },
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return {
      ok: false,
      status: 0,
      error: "We could not reach BuildMonday. Check your connection and try again.",
      plan: null,
      code: null,
    };
  }
  const data = (await res.json().catch(() => null)) as unknown;
  if (res.ok) return { ok: true, status: res.status, data: data as T };
  const body = (data ?? {}) as Record<string, unknown>;
  const fallback =
    res.status === 401
      ? "Your session ended. Sign in again to continue."
      : res.status === 403
        ? "Only workspace admins can change this."
        : "Something went wrong on our side. Try again in a moment.";
  return {
    ok: false,
    status: res.status,
    error: typeof body.error === "string" && body.error ? body.error : fallback,
    plan: res.status === 402 ? parsePlanError(body) : null,
    code: typeof body.code === "string" ? body.code : null,
  };
}

/** "3 Nov, 05:00 UTC" for absolute times such as the next scheduled run. */
export function formatUtc(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(d);
  return `${date}, ${time} UTC`;
}

/** "in 6 days", "in 5 h", "today" for future expiry dates. */
export function formatUntil(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "now";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "in under an hour";
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
