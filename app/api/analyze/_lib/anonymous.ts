import "server-only";

import { errorResponse } from "@/lib/auth/http";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/auth/rate-limit";
import { getSessionContext } from "@/lib/auth/session";
import { assertAndConsume } from "@/lib/billing/entitlements";

const DAY_SEC = 24 * 60 * 60;
/** Signed-in people get this many times the anonymous allowance on the free tools. */
const SIGNED_IN_MULTIPLIER = 5;

export const ANON_LIMIT_MESSAGE = "You have used today's free analyses. Create a free account to keep going.";
const SIGNED_IN_LIMIT_MESSAGE =
  "You have reached today's limit for the free analyzer. Try again tomorrow; your monitored sources keep running.";

/**
 * Daily limit for the free analyzer tools (/api/analyze, /api/fetch-reviews,
 * /api/prd, anonymous /api/chat). Keyed by IP when signed out and by user id
 * when signed in. Returns a 429 response when over the limit, otherwise null.
 */
export async function limitFreeTool(req: Request, bucket: string, perDay: number): Promise<Response | null> {
  let userId: string | null = null;
  try {
    userId = (await getSessionContext())?.user.id ?? null;
  } catch {
    userId = null;
  }
  const key = userId ? `free:${bucket}:user:${userId}` : `free:${bucket}:ip:${clientIp(req)}`;
  const limit = userId ? perDay * SIGNED_IN_MULTIPLIER : perDay;
  const result = await rateLimit(key, { limit, windowSec: DAY_SEC });
  if (result.ok) return null;
  const retryAfter = Math.max(0, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
  return errorResponse(
    429,
    "rate_limited",
    userId ? SIGNED_IN_LIMIT_MESSAGE : ANON_LIMIT_MESSAGE,
    { retryAfter, signedIn: Boolean(userId) },
    rateLimitHeaders(result),
  );
}

/**
 * The free tools must not become a way around plan limits: when the caller is
 * signed in, the same use also counts against their workspace's monthly
 * allowance (chat messages, PRDs), exactly as in the app.
 */
export async function chargeSignedInWorkspace(metric: "chat_messages_per_month" | "prds_per_month"): Promise<void> {
  let workspaceId: string | null = null;
  try {
    workspaceId = (await getSessionContext())?.workspace.id ?? null;
  } catch {
    workspaceId = null;
  }
  if (workspaceId) await assertAndConsume(workspaceId, metric, 1);
}
