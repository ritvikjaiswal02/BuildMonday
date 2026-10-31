import "server-only";

import { lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { isDbConfigured } from "@/lib/env";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: Date;
}

/** Start of the fixed window that contains `now`. */
export function windowStartFor(now: number, windowSec: number): Date {
  const windowMs = Math.max(1, Math.floor(windowSec)) * 1000;
  return new Date(Math.floor(now / windowMs) * windowMs);
}

// ---------------------------------------------------------------------------
// In-memory fallback (used when the database is not configured, e.g. the
// anonymous analyzer on a deployment without Postgres, and in tests).
// ---------------------------------------------------------------------------

const memory = new Map<string, { windowStart: number; resetAt: number; count: number }>();
let lastSweep = 0;

function sweepMemory(now: number) {
  if (now - lastSweep < 60_000 && memory.size < 10_000) return;
  lastSweep = now;
  for (const [k, v] of memory) {
    if (v.resetAt <= now) memory.delete(k);
  }
}

function memoryHit(key: string, limit: number, windowSec: number, now: number): RateLimitResult {
  sweepMemory(now);
  const start = windowStartFor(now, windowSec).getTime();
  const resetAt = new Date(start + windowSec * 1000);
  const mapKey = `${key}|${windowSec}`;
  const entry = memory.get(mapKey);
  const count = entry && entry.windowStart === start ? entry.count + 1 : 1;
  memory.set(mapKey, { windowStart: start, resetAt: resetAt.getTime(), count });
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}

/** Test helper: clears the in-memory windows. */
export function __resetMemoryRateLimits() {
  memory.clear();
  lastSweep = 0;
}

/**
 * Fixed-window rate limit. Each call counts as one hit.
 * DB-backed (upsert on rate_limits) when the database is configured, in-memory
 * otherwise. Never throws: on a database error it fails open.
 */
export async function rateLimit(key: string, opts: { limit: number; windowSec: number }): Promise<RateLimitResult> {
  const now = Date.now();
  const windowSec = Math.max(1, Math.floor(opts.windowSec));
  const limit = Math.max(0, Math.floor(opts.limit));

  if (!isDbConfigured()) {
    return memoryHit(key, limit, windowSec, now);
  }

  const windowStart = windowStartFor(now, windowSec);
  const resetAt = new Date(windowStart.getTime() + windowSec * 1000);
  // Include the window length in the key so two limits on the same key with
  // different windows never share a counter.
  const storedKey = `${key}|${windowSec}`;

  try {
    const db = getDb();
    const [row] = await db
      .insert(rateLimits)
      .values({ key: storedKey, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });

    // Occasionally clear windows older than two days so the table stays small.
    if (Math.random() < 0.01) {
      const cutoff = new Date(now - 2 * 24 * 60 * 60 * 1000);
      db.delete(rateLimits)
        .where(lt(rateLimits.windowStart, cutoff))
        .catch((err: unknown) => console.warn("[rate-limit] cleanup failed", err));
    }

    const count = row?.count ?? 1;
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  } catch (err) {
    console.warn("[rate-limit] failing open after a database error", err);
    return { ok: true, remaining: limit, resetAt };
  }
}

/** First x-forwarded-for entry, then x-real-ip, else "unknown". */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

/** Retry-After (seconds until the window resets) and X-RateLimit-Remaining. */
export function rateLimitHeaders(r: { remaining: number; resetAt: Date }): Record<string, string> {
  const retryAfter = Math.max(0, Math.ceil((r.resetAt.getTime() - Date.now()) / 1000));
  return {
    "Retry-After": String(retryAfter),
    "X-RateLimit-Remaining": String(Math.max(0, r.remaining)),
  };
}
