import { json, withRoute } from "@/lib/auth/http";
import { runMaintenance } from "@/lib/maintenance";
import { checkCronAuth } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily maintenance: the "trial ends in 2 days" email, the downgrade when a
 * trial ends unpaid, and the retention sweep (data older than the plan's
 * history window). Started by the first hop of /api/cron/monitor, so it needs
 * no cron entry of its own; it can also be scheduled directly.
 */
export const GET = withRoute(async (req) => {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const result = await runMaintenance({ budgetMs: 240_000 });
  return json({ ok: true, ...result });
});
