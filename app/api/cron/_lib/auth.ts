import "server-only";

import { timingSafeEqualStr } from "@/lib/auth/crypto";
import { errorResponse } from "@/lib/auth/http";
import { env } from "@/lib/env";

/**
 * Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. Returns a 401
 * response unless the header matches; null when authorised.
 */
export function checkCronAuth(req: Request): Response | null {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return errorResponse(401, "unauthorized", "CRON_SECRET is not set on this deployment, so scheduled jobs are disabled.");
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || !timingSafeEqualStr(token, secret)) {
    return errorResponse(401, "unauthorized", "Missing or wrong cron secret.");
  }
  return null;
}
