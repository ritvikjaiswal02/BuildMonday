/**
 * HTTP helpers shared by every API route: a typed error, the standard error
 * body `{ error, code, ...extra }`, a route wrapper and size-limited JSON
 * parsing with zod.
 */
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "plan_required"
  | "limit_reached"
  | "rate_limited"
  | "conflict"
  | "payload_too_large"
  | "unsupported_origin"
  | "source_unreachable"
  | "upstream_failed"
  | "not_configured"
  | "internal";

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly extra?: Record<string, unknown>;

  constructor(status: number, code: ErrorCode, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}

export function json<T>(data: T, init?: number | ResponseInit): Response {
  const responseInit: ResponseInit | undefined = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data, responseInit);
}

export function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  extra?: Record<string, unknown>,
  headers?: HeadersInit,
): Response {
  return NextResponse.json({ ...(extra ?? {}), error: message, code }, { status, headers });
}

/** Human-readable summary of the first zod issue, e.g. "name: Required". */
export function describeZodError(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return "The request is not valid.";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

export function handleRouteError(err: unknown): Response {
  if (err instanceof HttpError) {
    const headers: Record<string, string> = {};
    const retryAfter = err.extra?.retryAfter;
    if (err.status === 429 && typeof retryAfter === "number") {
      headers["Retry-After"] = String(Math.max(0, Math.ceil(retryAfter)));
    }
    return errorResponse(err.status, err.code, err.message, err.extra, headers);
  }
  if (err instanceof ZodError) {
    return errorResponse(400, "invalid_request", describeZodError(err), {
      issues: err.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  console.error("[api] unhandled error", err);
  return errorResponse(500, "internal", "Something went wrong on our side. Try again in a moment.");
}

/**
 * Wraps a route handler so thrown HttpError, PlanError and ZodError become the
 * standard error body. Next.js "control flow" errors (redirect, notFound) are
 * rethrown untouched.
 */
export function withRoute<C = { params: Record<string, string> }>(
  handler: (req: Request, ctx: C) => Promise<Response>,
): (req: Request, ctx: C) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      return handleRouteError(err);
    }
  };
}

function isNextControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}

const DEFAULT_MAX_BYTES = 64 * 1024;

function formatBytes(bytes: number): string {
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} bytes`;
}

/**
 * Reads the body as text (enforcing `maxBytes`, default 64 KB), parses JSON and
 * validates it. Errors: 413 payload_too_large, 400 invalid_request.
 */
export async function parseJson<T>(
  req: Request,
  schema: z.ZodType<T>,
  opts?: { maxBytes?: number },
): Promise<T> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const tooLarge = () =>
    new HttpError(413, "payload_too_large", `The request is larger than ${formatBytes(maxBytes)}.`, { maxBytes });

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    throw new HttpError(400, "invalid_request", "The request body could not be read.");
  }
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw tooLarge();
  if (raw.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "The request body is empty. Send JSON.");
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_request", "The request body is not valid JSON.");
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, "invalid_request", describeZodError(result.error), {
      issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  return result.data;
}

export function corsHeaders(
  origin: string | null,
  opts?: { allowOrigin?: string; methods?: string; headers?: string },
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": opts?.allowOrigin ?? origin ?? "*",
    "Access-Control-Allow-Methods": opts?.methods ?? "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": opts?.headers ?? "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
