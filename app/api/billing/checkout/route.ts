import { z } from "zod";
import { HttpError, json, parseJson, withRoute } from "@/lib/auth/http";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireRole, requireUser } from "@/lib/auth/session";
import { createSubscription } from "@/lib/billing/razorpay";
import { recordPendingSubscription } from "@/lib/billing/sync";
import { env, isBillingConfigured } from "@/lib/env";
import { checkoutDescription, findCheckoutConflict } from "../_lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CheckoutSchema = z.object({
  plan: z.enum(["pro", "team"]),
  interval: z.enum(["month", "year"]),
  currency: z.enum(["INR", "USD"]),
});

export interface CheckoutResponse {
  subscriptionId: string;
  keyId: string;
  name: "BuildMonday";
  description: string;
  prefill: { email: string; name: string | null };
  notes: Record<string, string>;
}

/**
 * POST /api/billing/checkout: creates a Razorpay subscription for the chosen
 * plan and returns what the Checkout modal needs. Owners and admins only.
 */
export const POST = withRoute(async (req) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");

  if (!isBillingConfigured()) {
    throw new HttpError(503, "not_configured", "Payments are not set up on this deployment.");
  }

  const body = await parseJson(req, CheckoutSchema, { maxBytes: 4 * 1024 });

  const limited = await rateLimit(`billing-checkout:${ctx.user.id}`, { limit: 10, windowSec: 60 * 60 });
  if (!limited.ok) {
    const retryAfter = Math.max(0, Math.ceil((limited.resetAt.getTime() - Date.now()) / 1000));
    throw new HttpError(429, "rate_limited", "Too many checkout attempts. Try again in a few minutes.", { retryAfter });
  }

  const conflict = findCheckoutConflict(ctx.workspace, body.plan, body.interval);
  if (conflict) throw new HttpError(409, "conflict", conflict);

  const sub = await createSubscription({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    plan: body.plan,
    interval: body.interval,
    currency: body.currency,
  });

  await recordPendingSubscription({
    workspaceId: ctx.workspace.id,
    sub,
    plan: body.plan,
    interval: body.interval,
    currency: body.currency,
  });

  const keyId = env.RAZORPAY_KEY_ID;
  if (!keyId) throw new HttpError(503, "not_configured", "Payments are not set up on this deployment.");

  const response: CheckoutResponse = {
    subscriptionId: sub.id,
    keyId,
    name: "BuildMonday",
    description: checkoutDescription(body.plan, body.interval),
    prefill: { email: ctx.user.email, name: ctx.user.name },
    notes: {
      workspace_id: ctx.workspace.id,
      workspace_name: ctx.workspace.name,
      plan: body.plan,
      interval: body.interval,
      currency: body.currency,
    },
  };
  return json(response);
});
