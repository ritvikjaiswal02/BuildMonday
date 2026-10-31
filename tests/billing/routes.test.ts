import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/auth/http";

// ---- mocks ---------------------------------------------------------------

type Role = "owner" | "admin" | "member";

const session = vi.hoisted(() => ({
  ctx: null as null | {
    user: { id: string; email: string; name: string | null; image: null; onboardedAt: Date };
    workspace: Record<string, unknown>;
    role: Role;
  },
}));

vi.mock("@/lib/db", () => ({ db: {}, getDb: () => ({}) }));

vi.mock("@/lib/auth/session", async () => {
  const { HttpError: E } = await import("@/lib/auth/http");
  const rank = { member: 0, admin: 1, owner: 2 } as const;
  return {
    requireUser: vi.fn(async () => {
      if (!session.ctx) throw new E(401, "unauthorized", "Sign in to continue.");
      return session.ctx;
    }),
    requireRole: (ctx: { role: Role }, min: "admin" | "owner") => {
      if (rank[ctx.role] < rank[min]) throw new E(403, "forbidden", "Only workspace admins can do this.");
    },
    hasRole: (ctx: { role: Role }, min: Role) => rank[ctx.role] >= rank[min],
  };
});

vi.mock("@/lib/auth/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 9, resetAt: new Date(Date.now() + 60_000) })),
}));

const envState = vi.hoisted(() => ({ billing: true }));
vi.mock("@/lib/env", () => ({
  env: {
    get RAZORPAY_KEY_ID() {
      return envState.billing ? "rzp_test_key" : undefined;
    },
  },
  isBillingConfigured: () => envState.billing,
}));

vi.mock("@/lib/billing/razorpay", () => ({
  createSubscription: vi.fn(),
  fetchSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  verifyCheckoutSignature: vi.fn(),
  verifyWebhookSignature: vi.fn(),
}));

vi.mock("@/lib/billing/sync", () => ({
  recordPendingSubscription: vi.fn(async () => undefined),
  cancelReplacedSubscriptions: vi.fn(async () => []),
  otherLiveSubscriptionIds: vi.fn(async () => []),
  syncSubscription: vi.fn(),
  enforcePlanLimits: vi.fn(async () => undefined),
  mapRazorpayStatus: (s: string) => (s === "pending" ? "past_due" : s),
}));

vi.mock("@/lib/billing/entitlements", () => ({
  getWorkspacePlan: vi.fn(),
  getUsageSummary: vi.fn(),
}));

vi.mock("@/app/api/billing/_lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/billing/_lib/billing")>();
  return { ...actual, otherLiveSubscriptionIds: vi.fn(async () => []), subscriptionWorkspaceId: vi.fn() };
});

vi.mock("@/app/api/webhooks/razorpay/_lib/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/webhooks/razorpay/_lib/events")>();
  return { ...actual, claimEvent: vi.fn(async () => ({ state: "new" })), markProcessed: vi.fn(async () => undefined) };
});

import * as razorpay from "@/lib/billing/razorpay";
import * as sync from "@/lib/billing/sync";
import * as entitlements from "@/lib/billing/entitlements";
import * as billingLib from "@/app/api/billing/_lib/billing";
import * as events from "@/app/api/webhooks/razorpay/_lib/events";
import { GET as statusGET } from "@/app/api/billing/status/route";
import { POST as checkoutPOST } from "@/app/api/billing/checkout/route";
import { POST as verifyPOST } from "@/app/api/billing/verify/route";
import { POST as cancelPOST } from "@/app/api/billing/cancel/route";
import { POST as webhookPOST } from "@/app/api/webhooks/razorpay/route";

// ---- helpers -------------------------------------------------------------

const routeCtx = { params: {} as Record<string, string> };

function workspace(over: Record<string, unknown> = {}) {
  return {
    id: "ws_1",
    name: "Acme",
    plan: "free",
    planStatus: "none",
    planInterval: null,
    planCurrency: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    razorpaySubscriptionId: null,
    ...over,
  };
}

function signIn(role: Role = "owner", ws: Record<string, unknown> = workspace()) {
  session.ctx = {
    user: { id: "user_1", email: "sam@acme.test", name: "Sam", image: null, onboardedAt: new Date() },
    workspace: ws,
    role,
  };
}

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function sub(over: Partial<razorpay.RazorpaySubscription> = {}): razorpay.RazorpaySubscription {
  return {
    id: "sub_new",
    plan_id: "plan_pro_monthly_inr",
    status: "active",
    current_start: 1_790_000_000,
    current_end: 1_792_592_000,
    charge_at: null,
    total_count: 120,
    paid_count: 1,
    notes: { workspace_id: "ws_1" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.ctx = null;
  envState.billing = true;
});

// ---- status --------------------------------------------------------------

describe("GET /api/billing/status", () => {
  it("needs a session", async () => {
    const res = await statusGET(new Request("http://x/api/billing/status"), routeCtx);
    expect(res.status).toBe(401);
  });

  it("returns plan, usage and permissions", async () => {
    signIn("member", workspace({ plan: "pro", planCurrency: "INR" }));
    vi.mocked(entitlements.getWorkspacePlan).mockResolvedValue({
      plan: { id: "pro" } as never,
      status: "active",
      trialEndsAt: null,
      interval: "month",
      currency: "INR",
      currentPeriodEnd: new Date("2026-12-12T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      isPaid: true,
    });
    const usage = {
      period: "2026-11",
      metrics: {} as never,
      counts: { products: { used: 1, max: 3 }, seats: { used: 1, max: 2 } },
    };
    vi.mocked(entitlements.getUsageSummary).mockResolvedValue(usage);

    const res = await statusGET(new Request("http://x/api/billing/status"), routeCtx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      plan: "pro",
      status: "active",
      trialEndsAt: null,
      interval: "month",
      currency: "INR",
      currentPeriodEnd: "2026-12-12T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      usage,
      billingEnabled: true,
      suggestedCurrency: "INR",
      canManage: false,
    });
  });
});

// ---- checkout ------------------------------------------------------------

describe("POST /api/billing/checkout", () => {
  const body = { plan: "pro", interval: "month", currency: "INR" };

  it("needs a session", async () => {
    const res = await checkoutPOST(post("http://x/api/billing/checkout", body), routeCtx);
    expect(res.status).toBe(401);
  });

  it("is limited to owners and admins", async () => {
    signIn("member");
    const res = await checkoutPOST(post("http://x/api/billing/checkout", body), routeCtx);
    expect(res.status).toBe(403);
    expect(razorpay.createSubscription).not.toHaveBeenCalled();
  });

  it("answers 503 when payments are not configured", async () => {
    signIn();
    envState.billing = false;
    const res = await checkoutPOST(post("http://x/api/billing/checkout", body), routeCtx);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "not_configured", error: "Payments are not set up on this deployment." });
  });

  it("validates the plan", async () => {
    signIn();
    const res = await checkoutPOST(post("http://x/api/billing/checkout", { ...body, plan: "free" }), routeCtx);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_request");
  });

  it("refuses a duplicate subscription", async () => {
    signIn("owner", workspace({ plan: "pro", planStatus: "active", planInterval: "month", razorpaySubscriptionId: "sub_old" }));
    const res = await checkoutPOST(post("http://x/api/billing/checkout", body), routeCtx);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "conflict", error: "You are already on Pro, billed monthly." });
  });

  it("creates the subscription and returns checkout options", async () => {
    signIn("admin");
    vi.mocked(razorpay.createSubscription).mockResolvedValue(sub({ id: "sub_abc", status: "created" }));

    const res = await checkoutPOST(post("http://x/api/billing/checkout", { ...body, interval: "year" }), routeCtx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      subscriptionId: "sub_abc",
      keyId: "rzp_test_key",
      name: "BuildMonday",
      description: "Pro, billed yearly",
      prefill: { email: "sam@acme.test", name: "Sam" },
    });
    expect(json.notes).toMatchObject({ workspace_id: "ws_1", plan: "pro", interval: "year", currency: "INR" });
    expect(razorpay.createSubscription).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      userId: "user_1",
      plan: "pro",
      interval: "year",
      currency: "INR",
    });
    expect(sync.recordPendingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws_1", plan: "pro", interval: "year", currency: "INR" }),
    );
  });

  it("passes Razorpay failures through as a standard error", async () => {
    signIn();
    vi.mocked(razorpay.createSubscription).mockRejectedValue(
      new HttpError(502, "upstream_failed", "Razorpay did not respond. Try again in a moment."),
    );
    const res = await checkoutPOST(post("http://x/api/billing/checkout", body), routeCtx);
    expect(res.status).toBe(502);
    expect(sync.recordPendingSubscription).not.toHaveBeenCalled();
  });
});

// ---- verify --------------------------------------------------------------

describe("POST /api/billing/verify", () => {
  const body = { razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_new", razorpay_signature: "abc" };

  it("rejects a bad signature", async () => {
    signIn();
    vi.mocked(razorpay.verifyCheckoutSignature).mockReturnValue(false);
    const res = await verifyPOST(post("http://x/api/billing/verify", body), routeCtx);
    expect(res.status).toBe(400);
    expect(razorpay.fetchSubscription).not.toHaveBeenCalled();
  });

  it("refuses a subscription that belongs to another workspace", async () => {
    signIn();
    vi.mocked(razorpay.verifyCheckoutSignature).mockReturnValue(true);
    vi.mocked(razorpay.fetchSubscription).mockResolvedValue(sub({ notes: { workspace_id: "ws_other" } }));
    vi.mocked(billingLib.subscriptionWorkspaceId).mockResolvedValue("ws_other");
    const res = await verifyPOST(post("http://x/api/billing/verify", body), routeCtx);
    expect(res.status).toBe(403);
    expect(sync.syncSubscription).not.toHaveBeenCalled();
  });

  it("moves the workspace to the paid plan and cancels a replaced subscription", async () => {
    signIn();
    vi.mocked(razorpay.verifyCheckoutSignature).mockReturnValue(true);
    vi.mocked(razorpay.fetchSubscription).mockResolvedValue(sub());
    vi.mocked(billingLib.subscriptionWorkspaceId).mockResolvedValue("ws_1");
    vi.mocked(sync.syncSubscription).mockResolvedValue({ workspaceId: "ws_1", plan: "pro", status: "active" });
    vi.mocked(sync.cancelReplacedSubscriptions).mockResolvedValue(["sub_old"]);

    const res = await verifyPOST(post("http://x/api/billing/verify", body), routeCtx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, plan: "pro", status: "active", pending: false });
    expect(sync.syncSubscription).toHaveBeenCalledWith(expect.objectContaining({ id: "sub_new" }), { paymentId: "pay_1" });
    expect(sync.enforcePlanLimits).toHaveBeenCalledWith("ws_1");
    expect(sync.cancelReplacedSubscriptions).toHaveBeenCalledWith("ws_1", "sub_new");
  });

  it("reports pending when Razorpay has not marked it paid yet", async () => {
    signIn();
    vi.mocked(razorpay.verifyCheckoutSignature).mockReturnValue(true);
    vi.mocked(razorpay.fetchSubscription).mockResolvedValue(sub({ status: "created" }));
    vi.mocked(billingLib.subscriptionWorkspaceId).mockResolvedValue("ws_1");
    vi.mocked(sync.syncSubscription).mockResolvedValue({ workspaceId: "ws_1", plan: "free", status: "none" });

    const res = await verifyPOST(post("http://x/api/billing/verify", body), routeCtx);
    expect(await res.json()).toMatchObject({ ok: true, pending: true });
    expect(sync.cancelReplacedSubscriptions).not.toHaveBeenCalled();
  });
});

// ---- cancel --------------------------------------------------------------

describe("POST /api/billing/cancel", () => {
  it("has nothing to cancel on Free", async () => {
    signIn();
    const res = await cancelPOST(post("http://x/api/billing/cancel", {}), routeCtx);
    expect(res.status).toBe(400);
  });

  it("is limited to owners and admins", async () => {
    signIn("member", workspace({ plan: "pro", planStatus: "active", razorpaySubscriptionId: "sub_1" }));
    const res = await cancelPOST(post("http://x/api/billing/cancel", {}), routeCtx);
    expect(res.status).toBe(403);
  });

  it("cancels at the end of the period", async () => {
    signIn("owner", workspace({ plan: "pro", planStatus: "active", razorpaySubscriptionId: "sub_1" }));
    vi.mocked(razorpay.cancelSubscription).mockResolvedValue(sub({ id: "sub_1", current_end: 1_798_761_600 }));
    vi.mocked(sync.syncSubscription).mockResolvedValue({ workspaceId: "ws_1", plan: "pro", status: "active" });

    const res = await cancelPOST(post("http://x/api/billing/cancel", {}), routeCtx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(1_798_761_600 * 1000).toISOString(),
    });
    expect(razorpay.cancelSubscription).toHaveBeenCalledWith("sub_1", true);
    expect(sync.syncSubscription).toHaveBeenCalledWith(expect.objectContaining({ id: "sub_1" }), { cancelAtPeriodEnd: true });
  });

  it("is idempotent once cancelled", async () => {
    signIn(
      "owner",
      workspace({
        plan: "pro",
        planStatus: "active",
        razorpaySubscriptionId: "sub_1",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date("2026-12-12T00:00:00.000Z"),
      }),
    );
    const res = await cancelPOST(post("http://x/api/billing/cancel", {}), routeCtx);
    expect(await res.json()).toEqual({ ok: true, cancelAtPeriodEnd: true, currentPeriodEnd: "2026-12-12T00:00:00.000Z" });
    expect(razorpay.cancelSubscription).not.toHaveBeenCalled();
  });
});

// ---- webhook -------------------------------------------------------------

describe("POST /api/webhooks/razorpay", () => {
  const activated = {
    event: "subscription.activated",
    payload: {
      subscription: { entity: { id: "sub_new", plan_id: "plan_pro_monthly_inr", status: "active", notes: { workspace_id: "ws_1" } } },
      payment: { entity: { id: "pay_9" } },
    },
  };

  function hook(body: unknown, headers: Record<string, string> = {}) {
    return webhookPOST(
      post("http://x/api/webhooks/razorpay", body, {
        "x-razorpay-signature": "sig",
        "x-razorpay-event-id": "evt_1",
        ...headers,
      }),
    );
  }

  it("rejects a bad signature", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(false);
    const res = await hook(activated);
    expect(res.status).toBe(400);
    expect(events.claimEvent).not.toHaveBeenCalled();
  });

  it("verifies the raw body exactly as sent", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(false);
    const raw = '{"event":"subscription.activated",  "payload":{}}';
    await hook(raw);
    expect(razorpay.verifyWebhookSignature).toHaveBeenCalledWith(raw, "sig");
  });

  it("acknowledges duplicates without processing them", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(true);
    vi.mocked(events.claimEvent).mockResolvedValue({ state: "duplicate" });
    const res = await hook(activated);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(sync.syncSubscription).not.toHaveBeenCalled();
  });

  it("syncs from Razorpay's live view and enforces plan limits", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(true);
    vi.mocked(razorpay.fetchSubscription).mockResolvedValue(sub());
    vi.mocked(sync.syncSubscription).mockResolvedValue({ workspaceId: "ws_1", plan: "pro", status: "active" });

    const res = await hook(activated);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(events.claimEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt_1", type: "subscription.activated" }));
    expect(razorpay.fetchSubscription).toHaveBeenCalledWith("sub_new");
    expect(sync.syncSubscription).toHaveBeenCalledWith(expect.objectContaining({ id: "sub_new" }), { paymentId: "pay_9" });
    expect(sync.enforcePlanLimits).toHaveBeenCalledWith("ws_1");
    expect(events.markProcessed).toHaveBeenCalledWith("evt_1", "ws_1");
    expect(sync.cancelReplacedSubscriptions).not.toHaveBeenCalled();
  });

  it("cancels the replaced subscription when the paid one now owns the workspace", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(true);
    vi.mocked(razorpay.fetchSubscription).mockResolvedValue(sub());
    vi.mocked(sync.syncSubscription).mockResolvedValue({ workspaceId: "ws_1", plan: "pro", status: "active", owns: true });
    vi.mocked(sync.cancelReplacedSubscriptions).mockResolvedValue(["sub_old"]);

    const res = await hook(activated);
    expect(res.status).toBe(200);
    expect(sync.cancelReplacedSubscriptions).toHaveBeenCalledWith("ws_1", "sub_new");
  });

  it("answers 500 so Razorpay retries when the old subscription cannot be cancelled", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(true);
    vi.mocked(razorpay.fetchSubscription).mockResolvedValue(sub());
    vi.mocked(sync.syncSubscription).mockResolvedValue({ workspaceId: "ws_1", plan: "pro", status: "active", owns: true });
    vi.mocked(sync.cancelReplacedSubscriptions).mockRejectedValue(new Error("razorpay down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await hook(activated);
    expect(res.status).toBe(500);
    expect(events.markProcessed).not.toHaveBeenCalled();
  });

  it("falls back to the payload and the event's status when Razorpay cannot be reached", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(true);
    vi.mocked(razorpay.fetchSubscription).mockRejectedValue(new Error("down"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(sync.syncSubscription).mockResolvedValue({ workspaceId: "ws_1", plan: "pro", status: "halted" });
    const halted = {
      event: "subscription.halted",
      payload: { subscription: { entity: { id: "sub_new", plan_id: "plan_pro_monthly_inr", status: "halted", notes: {} } } },
    };

    const res = await hook(halted);
    expect(res.status).toBe(200);
    expect(sync.syncSubscription).toHaveBeenCalledWith(expect.objectContaining({ id: "sub_new", status: "halted" }), {
      eventStatus: "halted",
    });
  });

  it("logs failed payments without changing the plan", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await hook({
      event: "payment.failed",
      payload: { payment: { entity: { id: "pay_x", error_description: "Card declined", subscription_id: "sub_new" } } },
    });
    expect(res.status).toBe(200);
    expect(sync.syncSubscription).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(events.markProcessed).toHaveBeenCalledWith("evt_1", null);
  });

  it("acknowledges unknown events", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(true);
    const res = await hook({ event: "order.paid", payload: {} });
    expect(res.status).toBe(200);
    expect(sync.syncSubscription).not.toHaveBeenCalled();
  });

  it("answers 500 so Razorpay retries when processing fails", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(true);
    vi.mocked(razorpay.fetchSubscription).mockResolvedValue(sub());
    vi.mocked(sync.syncSubscription).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await hook(activated);
    expect(res.status).toBe(500);
    expect(events.markProcessed).not.toHaveBeenCalled();
  });

  it("rejects bodies that are not JSON events", async () => {
    vi.mocked(razorpay.verifyWebhookSignature).mockReturnValue(true);
    expect((await hook("not json")).status).toBe(400);
    expect((await hook({ payload: {} })).status).toBe(400);
  });
});
