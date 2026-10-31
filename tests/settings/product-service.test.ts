import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_SETTINGS, type Product } from "@/lib/db/schema";

const h = vi.hoisted(() => ({
  autoFile: true,
  connected: [] as string[],
  monitoredOthers: 0,
  productLimit: 1,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/billing/entitlements", async () => {
  const { HttpError } = await import("@/lib/auth/http");
  return {
    assertFeature: async (_ws: string, key: string) => {
      if (key === "auto_file" && !h.autoFile) {
        throw new HttpError(402, "plan_required", "Auto-file to Linear and GitHub is on Pro and Team.", {
          feature: "auto_file",
          requiredPlan: "pro",
        });
      }
    },
    assertWithinLimit: async (_ws: string, key: string, current: number) => {
      if (key === "products" && current + 1 > h.productLimit) {
        throw new HttpError(402, "limit_reached", "Your plan includes 1 product.", { limit: "products", requiredPlan: "pro" });
      }
    },
    getWorkspacePlan: async () => {
      const { PLANS } = await import("@/lib/plans");
      return { plan: PLANS.pro };
    },
  };
});

vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  function chain(rows: () => unknown[]) {
    const c: Record<string, unknown> = {};
    for (const m of ["where", "limit", "orderBy"]) c[m] = () => c;
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(rows()).then(res, rej);
    return c;
  }
  const db = {
    select: () => ({
      from: (table: unknown) =>
        chain(() => {
          if (table === schema.integrations) return h.connected.length ? [{ id: "int" }] : [];
          if (table === schema.products) return [{ n: h.monitoredOthers }];
          return [];
        }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            h.updates.push(values);
            return [{ ...product(), ...values }];
          },
        }),
      }),
    }),
  };
  return { db, getDb: () => db };
});

vi.mock("@/lib/auth/tokens", () => ({ generatePublicKey: () => "pk_new" }));

const { updateProduct } = await import("@/app/api/products/_lib/service");

function product(overrides: Partial<Product> = {}): Product {
  const now = new Date("2026-11-01T00:00:00Z");
  return {
    id: "prod-1",
    workspaceId: "ws-1",
    name: "Acme",
    websiteUrl: null,
    description: null,
    publicKey: "pk_old",
    monitoringEnabled: true,
    lastRunAt: null,
    nextRunAt: null,
    alertThreshold: 70,
    autofileEnabled: false,
    autofileTarget: null,
    autofileThreshold: 80,
    widgetSettings: DEFAULT_WIDGET_SETTINGS,
    allowedOrigins: [],
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const ctx = {
  user: { id: "u", email: "a@b.c", name: null, image: null, onboardedAt: new Date() },
  workspace: { id: "ws-1" },
  role: "owner",
} as never;

beforeEach(() => {
  h.autoFile = true;
  h.connected = [];
  h.monitoredOthers = 0;
  h.productLimit = 1;
  h.updates = [];
});

describe("updateProduct", () => {
  it("merges widget settings and saves plain fields", async () => {
    const row = await updateProduct(ctx, product(), {
      name: "Acme Notes",
      widgetSettings: { buttonLabel: "Ideas" },
      allowedOrigins: ["https://acme.com"],
    });
    expect(h.updates[0]).toEqual({
      name: "Acme Notes",
      widgetSettings: { ...DEFAULT_WIDGET_SETTINGS, buttonLabel: "Ideas" },
      allowedOrigins: ["https://acme.com"],
    });
    expect(row.name).toBe("Acme Notes");
  });

  it("needs auto_file to turn on auto-filing", async () => {
    h.autoFile = false;
    await expect(updateProduct(ctx, product(), { autofileEnabled: true, autofileTarget: "linear" })).rejects.toMatchObject({
      status: 402,
      code: "plan_required",
    });
  });

  it("needs a connected integration for the target", async () => {
    await expect(updateProduct(ctx, product(), { autofileEnabled: true, autofileTarget: "linear" })).rejects.toMatchObject({
      status: 400,
      message: "Connect Linear in Settings first.",
    });
    await expect(updateProduct(ctx, product(), { autofileEnabled: true })).rejects.toMatchObject({ status: 400 });
    h.connected = ["github"];
    await updateProduct(ctx, product(), { autofileEnabled: true, autofileTarget: "github" });
    expect(h.updates[0]).toMatchObject({ autofileEnabled: true, autofileTarget: "github" });
  });

  it("allows turning auto-filing off without checks", async () => {
    h.autoFile = false;
    await updateProduct(ctx, product({ autofileEnabled: true, autofileTarget: "linear" }), { autofileEnabled: false });
    expect(h.updates[0]).toEqual({ autofileEnabled: false });
  });

  it("checks the products limit when monitoring is turned back on", async () => {
    h.monitoredOthers = 1;
    await expect(updateProduct(ctx, product({ monitoringEnabled: false }), { monitoringEnabled: true })).rejects.toMatchObject({
      status: 402,
    });
    h.monitoredOthers = 0;
    await updateProduct(ctx, product({ monitoringEnabled: false }), { monitoringEnabled: true });
    expect(h.updates[0].monitoringEnabled).toBe(true);
    expect(h.updates[0].nextRunAt).toBeInstanceOf(Date);
  });
});
