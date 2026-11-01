import { waitUntil } from "@vercel/functions";
import { json, withRoute } from "@/lib/auth/http";
import { sendWeeklyDigests } from "@/lib/digest";
import { absoluteUrl, env } from "@/lib/env";
import { checkCronAuth } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;
/** Follow-up invocations allowed when one call cannot reach every workspace. */
const MAX_HOPS = 6;

/**
 * Monday digest. Default schedule (vercel.json): Mondays 03:30 UTC. With
 * DIGEST_SCHEDULE=local, call it hourly on Sundays and Mondays instead and each
 * workspace is sent at 9:00 local time.
 *
 * Sends within a 240-second budget. When due workspaces remain, it calls
 * itself once more; the (workspace, week) claim makes repeats safe.
 */
export const GET = withRoute(async (req) => {
  const denied = checkCronAuth(req);
  if (denied) return denied;

  const hop = Number(new URL(req.url).searchParams.get("hop") ?? "0") || 0;
  const { sent, skipped, remaining } = await sendWeeklyDigests({ budgetMs: BUDGET_MS });

  let chained = false;
  if (remaining > 0 && hop < MAX_HOPS && env.CRON_SECRET) {
    chained = true;
    waitUntil(
      fetch(absoluteUrl(`/api/cron/digest?hop=${hop + 1}`), {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      })
        .then(() => undefined)
        .catch(() => undefined),
    );
  }

  return json({ ok: true, sent, skipped, remaining, chained });
});
