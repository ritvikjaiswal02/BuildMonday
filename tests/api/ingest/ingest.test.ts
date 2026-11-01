import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/db/schema";
import { DEFAULT_WIDGET_SETTINGS } from "@/lib/db/schema";
import { createConfigHandler, createIngestHandler, originAllowed, preflight, type WidgetDeps } from "@/lib/feedback/widget";

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: "prod-1",
    workspaceId: "ws-1",
    name: "Acme Notes",
    publicKey: "pk_abcdefghijklmnopqrstuvwx",
    allowedOrigins: [],
    widgetSettings: DEFAULT_WIDGET_SETTINGS,
    ...over,
  }) as Product;

function deps(over: Partial<WidgetDeps> = {}): WidgetDeps & { ingest: ReturnType<typeof vi.fn> } {
  const ingest = vi.fn(async () => ({ inserted: 1, duplicates: 0, rejected: 0, ids: ["f1"], quotaExceeded: false }));
  return {
    isConfigured: () => true,
    findProductByKey: async (key) => (key === "pk_abcdefghijklmnopqrstuvwx" ? product() : null),
    rateLimit: async () => ({ ok: true, remaining: 9, resetAt: new Date(Date.now() + 60_000) }),
    clientIp: () => "203.0.113.9",
    ingest,
    planFor: async () => "free",
    hasUnbranded: (plan) => plan !== "free",
    ...over,
  } as WidgetDeps & { ingest: ReturnType<typeof vi.fn> };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.example/api/ingest", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://acme.com", "user-agent": "Test/1.0", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const valid = { key: "pk_abcdefghijklmnopqrstuvwx", text: "The export button does nothing", email: "a@b.co", pageUrl: "https://acme.com/app" };

describe("POST /api/ingest", () => {
  it("stores valid feedback with CORS headers", async () => {
    const d = deps();
    const res = await createIngestHandler(d)(post(valid));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://acme.com");
    expect(d.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        productId: "prod-1",
        channel: "widget",
        items: [
          expect.objectContaining({
            text: "The export button does nothing",
            authorEmail: "a@b.co",
            sourceKind: "widget",
            status: "new",
            url: "https://acme.com/app",
            meta: expect.objectContaining({ site: "widget", origin: "https://acme.com", userAgent: "Test/1.0" }),
          }),
        ],
      }),
    );
  });

  it("accepts the demo key without storing", async () => {
    const d = deps({ isConfigured: () => false });
    const res = await createIngestHandler(d)(post({ ...valid, key: "demo" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, demo: true });
    expect(d.ingest).not.toHaveBeenCalled();
  });

  it("pretends success for honeypot submissions", async () => {
    const d = deps();
    const res = await createIngestHandler(d)(post({ ...valid, website: "http://spam.example" }));
    expect(res.status).toBe(201);
    expect(d.ingest).not.toHaveBeenCalled();
  });

  it("validates the body", async () => {
    const handler = createIngestHandler(deps());
    expect((await handler(post({ ...valid, text: "  a " }))).status).toBe(400);
    expect((await handler(post({ ...valid, email: "nope" }))).status).toBe(400);
    expect((await handler(post({ ...valid, meta: { big: "x".repeat(3000) } }))).status).toBe(400);
    expect((await handler(post("{not json"))).status).toBe(400);
    const tooBig = await handler(post({ ...valid, text: "x".repeat(17_000) }));
    expect(tooBig.status).toBe(413);
    expect(tooBig.headers.get("access-control-allow-origin")).toBe("https://acme.com");
  });

  it("404s an unknown key", async () => {
    const res = await createIngestHandler(deps())(post({ ...valid, key: "pk_unknownunknownunknown00" }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
  });

  it("enforces the origin allow-list", async () => {
    const d = deps({ findProductByKey: async () => product({ allowedOrigins: ["https://*.acme.com"] }) });
    const handler = createIngestHandler(d);
    const blocked = await handler(post(valid));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe("unsupported_origin");
    const allowed = await handler(post(valid, { origin: "https://app.acme.com" }));
    expect(allowed.status).toBe(201);
  });

  it("rate limits per IP and per product", async () => {
    const calls: string[] = [];
    const d = deps({
      rateLimit: async (key) => {
        calls.push(key);
        return { ok: !key.startsWith("ingest:product"), remaining: 0, resetAt: new Date(Date.now() + 120_000) };
      },
    });
    const res = await createIngestHandler(d)(post(valid));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(100);
    expect(calls).toEqual(["ingest:ip:prod-1:203.0.113.9", "ingest:product:prod-1"]);
    expect(d.ingest).not.toHaveBeenCalled();
  });

  it("stores link spam with status spam, without using quota", async () => {
    const d = deps();
    await createIngestHandler(d)(
      post({ ...valid, text: "buy https://a.co https://b.co https://c.co https://d.co now" }),
    );
    expect(d.ingest.mock.calls[0][0].items[0].status).toBe("spam");
    expect(d.ingest.mock.calls[0][0].enforceQuota).toBe(false);
  });

  it("stops storing widget messages past the product's daily allowance, so sources keep their quota", async () => {
    const calls: Array<{ key: string; limit: number }> = [];
    const d = deps({
      rateLimit: async (key, opts) => {
        calls.push({ key, limit: opts.limit });
        return { ok: !key.startsWith("ingest:product-day"), remaining: 0, resetAt: new Date(Date.now() + 60_000) };
      },
    });
    const res = await createIngestHandler(d)(post(valid));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, stored: false });
    expect(calls.find((c) => c.key === "ingest:product-day:prod-1")?.limit).toBe(10);
    expect(d.ingest).not.toHaveBeenCalled();
  });

  it("answers 202 stored:false when over quota", async () => {
    const d = deps({ ingest: vi.fn(async () => ({ inserted: 0, duplicates: 0, rejected: 0, ids: [], quotaExceeded: true })) });
    const res = await createIngestHandler(d)(post(valid));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, stored: false });
  });

  it("reports not configured without a database", async () => {
    const res = await createIngestHandler(deps({ isConfigured: () => false }))(post(valid));
    expect(res.status).toBe(503);
  });

  it("answers preflight requests", () => {
    const res = preflight(new Request("https://app.example/api/ingest", { method: "OPTIONS", headers: { origin: "https://x.com" } }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://x.com");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });
});

describe("originAllowed", () => {
  it("allows everything with an empty list", () => {
    expect(originAllowed(null, [])).toBe(true);
  });
  it("matches exact origins and wildcard subdomains", () => {
    expect(originAllowed("https://acme.com", ["https://acme.com/"])).toBe(true);
    expect(originAllowed("https://www.acme.com", ["https://*.acme.com"])).toBe(true);
    expect(originAllowed("https://acme.com", ["https://*.acme.com"])).toBe(false);
    expect(originAllowed("https://evilacme.com", ["https://*.acme.com"])).toBe(false);
    expect(originAllowed("http://app.acme.com", ["https://*.acme.com"])).toBe(false);
    expect(originAllowed(null, ["https://acme.com"])).toBe(false);
  });
});

describe("GET /api/ingest/config", () => {
  const get = (key: string) => new Request(`https://app.example/api/ingest/config?key=${encodeURIComponent(key)}`);

  it("returns the demo config", async () => {
    const res = await createConfigHandler(deps())(get("demo"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ productName: "Example product", showBranding: true });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns product settings with branding by plan", async () => {
    const d = deps({
      findProductByKey: async () =>
        product({ widgetSettings: { ...DEFAULT_WIDGET_SETTINGS, buttonLabel: "Ideas?", accent: "#123abc", position: "bottom-left" } }),
      planFor: async () => "pro",
    });
    const res = await createConfigHandler(d)(get("pk_abcdefghijklmnopqrstuvwx"));
    expect(await res.json()).toEqual({
      productName: "Acme Notes",
      prompt: "What could be better?",
      askEmail: true,
      accent: "#123abc",
      position: "bottom-left",
      buttonLabel: "Ideas?",
      showBranding: false,
    });
  });

  it("drops an invalid accent and 404s unknown keys", async () => {
    const d = deps({ findProductByKey: async (k) => (k === "pk_x" ? product({ widgetSettings: { ...DEFAULT_WIDGET_SETTINGS, accent: "red;}" } }) : null) });
    const ok = await createConfigHandler(d)(get("pk_x"));
    expect((await ok.json()).accent).toBeNull();
    const missing = await createConfigHandler(d)(get("pk_nope"));
    expect(missing.status).toBe(404);
  });
});
