import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { timingSafeEqualStr } from "@/lib/auth/crypto";
import { safeNextPath } from "@/lib/auth/cookies";
import { HttpError } from "@/lib/auth/http";
import { env } from "@/lib/env";

/**
 * Signed, short-lived OAuth `state` values for the integration connect flows
 * (Slack, Linear, GitHub App). The state names the provider, workspace, user
 * and where to send the browser afterwards, and carries a nonce that must
 * match an httpOnly cookie set when the flow started. A state from another
 * browser, another user or older than ten minutes is rejected.
 */

export type OAuthProvider = "slack" | "linear" | "github";

export const OAUTH_NONCE_COOKIE = "bm_oauth_nonce";
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface OAuthStatePayload {
  p: OAuthProvider;
  /** Workspace id. */
  w: string;
  /** User id. */
  u: string;
  /** Same-site path to return to. */
  r: string;
  /** Nonce, matched against the cookie. */
  n: string;
  /** Expiry, unix seconds. */
  e: number;
}

function signingKey(): string {
  const key = env.AUTH_SECRET ?? env.ENCRYPTION_KEY;
  if (!key) throw new HttpError(503, "not_configured", "AUTH_SECRET is not set");
  return `bm-oauth-state:${key}`;
}

function sign(data: string): string {
  return createHmac("sha256", signingKey()).update(data, "utf8").digest("base64url");
}

export function createOAuthState(args: {
  provider: OAuthProvider;
  workspaceId: string;
  userId: string;
  returnTo: string;
  now?: Date;
}): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const payload: OAuthStatePayload = {
    p: args.provider,
    w: args.workspaceId,
    u: args.userId,
    r: safeOAuthReturn(args.returnTo),
    n: nonce,
    e: Math.floor((args.now ?? new Date()).getTime() / 1000) + OAUTH_STATE_TTL_SECONDS,
  };
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { state: `${data}.${sign(data)}`, nonce };
}

/** The payload when the signature, provider, expiry and cookie nonce all check out; else null. */
export function verifyOAuthState(
  state: string | null,
  provider: OAuthProvider,
  nonceCookie: string | null | undefined,
  now: Date = new Date(),
): OAuthStatePayload | null {
  if (!state || state.length > 2048 || !nonceCookie) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const data = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  if (!timingSafeEqualStr(signature, sign(data))) return null;
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    return null;
  }
  if (payload.p !== provider) return null;
  if (typeof payload.e !== "number" || payload.e < Math.floor(now.getTime() / 1000)) return null;
  if (typeof payload.n !== "string" || !timingSafeEqualStr(payload.n, nonceCookie)) return null;
  return { ...payload, r: safeOAuthReturn(payload.r) };
}

/** Only pages inside the app can be returned to. */
export function safeOAuthReturn(path: string | null | undefined): string {
  const safe = safeNextPath(path ?? null, "/settings/integrations");
  return safe.startsWith("/settings") || safe.startsWith("/onboarding") || safe.startsWith("/dashboard")
    ? safe
    : "/settings/integrations";
}

/** `path` with `key=value` added to its query string. */
export function withQuery(path: string, params: Record<string, string>): string {
  const url = new URL(path, "https://x.invalid");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return `${url.pathname}${url.search}`;
}
