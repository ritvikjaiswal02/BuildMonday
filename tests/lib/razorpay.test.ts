import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelSubscription,
  createSubscription,
  fetchSubscription,
  getRazorpayPlanId,
  planFromRazorpayPlanId,
  razorpayPlanEnvName,
  totalCountFor,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "@/lib/billing/razorpay";
import { currencyFromCountry, detectCurrency } from "@/lib/billing/currency";
import { mapRazorpayStatus, resolveSubscriptionPlan } from "@/lib/billing/sync";
import { RAZORPAY_PLAN_ENV_NAMES } from "@/lib/env";

vi.mock("@/lib/db", () => ({ db: {}, getDb: () => ({}) }));

const ENV_KEYS = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", ...RAZORPAY_PLAN_ENV_NAMES];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "key_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret";
  for (const name of RAZORPAY_PLAN_ENV_NAMES) process.env[name] = `plan_${name.replace("RAZORPAY_PLAN_", "").toLowerCase()}`;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("plan id mapping", () => {
  it("names the env variable", () => {
    expect(razorpayPlanEnvName("pro", "month", "INR")).toBe("RAZORPAY_PLAN_PRO_MONTHLY_INR");
    expect(razorpayPlanEnvName("team", "year", "USD")).toBe("RAZORPAY_PLAN_TEAM_YEARLY_USD");
  });

  it("reads plan ids and maps them back", () => {
    expect(getRazorpayPlanId("pro", "year", "USD")).toBe("plan_pro_yearly_usd");
    expect(planFromRazorpayPlanId("plan_team_monthly_inr")).toEqual({ plan: "team", interval: "month", currency: "INR" });
    expect(planFromRazorpayPlanId("plan_unknown")).toBeNull();
    expect(planFromRazorpayPlanId("")).toBeNull();
  });

  it("throws not_configured when a plan id is missing", () => {
    delete process.env.RAZORPAY_PLAN_PRO_MONTHLY_INR;
    expect(() => getRazorpayPlanId("pro", "month", "INR")).toThrowError("RAZORPAY_PLAN_PRO_MONTHLY_INR is not set");
  });

  it("bills 120 monthly or 10 yearly cycles", () => {
    expect(totalCountFor("month")).toBe(120);
    expect(totalCountFor("year")).toBe(10);
  });
});

describe("signatures", () => {
  it("verifies the checkout signature", () => {
    const signature = createHmac("sha256", "key_secret").update("pay_123|sub_456").digest("hex");
    expect(verifyCheckoutSignature({ paymentId: "pay_123", subscriptionId: "sub_456", signature })).toBe(true);
    expect(verifyCheckoutSignature({ paymentId: "pay_123", subscriptionId: "sub_789", signature })).toBe(false);
    expect(verifyCheckoutSignature({ paymentId: "pay_123", subscriptionId: "sub_456", signature: "" })).toBe(false);
  });

  it("verifies the webhook signature over the raw body", () => {
    const raw = JSON.stringify({ event: "subscription.activated", payload: {} });
    const signature = createHmac("sha256", "webhook_secret").update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, signature)).toBe(true);
    expect(verifyWebhookSignature(`${raw} `, signature)).toBe(false);
    expect(verifyWebhookSignature(raw, null)).toBe(false);
  });

  it("fails closed without secrets", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(verifyWebhookSignature("{}", "abc")).toBe(false);
    expect(verifyCheckoutSignature({ paymentId: "p", subscriptionId: "s", signature: "x" })).toBe(false);
  });
});

describe("REST calls", () => {
  it("creates a subscription with Basic auth and notes", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ id: "sub_1", plan_id: "plan_pro_monthly_inr", status: "created", current_start: null, current_end: null, charge_at: null, total_count: 120, paid_count: 0, notes: {} }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sub = await createSubscription({ workspaceId: "ws_1", userId: "u_1", plan: "pro", interval: "month", currency: "INR" });
    expect(sub.id).toBe("sub_1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/subscriptions");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("rzp_test_key:key_secret").toString("base64")}`);
    expect(JSON.parse(init.body as string)).toEqual({
      plan_id: "plan_pro_monthly_inr",
      total_count: 120,
      quantity: 1,
      customer_notify: 1,
      notes: { workspace_id: "ws_1", user_id: "u_1", plan: "pro", interval: "month", currency: "INR" },
    });
  });

  it("surfaces Razorpay error descriptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { description: "The id provided does not exist" } }), { status: 400 })),
    );
    await expect(fetchSubscription("sub_missing")).rejects.toMatchObject({
      status: 400,
      message: "Razorpay: The id provided does not exist",
    });
  });

  it("maps network failures to 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(cancelSubscription("sub_1", true)).rejects.toMatchObject({ status: 502, code: "upstream_failed" });
  });

  it("validates subscription ids before calling out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSubscription("../plans")).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to call Razorpay without keys", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    await expect(fetchSubscription("sub_1")).rejects.toMatchObject({ status: 503, code: "not_configured" });
  });

  it("sends cancel_at_cycle_end", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "sub_1", status: "active", notes: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await cancelSubscription("sub_1", true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/subscriptions/sub_1/cancel");
    expect(JSON.parse(init.body as string)).toEqual({ cancel_at_cycle_end: 1 });
  });
});

describe("status and plan resolution", () => {
  it("maps Razorpay statuses", () => {
    expect(mapRazorpayStatus("active")).toBe("active");
    expect(mapRazorpayStatus("authenticated")).toBe("authenticated");
    expect(mapRazorpayStatus("pending")).toBe("past_due");
    expect(mapRazorpayStatus("halted")).toBe("halted");
    expect(mapRazorpayStatus("paused")).toBe("halted");
    expect(mapRazorpayStatus("cancelled")).toBe("cancelled");
    expect(mapRazorpayStatus("expired")).toBe("cancelled");
    expect(mapRazorpayStatus("completed")).toBe("completed");
    expect(mapRazorpayStatus("created")).toBe("created");
  });

  const base = { id: "sub_1", status: "active", current_start: null, current_end: null, charge_at: null, total_count: 1, paid_count: 0 };

  it("prefers configured plan ids", () => {
    expect(resolveSubscriptionPlan({ ...base, plan_id: "plan_pro_yearly_inr", notes: {} })).toEqual({ plan: "pro", interval: "year", currency: "INR" });
  });

  it("falls back to notes", () => {
    expect(
      resolveSubscriptionPlan({ ...base, plan_id: "plan_old", notes: { plan: "team", interval: "month", currency: "USD" } }),
    ).toEqual({ plan: "team", interval: "month", currency: "USD" });
    expect(resolveSubscriptionPlan({ ...base, plan_id: "plan_old", notes: { plan: "free", interval: "month", currency: "USD" } })).toBeNull();
  });
});

describe("currency", () => {
  it("uses INR for India and USD elsewhere", () => {
    expect(currencyFromCountry("IN")).toBe("INR");
    expect(currencyFromCountry("in")).toBe("INR");
    expect(currencyFromCountry("US")).toBe("USD");
    expect(currencyFromCountry(null)).toBe("USD");
    expect(detectCurrency(new Headers({ "x-vercel-ip-country": "IN" }))).toBe("INR");
    expect(detectCurrency(new Headers())).toBe("USD");
  });
});
