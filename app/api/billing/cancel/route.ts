import { HttpError, json, withRoute } from "@/lib/auth/http";
import { requireRole, requireUser } from "@/lib/auth/session";
import { cancelSubscription } from "@/lib/billing/razorpay";
import { syncSubscription } from "@/lib/billing/sync";
import { isBillingConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/cancel: stops renewal at the end of the paid period.
 * The workspace keeps its plan until then; nothing is deleted.
 */
export const POST = withRoute(async () => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");

  if (!isBillingConfigured()) {
    throw new HttpError(503, "not_configured", "Payments are not set up on this deployment.");
  }

  const ws = ctx.workspace;
  const subscriptionId = ws.razorpaySubscriptionId;
  if (ws.plan === "free" || !subscriptionId) {
    throw new HttpError(400, "invalid_request", "This workspace is on the free plan. There is nothing to cancel.");
  }
  if (ws.planStatus === "cancelled" || ws.planStatus === "completed") {
    throw new HttpError(409, "conflict", "This subscription is already cancelled.");
  }
  if (ws.cancelAtPeriodEnd) {
    return json({
      ok: true as const,
      cancelAtPeriodEnd: true as const,
      currentPeriodEnd: ws.currentPeriodEnd ? ws.currentPeriodEnd.toISOString() : null,
    });
  }

  const sub = await cancelSubscription(subscriptionId, true);
  const synced = await syncSubscription(sub, { cancelAtPeriodEnd: true });

  const end = sub.current_end ? new Date(sub.current_end * 1000) : ws.currentPeriodEnd;
  if (!synced) {
    console.warn(`[billing] cancelled ${subscriptionId} but could not sync it to workspace ${ws.id}`);
  }

  return json({
    ok: true as const,
    cancelAtPeriodEnd: true as const,
    currentPeriodEnd: end ? end.toISOString() : null,
  });
});
