import { json, withRoute } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { loadBillingStatus } from "../_lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/billing/status: plan, subscription state, this month's usage and what the caller may do. */
export const GET = withRoute(async (req) => {
  const ctx = await requireUser();
  const body = await loadBillingStatus(ctx, req.headers);
  return json(body, { headers: { "Cache-Control": "no-store" } });
});
