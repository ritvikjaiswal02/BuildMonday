import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  role: "owner" as "owner" | "admin" | "member",
  rateOk: true,
  preview: null as null | Record<string, unknown>,
  featureAllowed: true,
  slackPostError: null as Error | null,
  saved: [] as Array<{ kind: string; config: unknown; secret: string }>,
}));

vi.mock("@/lib/auth/session", async () => {
  const { HttpError } = await import("@/lib/auth/http");
  return {
    requireUser: async () => ({
      user: { id: "user-1", email: "ana@acme.com", name: "Ana", image: null, onboardedAt: new Date() },
      workspace: { id: "ws-1", name: "Acme" },
      role: h.role,
    }),
    requireRole: (ctx: { role: string }) => {
      if (ctx.role === "member") throw new HttpError(403, "forbidden", "Only workspace admins can do this.");
    },
  };
});

vi.mock("@/lib/auth/rate-limit", () => ({
  rateLimit: async () => ({ ok: h.rateOk, remaining: h.rateOk ? 10 : 0, resetAt: new Date(Date.now() + 60_000) }),
  rateLimitHeaders: () => ({ "Retry-After": "60" }),
}));

vi.mock("@/lib/sources", () => ({
  detectSourceFromUrl: (url: string) =>
    url.includes("trustpilot.com/review/")
      ? { kind: "trustpilot", config: { domain: url.split("/review/")[1] }, label: "Trustpilot" }
      : null,
  validateSourceConfig: (_kind: string, config: unknown) => ({ ok: true, config }),
  previewSource: async () => h.preview,
}));

vi.mock("@/lib/alerts", () => ({
  isValidSlackWebhook: (url: string) => url.startsWith("https://hooks.slack.com/services/"),
  postSlackMessage: async () => {
    if (h.slackPostError) throw h.slackPostError;
  },
}));

vi.mock("@/app/api/integrations/_lib/service", async () => {
  const { HttpError } = await import("@/lib/auth/http");
  return {
    assertIntegrationFeature: async () => {
      if (!h.featureAllowed) {
        throw new HttpError(402, "plan_required", "Slack alerts are on Pro and Team.", {
          feature: "slack_alerts",
          requiredPlan: "pro",
        });
      }
    },
    saveIntegration: async (_ws: string, kind: string, config: unknown, secret: string) => {
      h.saved.push({ kind, config, secret });
      const now = new Date("2026-11-01T00:00:00Z");
      return { id: "int-1", workspaceId: "ws-1", kind, config, secretHint: secret.slice(-4), status: "connected", lastError: null, createdAt: now, updatedAt: now, secretEncrypted: "v1:x" };
    },
    upstreamMessage: (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback),
    deleteIntegration: async () => undefined,
    testIntegration: async () => ({ ok: true }),
  };
});

const testRoute = await import("@/app/api/sources/test/route");
const slackRoute = await import("@/app/api/integrations/slack/route");

function req(url: string, method: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  h.role = "owner";
  h.rateOk = true;
  h.preview = { ok: true, label: "Trustpilot acme.com", count: 24, sample: Array.from({ length: 8 }, (_, i) => ({ externalId: `r${i}`, text: `Review ${i}` })) };
  h.featureAllowed = true;
  h.slackPostError = null;
  h.saved = [];
});

describe("POST /api/sources/test", () => {
  it("returns a preview capped at five samples", async () => {
    const res = await testRoute.POST(req("/api/sources/test", "POST", { kind: "trustpilot", config: { domain: "acme.com" } }), { params: {} });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, kind: "trustpilot", config: { domain: "acme.com" }, count: 24 });
    expect(json.sample).toHaveLength(5);
  });

  it("detects a pasted URL", async () => {
    const res = await testRoute.POST(req("/api/sources/test", "POST", { url: "https://www.trustpilot.com/review/acme.com" }), { params: {} });
    expect((await res.json()).config).toEqual({ domain: "acme.com" });
  });

  it("answers 400 for links it cannot recognise", async () => {
    const res = await testRoute.POST(req("/api/sources/test", "POST", { url: "https://example.com/x" }), { params: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/could not recognise/);
  });

  it("answers 422 source_unreachable when the preview fails", async () => {
    h.preview = { ok: false, error: "Reddit blocked this request. Try again later." };
    const res = await testRoute.POST(req("/api/sources/test", "POST", { kind: "reddit", config: { mode: "search", query: "acme" } }), { params: {} });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Reddit blocked this request. Try again later.", code: "source_unreachable" });
  });

  it("rate-limits per user", async () => {
    h.rateOk = false;
    const res = await testRoute.POST(req("/api/sources/test", "POST", { kind: "trustpilot", config: { domain: "acme.com" } }), { params: {} });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate_limited");
  });
});

describe("PUT /api/integrations/slack", () => {
  const good = { webhookUrl: "https://hooks.slack.com/services/T0/B0/abcd1234", channelName: "#Product Feedback" };

  it("saves the webhook after a test post", async () => {
    const res = await slackRoute.PUT(req("/api/integrations/slack", "PUT", good), { params: {} });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.integration).toMatchObject({ kind: "slack", status: "connected", secretHint: "1234", config: { kind: "slack", channelName: "product-feedback" } });
    expect(json.integration.secretEncrypted).toBeUndefined();
    expect(h.saved[0].secret).toBe(good.webhookUrl);
  });

  it("is gated to Pro and Team", async () => {
    h.featureAllowed = false;
    const res = await slackRoute.PUT(req("/api/integrations/slack", "PUT", good), { params: {} });
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "plan_required", feature: "slack_alerts", requiredPlan: "pro" });
  });

  it("rejects URLs that are not Slack webhooks", async () => {
    const res = await slackRoute.PUT(req("/api/integrations/slack", "PUT", { webhookUrl: "https://example.com/hook" }), { params: {} });
    expect(res.status).toBe(400);
  });

  it("answers 502 when Slack rejects the test message, and saves nothing", async () => {
    h.slackPostError = new Error("invalid_token");
    const res = await slackRoute.PUT(req("/api/integrations/slack", "PUT", good), { params: {} });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/did not accept our test message/);
    expect(h.saved).toEqual([]);
  });

  it("is admin only", async () => {
    h.role = "member";
    const res = await slackRoute.PUT(req("/api/integrations/slack", "PUT", good), { params: {} });
    expect(res.status).toBe(403);
  });
});
