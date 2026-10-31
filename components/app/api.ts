/**
 * Small fetch wrapper for client components calling the app's API routes.
 * Errors carry the standard body `{ error, code, ...extra }` and, for 402s,
 * the parsed plan error so the caller can open the upgrade dialog.
 */
import { parsePlanError, type PlanErrorBody } from "@/lib/plans";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly body: unknown;
  readonly plan: PlanErrorBody | null;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    const code = body && typeof body === "object" ? (body as { code?: unknown }).code : null;
    this.code = typeof code === "string" ? code : null;
    this.plan = status === 402 ? parsePlanError(body) : null;
  }
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /** Serialised as JSON with the right content type. */
  json?: unknown;
  body?: BodyInit | null;
}

const NETWORK_MESSAGE = "Could not reach BuildMonday. Check your connection and try again.";

/** Fallback message for a status when the server sent no readable error. */
export function defaultMessageForStatus(status: number): string {
  if (status === 401) return "Your session ended. Sign in again to continue.";
  if (status === 403) return "You do not have permission to do that in this workspace.";
  if (status === 404) return "That item no longer exists.";
  if (status === 409) return "Something else is already in progress. Try again in a moment.";
  if (status === 413) return "That is too much at once. Send less and try again.";
  if (status === 429) return "Too many requests. Wait a minute and try again.";
  if (status === 503) return "This part of BuildMonday is not set up on this deployment.";
  if (status >= 500) return "Something went wrong on our side. Try again in a moment.";
  return "That did not work. Try again.";
}

export async function apiFetch<T>(url: string, init: ApiRequestInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  finalHeaders.set("accept", "application/json");
  let body = rest.body;
  if (json !== undefined) {
    finalHeaders.set("content-type", "application/json");
    body = JSON.stringify(json);
  }

  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...rest, headers: finalHeaders, body });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, NETWORK_MESSAGE, null);
  }

  const type = res.headers.get("content-type") ?? "";
  const data: unknown = type.includes("application/json") ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? ((data as { error: string }).error as string)
        : defaultMessageForStatus(res.status);
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

/** Human message for anything thrown by apiFetch (or elsewhere). */
export function errorMessage(err: unknown, fallback = "That did not work. Try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
