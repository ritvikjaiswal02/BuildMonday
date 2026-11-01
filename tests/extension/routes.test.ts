import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks: a tiny stand-in for the Drizzle query builder that answers by table,
// plus the auth, rate-limit, entitlement and ingest boundaries.
// ---------------------------------------------------------------------------

const store = vi.hoisted(() => ({
  products: [] as Array<Record<string, unknown>>,
  users: [] as Array<Record<string, unknown>>,
  tokenRows: [] as Array<Record<string, unknown>>,
  tokenJoinRows: [] as Array<Record<string, unknown>>,
  tokenCount: 0,
}));

vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  function rowsFor(table: unknown, selection: Record<string, unknown> | undefined): unknown[] {
    if (table === schema.products) return store.products;
    if (table === schema.users) return store.users;
    if (table === schema.apiTokens) {
      if (selection && "n" in selection) return [{ n: store.tokenCount }];
      if (selection && "token" in selection) return store.tokenJoinRows;
      return store.tokenRows;
    }
    return [];
  }
  function select(selection?: Record<string, unknown>) {
    let table: unknown;
    const c: Record<string, unknown> = {};
    c.from = (t: unknown) => {
      table = t;
      return c;
    };
    for (const m of ["where", "limit", "orderBy", "leftJoin", "innerJoin", "groupBy"]) c[m] = () => c;
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(rowsFor(table, selection)).then(res, rej);
    return c;
  }
  const db = { select };
  return { db, getDb: () => db };
});

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  createApiToken: vi.fn(),
  revokeApiToken: vi.fn(),
  rateLimit: vi.fn(),
  requireUser: vi.fn(),
  listProducts: vi.fn(),
  getWorkspacePlan: vi.fn(),
  getUsage: vi.fn(),
  ingestFeedback: vi.fn(),
}));

vi.mock("@/lib/auth/tokens", () => ({
  authenticateBearer: mocks.authenticateBearer,
  createApiToken: mocks.createApiToken,
  revokeApiToken: mocks.revokeApiToken,
}));

vi.mock("@/lib/auth/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rate-limit")>();
  return { ...actual, rateLimit: mocks.rateLimit };
});

vi.mock("@/lib/auth/session", () => ({
  requireUser: mocks.requireUser,
  listProducts: mocks.listProducts,
  hasRole: (ctx: { role: string }, min: string) => {
    const rank: Record<string, number> = { member: 0, admin: 1, owner: 2 };
    return rank[ctx.role] >= rank[min];
  },
}));

vi.mock("@/lib/billing/entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/entitlements")>();
  return { ...actual, getWorkspacePlan: mocks.getWorkspacePlan, getUsage: mocks.getUsage };
});

vi.mock("@/lib/feedback/ingest", () => ({ ingestFeedback: mocks.ingestFeedback }));

import { PLANS } from "@/lib/plans";
import { GET as meGET, OPTIONS as meOPTIONS } from "@/app/api/extension/me/route";
import { POST as clipPOST, OPTIONS as clipOPTIONS } from "@/app/api/extension/clip/route";
import { GET as tokensGET, POST as tokensPOST } from "@/app/api/extension/tokens/route";
import { DELETE as tokenDELETE } from "@/app/api/extension/tokens/[id]/route";
import { TOKEN_INVALID_MESSAGE } from "@/app/api/extension/_lib/service";

const EXT_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const PRODUCT_ID = "6f1c2b9e-1111-4c4c-8888-222233334444";
const WORKSPACE = { id: "ws-1", name: "Acme workspace", plan: "free" };
const TOKEN = { id: "tok-1", userId: "user-1", workspaceId: "ws-1" };
const ctx = { params: {} as Record<string, string> };

function extRequest(path: string, init: { method?: string; body?: unknown; origin?: string | null; auth?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (init.origin !== null) headers.Origin = init.origin ?? EXT_ORIGIN;
  if (init.auth !== null) headers.Authorization = init.auth ?? "Bearer bm_ext_abcdefghijklmnopqrstuvwx";
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function planState(id: "free" | "pro" | "team") {
  return {
    plan: PLANS[id],
    status: "active",
    interval: null,
    currency: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    isPaid: id !== "free",
  };
}

beforeEach(() => {
  store.products = [{ id: PRODUCT_ID, name: "Acme Notes", workspaceId: "ws-1" }];
  store.users = [{ email: "ritvik@example.com", name: "Ritvik" }];
  store.tokenRows = [];
  store.tokenJoinRows = [];
  store.tokenCount = 0;
  mocks.authenticateBearer.mockReset().mockResolvedValue({ token: TOKEN, workspace: WORKSPACE, userId: "user-1" });
  mocks.rateLimit.mockReset().mockResolvedValue({ ok: true, remaining: 59, resetAt: new Date(Date.now() + 60_000) });
  mocks.listProducts.mockReset().mockResolvedValue([{ id: PRODUCT_ID, name: "Acme Notes" }]);
  mocks.getWorkspacePlan.mockReset().mockResolvedValue(planState("free"));
  mocks.getUsage.mockReset().mockResolvedValue(12);
  mocks.ingestFeedback.mockReset().mockResolvedValue({ inserted: 2, duplicates: 1, rejected: 0, ids: ["a", "b"], quotaExceeded: false });
  mocks.requireUser.mockReset().mockResolvedValue({
    user: { id: "user-1", email: "ritvik@example.com", name: "Ritvik", image: null, onboardedAt: new Date() },
    workspace: WORKSPACE,
    role: "member",
  });
  mocks.createApiToken.mockReset();
  mocks.revokeApiToken.mockReset().mockResolvedValue(true);
});

describe("GET /api/extension/me", () => {
  it("returns 401 with the fix-it message and CORS headers when the token is not valid", async () => {
    mocks.authenticateBearer.mockResolvedValue(null);
    const res = await meGET(extRequest("/api/extension/me"), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: TOKEN_INVALID_MESSAGE, code: "unauthorized" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXT_ORIGIN);
  });

  it("returns the user, workspace, products and clip usage", async () => {
    const res = await meGET(extRequest("/api/extension/me"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ email: "ritvik@example.com", name: "Ritvik" });
    expect(body.workspace).toEqual({ id: "ws-1", name: "Acme workspace", plan: "free" });
    expect(body.products).toEqual([{ id: PRODUCT_ID, name: "Acme Notes" }]);
    expect(body.clips).toEqual({ used: 12, max: 100 });
    expect(body.inboxUrl).toMatch(/\/inbox$/);
  });

  it("rate limits per token", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, remaining: 0, resetAt: new Date(Date.now() + 30_000) });
    const res = await meGET(extRequest("/api/extension/me"), ctx);
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate_limited");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mocks.rateLimit).toHaveBeenCalledWith("ext:tok-1", { limit: 60, windowSec: 60 });
  });

  it("answers preflight for extension origins only", () => {
    const ok = meOPTIONS(extRequest("/api/extension/me", { method: "OPTIONS" }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(EXT_ORIGIN);
    expect(ok.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");

    const web = meOPTIONS(extRequest("/api/extension/me", { method: "OPTIONS", origin: "https://evil.example" }));
    expect(web.status).toBe(204);
    expect(web.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("POST /api/extension/clip", () => {
  const body = {
    productId: PRODUCT_ID,
    items: [
      { text: "The app logs me out every morning", site: "playstore", rating: 2, externalId: "gp:1" },
      { text: "Pricing page is confusing", site: "g2" },
    ],
  };

  it("stores clips through the shared ingest function", async () => {
    const res = await clipPOST(extRequest("/api/extension/clip", { method: "POST", body }), ctx);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ inserted: 2, duplicates: 1, rejected: 0, product: { id: PRODUCT_ID, name: "Acme Notes" } });
    expect(json.inboxUrl).toMatch(/\/inbox$/);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXT_ORIGIN);

    expect(mocks.ingestFeedback).toHaveBeenCalledTimes(1);
    const args = mocks.ingestFeedback.mock.calls[0][0];
    expect(args).toMatchObject({
      workspaceId: "ws-1",
      productId: PRODUCT_ID,
      channel: "extension",
      quotaMetric: "extension_clips_per_month",
    });
    expect(args.items[0]).toMatchObject({ sourceKind: "playstore", rating: 2, meta: { site: "playstore", clippedBy: "user-1" } });
    expect(args.items[1]).toMatchObject({ sourceKind: "extension", meta: { site: "g2" } });
  });

  it("rejects a missing token before reading the body", async () => {
    mocks.authenticateBearer.mockResolvedValue(null);
    const res = await clipPOST(extRequest("/api/extension/clip", { method: "POST", body, auth: null }), ctx);
    expect(res.status).toBe(401);
    expect(mocks.ingestFeedback).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    const res = await clipPOST(extRequest("/api/extension/clip", { method: "POST", body: { productId: PRODUCT_ID, items: [] } }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_request");
  });

  it("returns 404 when the product is not in the token's workspace", async () => {
    store.products = [];
    const res = await clipPOST(extRequest("/api/extension/clip", { method: "POST", body }), ctx);
    expect(res.status).toBe(404);
    expect(mocks.ingestFeedback).not.toHaveBeenCalled();
  });

  it("returns 413 above 256 KB", async () => {
    const big = { productId: PRODUCT_ID, items: Array.from({ length: 20 }, () => ({ text: "x".repeat(15_000) })) };
    const res = await clipPOST(extRequest("/api/extension/clip", { method: "POST", body: big }), ctx);
    expect(res.status).toBe(413);
  });

  it("returns 402 for the clip limit when nothing could be stored", async () => {
    mocks.ingestFeedback.mockResolvedValue({ inserted: 0, duplicates: 0, rejected: 0, ids: [], quotaExceeded: true });
    mocks.getUsage.mockImplementation(async (_ws: string, metric: string) => (metric === "extension_clips_per_month" ? 100 : 40));
    const res = await clipPOST(extRequest("/api/extension/clip", { method: "POST", body }), ctx);
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json).toMatchObject({
      code: "limit_reached",
      limit: "extension_clips_per_month",
      used: 100,
      max: 100,
      requiredPlan: "pro",
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXT_ORIGIN);
  });

  it("reports the feedback limit when clips remain but feedback items are used up", async () => {
    mocks.ingestFeedback.mockResolvedValue({ inserted: 0, duplicates: 0, rejected: 0, ids: [], quotaExceeded: true });
    mocks.getUsage.mockImplementation(async (_ws: string, metric: string) => (metric === "extension_clips_per_month" ? 10 : 500));
    const res = await clipPOST(extRequest("/api/extension/clip", { method: "POST", body }), ctx);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ limit: "feedback_items_per_month", used: 500, max: 500 });
  });

  it("still answers 201 when part of the batch fits the quota", async () => {
    mocks.ingestFeedback.mockResolvedValue({ inserted: 1, duplicates: 0, rejected: 0, ids: ["a"], quotaExceeded: true });
    const res = await clipPOST(extRequest("/api/extension/clip", { method: "POST", body }), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ inserted: 1, quotaExceeded: true });
  });

  it("answers preflight with POST allowed", () => {
    const res = clipOPTIONS(extRequest("/api/extension/clip", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

describe("extension tokens", () => {
  const record = {
    id: "tok-new",
    name: "Chrome on Mac",
    prefix: "bm_ext_A1b2C",
    lastUsedAt: null,
    createdAt: new Date().toISOString(),
    revokedAt: null,
  };

  function sessionRequest(path: string, method: string, body?: unknown) {
    return new Request(`http://localhost:3000${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  it("lists the member's tokens with owner details", async () => {
    store.tokenJoinRows = [
      {
        token: { id: "t1", userId: "user-1", name: "Laptop", prefix: "bm_ext_abcde", lastUsedAt: null, revokedAt: null, createdAt: new Date("2026-10-01T00:00:00Z") },
        ownerName: "Ritvik",
        ownerEmail: "ritvik@example.com",
      },
    ];
    const res = await tokensGET(sessionRequest("/api/extension/tokens", "GET"), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tokens).toHaveLength(1);
    expect(json.tokens[0]).toMatchObject({ id: "t1", name: "Laptop", mine: true, owner: { email: "ritvik@example.com" } });
    expect(json.tokens[0]).not.toHaveProperty("tokenHash");
  });

  it("requires a session", async () => {
    const { HttpError } = await import("@/lib/auth/http");
    mocks.requireUser.mockRejectedValue(new HttpError(401, "unauthorized", "Sign in to continue."));
    const res = await tokensGET(sessionRequest("/api/extension/tokens", "GET"), ctx);
    expect(res.status).toBe(401);
  });

  it("creates a token and returns the plaintext once", async () => {
    mocks.createApiToken.mockResolvedValue({ token: "bm_ext_secretsecretsecretsecret", record });
    const res = await tokensPOST(sessionRequest("/api/extension/tokens", "POST", { name: " Chrome on Mac " }), ctx);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.token).toBe("bm_ext_secretsecretsecretsecret");
    expect(json.record).toMatchObject({ id: "tok-new", mine: true });
    expect(mocks.createApiToken).toHaveBeenCalledWith({ workspaceId: "ws-1", userId: "user-1", name: "Chrome on Mac" });
  });

  it("refuses an 11th active token", async () => {
    store.tokenCount = 10;
    const res = await tokensPOST(sessionRequest("/api/extension/tokens", "POST", { name: "One more" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("conflict");
    expect(mocks.createApiToken).not.toHaveBeenCalled();
  });

  it("validates the name", async () => {
    const res = await tokensPOST(sessionRequest("/api/extension/tokens", "POST", { name: "" }), ctx);
    expect(res.status).toBe(400);
  });

  it("lets a member revoke their own token", async () => {
    store.tokenRows = [{ userId: "user-1", revokedAt: null }];
    const res = await tokenDELETE(sessionRequest("/api/extension/tokens/t1", "DELETE"), { params: { id: "t1" } });
    expect(res.status).toBe(200);
    expect(mocks.revokeApiToken).toHaveBeenCalledWith("ws-1", "t1");
  });

  it("stops a member revoking someone else's token", async () => {
    store.tokenRows = [{ userId: "user-2", revokedAt: null }];
    const res = await tokenDELETE(sessionRequest("/api/extension/tokens/t2", "DELETE"), { params: { id: "t2" } });
    expect(res.status).toBe(403);
    expect(mocks.revokeApiToken).not.toHaveBeenCalled();
  });

  it("lets an admin revoke any workspace token", async () => {
    mocks.requireUser.mockResolvedValue({
      user: { id: "user-9", email: "admin@example.com", name: null, image: null, onboardedAt: new Date() },
      workspace: WORKSPACE,
      role: "admin",
    });
    store.tokenRows = [{ userId: "user-2", revokedAt: null }];
    const res = await tokenDELETE(sessionRequest("/api/extension/tokens/t2", "DELETE"), { params: { id: "t2" } });
    expect(res.status).toBe(200);
  });

  it("returns 404 for unknown or already revoked tokens", async () => {
    store.tokenRows = [];
    const missing = await tokenDELETE(sessionRequest("/api/extension/tokens/nope", "DELETE"), { params: { id: "nope" } });
    expect(missing.status).toBe(404);
    store.tokenRows = [{ userId: "user-1", revokedAt: new Date() }];
    const revoked = await tokenDELETE(sessionRequest("/api/extension/tokens/t1", "DELETE"), { params: { id: "t1" } });
    expect(revoked.status).toBe(404);
  });
});
