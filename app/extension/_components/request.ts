/** JSON fetch for the /extension page. Client-safe. */
import { parsePlanError, type PlanErrorBody } from "@/lib/plans";

export type RequestResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; plan: PlanErrorBody | null };

export async function requestJson<T>(
  url: string,
  init?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown },
): Promise<RequestResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, status: 0, error: "We could not reach BuildMonday. Check your connection and try again.", plan: null };
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
  };
}
