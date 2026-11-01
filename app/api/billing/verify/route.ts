import { z } from "zod";
import { HttpError, json, parseJson, withRoute } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { fetchSubscription, verifyCheckoutSignature } from "@/lib/billing/razorpay";
import { cancelReplacedSubscriptions, enforcePlanLimits, syncSubscription } from "@/lib/billing/sync";
import { subscriptionWorkspaceId } from "../_lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VerifySchema = z.object({
  razorpay_payment_id: z.string().trim().min(1).max(64),
  razorpay_subscription_id: z.string().trim().min(1).max(64),
  razorpay_signature: z.string().trim().min(1).max(256),
});

const PAID = new Set(["active", "authenticated"]);

/**
 * POST /api/billing/verify: called by the Checkout handler. Checks the
 * signature, reads the subscription from Razorpay and moves the workspace to
 * the paid plan. When this replaces another live subscription (a plan switch),
 * the old one is cancelled so the customer is not billed twice.
 */
export const POST = withRoute(async (req) => {
  const ctx = await requireUser();
  const body = await parseJson(req, VerifySchema, { maxBytes: 4 * 1024 });

  const valid = verifyCheckoutSignature({
    paymentId: body.razorpay_payment_id,
    subscriptionId: body.razorpay_subscription_id,
    signature: body.razorpay_signature,
  });
  if (!valid) {
    throw new HttpError(400, "invalid_request", "We could not confirm this payment. If you were charged, it will show up on your plan within a few minutes.");
  }

  const sub = await fetchSubscription(body.razorpay_subscription_id);

  const owner = await subscriptionWorkspaceId(sub.id, sub.notes);
  if (owner !== ctx.workspace.id) {
    throw new HttpError(403, "forbidden", "This payment belongs to a different workspace.");
  }

  const synced = await syncSubscription(sub, { paymentId: body.razorpay_payment_id });
  if (!synced) {
    throw new HttpError(502, "upstream_failed", "Razorpay confirmed the payment but the plan could not be read. It will update within a few minutes.");
  }

  await enforcePlanLimits(synced.workspaceId);

  if (PAID.has(synced.status)) {
    try {
      await cancelReplacedSubscriptions(ctx.workspace.id, sub.id);
    } catch (err) {
      // The new plan is already active; the webhook for this subscription retries the cancel.
      console.error(`[billing] could not cancel a replaced subscription for ${ctx.workspace.id}`, err);
    }
  }

  // `pending` is true when Razorpay has not marked the subscription paid yet; the webhook finishes the switch.
  return json({ ok: true as const, plan: synced.plan, status: synced.status, pending: !PAID.has(synced.status) });
});
