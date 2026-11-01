import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RazorpaySubscription } from "@/lib/billing/razorpay";

// In-memory stand-in for the Drizzle query builder used by syncSubscription.
// Subscription lookups are answered in call order: first the incoming
// subscription's own row, then the workspace's current subscription.
const store = vi.hoisted(() => ({
  workspace: null as Record<string, unknown> | null,
  subscriptionSelects: [] as Array<Record<string, unknown> | null>,
  workspaceUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");

  function chain(getRows: () => unknown[]) {
    const c: Record<string, unknown> = {};
    for (const m of ["where", "limit", "orderBy", "onConflictDoUpdate", "onConflictDoNothing", "returning"]) {
      c[m] = () => c;
    }
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(getRows()).then(res, rej);
    return c;
  }

  const api = {
    select: () => ({
      from: (table: unknown) =>
        chain(() => {
          if (table === schema.workspaces) return store.workspace ? [store.workspace] : [];
          if (table === schema.subscriptions) {
            const next = store.subscriptionSelects.shift();
            return next ? [next] : [];
          }
          return [];
        }),
    }),
    insert: () => ({ values: () => chain(() => []) }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        if (table === schema.workspaces) store.workspaceUpdates.push(values);
        return chain(() => []);
      },
    }),
  };
  return { db: api, getDb: () => api };
});

const { syncSubscription, unusedPeriodCredit } = await import("@/lib/billing/sync");

function sub(id: string, overrides: Partial<RazorpaySubscription> = {}): RazorpaySubscription {
  return {
    id,
    plan_id: "plan_unknown",
    status: "active",
    current_start: 1_760_000_000,
    current_end: 1_762_600_000,
    charge_at: null,
    total_count: 120,
    paid_count: 1,
    notes: { workspace_id: "ws_1", plan: "pro", interval: "month", currency: "USD" },
    ...overrides,
  };
}

function subscriptionRow(id: string, createdAt: Date, status = "active") {
  return {
    workspaceId: "ws_1",
    razorpaySubscriptionId: id,
    plan: "pro",
    interval: "month",
    currency: "USD",
    status,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt,
  };
}

beforeEach(() => {
  store.workspace = {
    id: "ws_1",
    plan: "team",
    planStatus: "active",
    razorpaySubscriptionId: "sub_current",
  };
  store.subscriptionSelects = [];
  store.workspaceUpdates = [];
});

describe("syncSubscription takeover", () => {
  it("keeps the workspace on its current subscription when an older replaced one sends a late event", async () => {
    store.subscriptionSelects = [
      subscriptionRow("sub_old", new Date("2026-09-01T00:00:00Z")),
      { status: "active", createdAt: new Date("2026-10-01T00:00:00Z") },
    ];
    const result = await syncSubscription(sub("sub_old"));
    expect(store.workspaceUpdates).toHaveLength(0);
    expect(result).toEqual({ workspaceId: "ws_1", plan: "team", status: "active", owns: false });
  });

  it("moves the workspace to a newer paid subscription", async () => {
    store.subscriptionSelects = [
      subscriptionRow("sub_new", new Date("2026-10-20T00:00:00Z")),
      { status: "active", createdAt: new Date("2026-10-01T00:00:00Z") },
    ];
    const result = await syncSubscription(sub("sub_new"));
    expect(store.workspaceUpdates).toHaveLength(1);
    expect(store.workspaceUpdates[0]).toMatchObject({ plan: "pro", razorpaySubscriptionId: "sub_new" });
    expect(result).toEqual({ workspaceId: "ws_1", plan: "pro", status: "active", owns: true });
  });

  it("takes over when the current subscription is no longer live", async () => {
    store.subscriptionSelects = [
      subscriptionRow("sub_old", new Date("2026-09-01T00:00:00Z")),
      { status: "cancelled", createdAt: new Date("2026-10-01T00:00:00Z") },
    ];
    await syncSubscription(sub("sub_old"));
    expect(store.workspaceUpdates).toHaveLength(1);
    expect(store.workspaceUpdates[0]).toMatchObject({ razorpaySubscriptionId: "sub_old" });
  });

  it("never lets an unpaid subscription from elsewhere take over", async () => {
    store.subscriptionSelects = [subscriptionRow("sub_other", new Date("2026-10-20T00:00:00Z"), "halted")];
    await syncSubscription(sub("sub_other", { status: "halted" }));
    expect(store.workspaceUpdates).toHaveLength(0);
  });

  it("always updates the workspace's own subscription", async () => {
    store.subscriptionSelects = [subscriptionRow("sub_current", new Date("2026-10-01T00:00:00Z"))];
    await syncSubscription(sub("sub_current", { status: "halted" }));
    expect(store.workspaceUpdates).toHaveLength(1);
    expect(store.workspaceUpdates[0]).toMatchObject({ planStatus: "halted" });
  });
});

describe("unusedPeriodCredit", () => {
  const period = {
    plan: "pro" as const,
    interval: "month" as const,
    currency: "USD" as const,
    currentPeriodStart: new Date("2026-11-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
  };

  it("credits the unused share of the period in cents", () => {
    // Halfway through a $19 month: $9.50.
    expect(unusedPeriodCredit(period, new Date("2026-11-16T00:00:00Z"))).toBe(950);
  });

  it("credits nothing outside the period or without dates", () => {
    expect(unusedPeriodCredit(period, new Date("2026-12-02T00:00:00Z"))).toBe(0);
    expect(unusedPeriodCredit({ ...period, currentPeriodStart: null }, new Date("2026-11-16T00:00:00Z"))).toBe(0);
  });
});
