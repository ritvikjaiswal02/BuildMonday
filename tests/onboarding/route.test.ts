import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/auth/http";
import { PLANS } from "@/lib/plans";

const h = vi.hoisted(() => ({
  ctx: null as null | Record<string, unknown>,
  plan: "free" as "free" | "pro" | "team",
  productCount: 0,
  limitError: null as Error | null,
  inserts: [] as Array<{ table: string; values: unknown }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => {
    if (!h.ctx) {
      const { HttpError: E } = await import("@/lib/auth/http");
      throw new E(401, "unauthorized", "Sign in to continue.");
    }
    return h.ctx;
  },
}));

vi.mock("@/lib/billing/entitlements", () => ({
  getWorkspacePlan: async () => {
    const { PLANS: P } = await import("@/lib/plans");
    return { plan: P[h.plan] };
  },
  assertWithinLimit: async () => {
    if (h.limitError) throw h.limitError;
  },
  assertWithinPlanLimit: () => {
    if (h.limitError) throw h.limitError;
  },
  withWorkspaceLimitLock: async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const { db } = await import("@/lib/db");
    return db.transaction(fn as never);
  },
}));

vi.mock("@/lib/sources", () => ({
  validateSourceConfig: (kind: string, config: Record<string, unknown>) =>
    kind === "trustpilot" && typeof config.domain !== "string"
      ? { ok: false, error: "Add the domain." }
      : { ok: true, config },
  sourceLabel: (kind: string, config: Record<string, unknown>) => `${kind}:${String(config.domain ?? config.appId ?? "")}`,
}));

vi.mock("@/app/api/products/_lib/service", () => ({
  countActiveProducts: async () => h.productCount,
  insertProduct: async (_tx: unknown, args: Record<string, unknown>) => ({
    id: "prod-1",
    publicKey: "pk_test",
    ...args,
  }),
}));

vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const name = (t: unknown) =>
    t === schema.sources ? "sources" : t === schema.users ? "users" : t === schema.workspaces ? "workspaces" : t === schema.workspaceMembers ? "members" : "other";
  const tx = {
    insert: (table: unknown) => ({
      values: (values: Array<Record<string, unknown>>) => {
        h.inserts.push({ table: name(table), values });
        return {
          returning: async () =>
            values.map((v, i) => ({
              id: `src-${i}`,
              lastFetchedAt: null,
              lastSuccessAt: null,
              lastError: null,
              lastItemCount: null,
              createdAt: new Date("2026-11-01T00:00:00Z"),
              updatedAt: new Date("2026-11-01T00:00:00Z"),
              ...v,
            })),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          h.updates.push({ table: name(table), values });
        },
      }),
    }),
  };
  const db = { transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { db, getDb: () => db };
});

const { POST } = await import("@/app/api/onboarding/route");

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "user-1", email: "ana@acme.com", name: "Ana", image: null, onboardedAt: null },
    workspace: { id: "ws-1", name: "Ana's workspace", onboardingAnswers: null },
    role: "owner",
    ...overrides,
  };
}

const body = {
  product: { name: "Acme Notes", websiteUrl: "acme.com", description: "Notes for students." },
  sources: [
    { kind: "trustpilot", config: { domain: "a.com" }, role: "own" },
    { kind: "trustpilot", config: { domain: "b.com" }, role: "own" },
    { kind: "trustpilot", config: { domain: "c.com" }, role: "own" },
    { kind: "trustpilot", config: { domain: "d.com" }, role: "own" },
    { kind: "trustpilot", config: { domain: "rival.com" }, role: "competitor", competitorName: "Rival" },
    { kind: "trustpilot", config: {}, role: "own" },
  ],
  team: { role: "founder", size: "2-5", tracker: "linear", usesSlack: true },
  notifications: { digest: false, alerts: "all", timezone: "Asia/Kolkata" },
};

function post(payload: unknown, query = "") {
  return POST(
    new Request(`http://localhost/api/onboarding${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    { params: {} },
  );
}

beforeEach(() => {
  h.ctx = ctx();
  h.plan = "free";
  h.productCount = 0;
  h.limitError = null;
  h.inserts = [];
  h.updates = [];
});

describe("POST /api/onboarding", () => {
  it("requires a session", async () => {
    h.ctx = null;
    const res = await post(body);
    expect(res.status).toBe(401);
  });

  it("creates the product and sources with Free plan rules, stores answers and sets the product cookie", async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.productId).toBe("prod-1");
    expect(json.sources.map((s: { config: { domain: string }; enabled: boolean }) => [s.config.domain, s.enabled])).toEqual([
      ["a.com", true],
      ["b.com", true],
      ["c.com", true],
      ["d.com", false],
    ]);
    expect(json.skipped.map((s: { reason: string }) => s.reason).sort()).toEqual(["invalid", "limit", "plan"]);
    expect(res.headers.get("set-cookie")).toMatch(/bm_product=prod-1/);

    const ws = h.updates.find((u) => u.table === "workspaces")!.values;
    expect(ws.timezone).toBe("Asia/Kolkata");
    expect(ws.name).toBe("Acme Notes");
    expect(ws.onboardingAnswers).toMatchObject({ team: body.team, notifications: body.notifications });
    expect(h.updates.find((u) => u.table === "members")!.values).toEqual({ notifyDigest: false, alertMode: "all" });
    expect(h.updates.find((u) => u.table === "users")!.values.onboardedAt).toBeInstanceOf(Date);
  });

  it("keeps competitor sources on Pro", async () => {
    h.plan = "pro";
    const res = await post(body);
    const json = await res.json();
    expect(json.sources).toHaveLength(5);
    expect(json.sources.find((s: { role: string }) => s.role === "competitor")).toMatchObject({
      competitorName: "Rival",
      enabled: true,
    });
    expect(PLANS.pro.limits.sources_per_product).toBe(10);
  });

  it("only adds the product and sources with ?new=1", async () => {
    h.ctx = ctx({ user: { id: "user-1", email: "a@b.c", name: null, image: null, onboardedAt: new Date() } });
    h.productCount = 1;
    const res = await post(body, "?new=1");
    expect(res.status).toBe(201);
    expect(h.updates.map((u) => u.table)).toEqual([]);
  });

  it("returns 402 when the product limit is reached", async () => {
    h.productCount = 1;
    h.limitError = new HttpError(402, "limit_reached", "Your plan includes 1 product.", {
      limit: "products",
      used: 1,
      max: 1,
      requiredPlan: "pro",
    });
    const res = await post(body, "?new=1");
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "limit_reached", limit: "products", requiredPlan: "pro" });
    expect(h.inserts).toEqual([]);
  });

  it("rejects members and invalid bodies", async () => {
    h.ctx = ctx({ role: "member" });
    expect((await post(body)).status).toBe(403);
    h.ctx = ctx();
    const res = await post({ ...body, product: { name: "" } });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_request");
  });
});
