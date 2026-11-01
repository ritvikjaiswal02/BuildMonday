import { waitUntil } from "@vercel/functions";
import { json, withRoute } from "@/lib/auth/http";
import { absoluteUrl, env } from "@/lib/env";
import { claimDueProducts, countDueProducts, releaseClaim } from "@/lib/monitor";
import { checkCronAuth } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Products handed to workers per invocation. */
const BATCH = 10;
/** Follow-up invocations while products are still due (about 200 products a tick). */
const MAX_HOPS = 20;
const DISPATCH_TIMEOUT_MS = 10_000;

function fireAndForget(url: string): void {
  waitUntil(
    fetch(url, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    })
      .then(() => undefined)
      .catch(() => undefined),
  );
}

/**
 * Daily scheduled monitoring (Vercel cron, 05:00 UTC). Fans out instead of
 * looping: claims up to 10 due products (a 15-minute lease each) and hands
 * every one to its own invocation of /api/cron/monitor/run, which has the
 * full 300 seconds for one product. A product whose hand-off fails is
 * released for the next hop. While products remain due it calls itself
 * again. The first hop also starts the daily maintenance job.
 */
export const GET = withRoute(async (req) => {
  const denied = checkCronAuth(req);
  if (denied) return denied;

  const hop = Number(new URL(req.url).searchParams.get("hop") ?? "0") || 0;
  if (hop === 0) fireAndForget(absoluteUrl("/api/cron/maintenance"));

  const claimed = await claimDueProducts(BATCH);
  const outcomes = await Promise.allSettled(
    claimed.map(async (product) => {
      const res = await fetch(absoluteUrl(`/api/cron/monitor/run?productId=${encodeURIComponent(product.id)}`), {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status !== 202) throw new Error(`worker answered ${res.status}`);
      return product.id;
    }),
  );

  let dispatched = 0;
  for (let i = 0; i < outcomes.length; i++) {
    if (outcomes[i].status === "fulfilled") dispatched++;
    else {
      console.warn(`[monitor] could not hand off ${claimed[i].id}; releasing it`, (outcomes[i] as PromiseRejectedResult).reason);
      await releaseClaim(claimed[i].id);
    }
  }

  const remaining = await countDueProducts();
  // Only chain when this hop made progress, so a broken worker cannot loop.
  const chained = remaining > 0 && dispatched > 0 && hop < MAX_HOPS;
  if (chained) fireAndForget(absoluteUrl(`/api/cron/monitor?hop=${hop + 1}`));

  return json({ ok: true, claimed: claimed.length, dispatched, remaining, chained });
});
