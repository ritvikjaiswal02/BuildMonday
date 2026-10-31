import "server-only";

import { hmacSha256Hex, timingSafeEqualStr } from "@/lib/auth/crypto";
import { HttpError } from "@/lib/auth/http";
import type { BillingInterval, Currency, PlanId } from "@/lib/db/schema";
import { RAZORPAY_PLAN_ENV_NAMES, env, razorpayPlanEnv, type RazorpayPlanEnvName } from "@/lib/env";

const API_BASE = "https://api.razorpay.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;

export type PaidPlanId = Exclude<PlanId, "free">;

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  charge_at: number | null;
  total_count: number;
  paid_count: number;
  short_url?: string;
  notes: Record<string, string>;
}

/** Env variable that holds the Razorpay plan id for this combination. */
export function razorpayPlanEnvName(plan: PaidPlanId, interval: BillingInterval, currency: Currency): RazorpayPlanEnvName {
  const p = plan === "pro" ? "PRO" : "TEAM";
  const i = interval === "month" ? "MONTHLY" : "YEARLY";
  return `RAZORPAY_PLAN_${p}_${i}_${currency}` as RazorpayPlanEnvName;
}

/** Throws 503 not_configured when the plan id variable is missing. */
export function getRazorpayPlanId(plan: PaidPlanId, interval: BillingInterval, currency: Currency): string {
  const name = razorpayPlanEnvName(plan, interval, currency);
  const id = razorpayPlanEnv(name);
  if (!id) throw new HttpError(503, "not_configured", `${name} is not set`);
  return id;
}

/** Reverse lookup across the eight configured plan ids. */
export function planFromRazorpayPlanId(
  planId: string,
): { plan: PaidPlanId; interval: BillingInterval; currency: Currency } | null {
  if (!planId) return null;
  for (const name of RAZORPAY_PLAN_ENV_NAMES) {
    if (razorpayPlanEnv(name) !== planId) continue;
    const match = /^RAZORPAY_PLAN_(PRO|TEAM)_(MONTHLY|YEARLY)_(INR|USD)$/.exec(name);
    if (!match) continue;
    return {
      plan: match[1] === "PRO" ? "pro" : "team",
      interval: match[2] === "MONTHLY" ? "month" : "year",
      currency: match[3] as Currency,
    };
  }
  return null;
}

function credentials(): { keyId: string; keySecret: string } {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new HttpError(503, "not_configured", "Payments are not set up on this deployment.");
  }
  return { keyId, keySecret };
}

type RazorpayErrorBody = { error?: { code?: string; description?: string; reason?: string } };

async function razorpayRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { keyId, keySecret } = credentials();
  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[razorpay] request failed", err);
    throw new HttpError(502, "upstream_failed", "Razorpay did not respond. Try again in a moment.");
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const description = (data as RazorpayErrorBody | null)?.error?.description;
    const status = res.status === 404 ? 404 : res.status === 400 ? 400 : 502;
    const code = status === 404 ? "not_found" : status === 400 ? "invalid_request" : "upstream_failed";
    throw new HttpError(status, code, description ? `Razorpay: ${description}` : `Razorpay returned ${res.status}.`);
  }
  return data as T;
}

/** Monthly plans bill up to 120 cycles (10 years), yearly up to 10. */
export function totalCountFor(interval: BillingInterval): number {
  return interval === "month" ? 120 : 10;
}

export async function createSubscription(args: {
  workspaceId: string;
  userId: string;
  plan: PaidPlanId;
  interval: BillingInterval;
  currency: Currency;
}): Promise<RazorpaySubscription> {
  const planId = getRazorpayPlanId(args.plan, args.interval, args.currency);
  return razorpayRequest<RazorpaySubscription>("POST", "/subscriptions", {
    plan_id: planId,
    total_count: totalCountFor(args.interval),
    quantity: 1,
    customer_notify: 1,
    notes: {
      workspace_id: args.workspaceId,
      user_id: args.userId,
      plan: args.plan,
      interval: args.interval,
      currency: args.currency,
    },
  });
}

export async function fetchSubscription(id: string): Promise<RazorpaySubscription> {
  if (!/^sub_[A-Za-z0-9]+$/.test(id)) {
    throw new HttpError(400, "invalid_request", "That subscription id is not valid.");
  }
  return razorpayRequest<RazorpaySubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);
}

/** atCycleEnd: true keeps the plan until the paid period ends. */
export async function cancelSubscription(id: string, atCycleEnd: boolean): Promise<RazorpaySubscription> {
  if (!/^sub_[A-Za-z0-9]+$/.test(id)) {
    throw new HttpError(400, "invalid_request", "That subscription id is not valid.");
  }
  return razorpayRequest<RazorpaySubscription>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, {
    cancel_at_cycle_end: atCycleEnd ? 1 : 0,
  });
}

/** Refunds part of a captured payment (amount in the smallest currency unit). */
export async function refundPayment(
  paymentId: string,
  amount: number,
  notes: Record<string, string> = {},
): Promise<{ id: string; amount: number }> {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
    throw new HttpError(400, "invalid_request", "That payment id is not valid.");
  }
  return razorpayRequest<{ id: string; amount: number }>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: Math.floor(amount),
    speed: "normal",
    notes,
  });
}

/** Checkout handler signature: HMAC_SHA256(key_secret, payment_id + "|" + subscription_id). */
export function verifyCheckoutSignature(args: { paymentId: string; subscriptionId: string; signature: string }): boolean {
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!secret || !args.paymentId || !args.subscriptionId || !args.signature) return false;
  const expected = hmacSha256Hex(secret, `${args.paymentId}|${args.subscriptionId}`);
  return timingSafeEqualStr(expected, args.signature.trim().toLowerCase());
}

/** Webhook signature: HMAC_SHA256(webhook_secret, raw body), from X-Razorpay-Signature. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = hmacSha256Hex(secret, rawBody);
  return timingSafeEqualStr(expected, signature.trim().toLowerCase());
}
