import { beforeEach, describe, expect, it, vi } from "vitest";
import { usageCounters, workspaces, type Workspace } from "@/lib/db/schema";

// A tiny in-memory stand-in for the Drizzle query builder: enough for the
// workspace lookup and the locked usage counter in lib/billing/entitlements.
const store = vi.hoisted(() => ({
  workspace: null as Record<string, unknown> | null,
  counter: 0,
  counterUpdates: 0,
}));

vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");

  function rowsFor(table: unknown): unknown[] {
    if (table === schema.workspaces) return store.workspace ? [store.workspace] : [];
    if (table === schema.usageCounters) return [{ count: store.counter, metric: "feedback_items_per_month" }];
    return [];
  }

  function chain(getRows: () => unknown[]) {
    const c: Record<string, unknown> = {};
    for (const m of ["where", "limit", "orderBy", "for", "innerJoin", "onConflictDoNothing", "onConflictDoUpdate", "returning"]) {
      c[m] = () => c;
    }
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(getRows()).then(res, rej);
    return c;
  }

  const api = {
    select: () => ({ from: (table: unknown) => chain(() => rowsFor(table)) }),
    insert: () => ({ values: () => chain(() => []) }),
    update: (table: unknown) => ({
      set: () => {
        if (table === schema.usageCounters) store.counterUpdates += 1;
        return chain(() => []);
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(api),
  };
  return { db: api, getDb: () => api };
});

vi.mock("@/lib/auth/workspace", () => ({ countSeats: async () => 1 }));

const {
  GRACE_PERIOD_MS,
  PlanError,
  assertAndConsume,
  assertFeature,
  assertWithinLimit,
  consumeUsage,
  currentPeriod,
  featureGateMessage,
  getWorkspacePlan,
  grantable,
  limitMessage,
  resolveEffectivePlan,
  trialDaysLeft,
} = await import("@/lib/billing/entitlements");

function ws(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws_1",
    name: "Acme",
    slug: "acme",
    ownerId: "u_1",
    plan: "free",
    planInterval: null,
    planCurrency: null,
    planStatus: "none",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    razorpaySubscriptionId: null,
    trialEndsAt: null,
    trialReminderSentAt: null,
    trialEndedAt: null,
    timezone: "UTC",
    onboardingAnswers: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  store.workspace = ws();
  store.counter = 0;
  store.counterUpdates = 0;
});

describe("resolveEffectivePlan", () => {
  const now = new Date("2026-11-10T12:00:00Z");

  it("keeps free workspaces on Free", () => {
    const s = resolveEffectivePlan(ws(), now);
    expect(s.plan.id).toBe("free");
    expect(s.isPaid).toBe(false);
  });

  it("gives Pro with status trialing during the 14-day reverse trial, then Free", () => {
    const trialing = resolveEffectivePlan(ws({ trialEndsAt: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000) }), now);
    expect(trialing.plan.id).toBe("pro");
    expect(trialing.status).toBe("trialing");
    expect(trialing.isPaid).toBe(false);
    expect(trialDaysLeft(trialing.trialEndsAt, now)).toBe(9);
    const over = resolveEffectivePlan(ws({ trialEndsAt: new Date(now.getTime() - 1000) }), now);
    expect(over.plan.id).toBe("free");
    expect(over.trialEndsAt).toBeNull();
    // A paid plan wins over a running trial.
    const paid = resolveEffectivePlan(
      ws({ plan: "team", planStatus: "active", trialEndsAt: new Date(now.getTime() + 60_000) }),
      now,
    );
    expect(paid.plan.id).toBe("team");
    expect(paid.status).toBe("active");
  });

  it("grants the paid plan while active or authenticated", () => {
    expect(resolveEffectivePlan(ws({ plan: "pro", planStatus: "active" }), now).plan.id).toBe("pro");
    expect(resolveEffectivePlan(ws({ plan: "team", planStatus: "authenticated" }), now).plan.id).toBe("team");
  });

  it("keeps paid features for 3 days after the period ends when late or cancelled", () => {
    for (const status of ["past_due", "cancelled", "halted", "completed"] as const) {
      const inGrace = ws({ plan: "pro", planStatus: status, currentPeriodEnd: new Date(now.getTime() - GRACE_PERIOD_MS + 60_000) });
      const expired = ws({ plan: "pro", planStatus: status, currentPeriodEnd: new Date(now.getTime() - GRACE_PERIOD_MS - 60_000) });
      expect(resolveEffectivePlan(inGrace, now).plan.id).toBe("pro");
      expect(resolveEffectivePlan(expired, now).plan.id).toBe("free");
    }
  });

  it("treats a cancelled plan still inside its period as paid", () => {
    const s = resolveEffectivePlan(
      ws({ plan: "pro", planStatus: "cancelled", cancelAtPeriodEnd: true, currentPeriodEnd: new Date("2026-11-20T00:00:00Z") }),
      now,
    );
    expect(s.isPaid).toBe(true);
    expect(s.cancelAtPeriodEnd).toBe(true);
  });

  it("falls back to Free for unpaid or unknown states", () => {
    expect(resolveEffectivePlan(ws({ plan: "pro", planStatus: "created" }), now).plan.id).toBe("free");
    expect(resolveEffectivePlan(ws({ plan: "pro", planStatus: "none" }), now).plan.id).toBe("free");
    expect(resolveEffectivePlan(ws({ plan: "pro", planStatus: "past_due", currentPeriodEnd: null }), now).plan.id).toBe("free");
  });
});

describe("messages", () => {
  it("states feature gates factually", () => {
    expect(featureGateMessage("slack_alerts")).toBe("Slack alerts are on Pro and Team.");
    expect(featureGateMessage("auto_file")).toBe("Auto-file to Linear and GitHub is on Pro and Team.");
    expect(featureGateMessage("team_members")).toBe("Admin roles for team members are on Team.");
    expect(featureGateMessage("competitor_tracking")).toBe("Competitor tracking is on Pro and Team.");
  });

  it("states limits with numbers", () => {
    expect(limitMessage("sources_per_product", 3)).toBe("Your plan includes 3 sources per product.");
    expect(limitMessage("products", 1)).toBe("Your plan includes 1 product.");
    expect(limitMessage("feedback_items_per_month", 500)).toBe("You have used all 500 feedback items on your plan this month.");
  });
});

describe("pure helpers", () => {
  it("formats the UTC month", () => {
    expect(currentPeriod(new Date("2026-11-30T23:59:59Z"))).toBe("2026-11");
    expect(currentPeriod(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01");
  });

  it("grants up to the remaining quota", () => {
    expect(grantable(10, 495, 500)).toBe(5);
    expect(grantable(10, 500, 500)).toBe(0);
    expect(grantable(10, 600, 500)).toBe(0);
    expect(grantable(10, 0, -1)).toBe(10);
    expect(grantable(0, 0, 500)).toBe(0);
  });
});

describe("DB-backed checks", () => {
  it("reads the workspace plan", async () => {
    store.workspace = ws({ plan: "team", planStatus: "active" });
    expect((await getWorkspacePlan("ws_1")).plan.id).toBe("team");
  });

  it("404s for a missing workspace", async () => {
    store.workspace = null;
    await expect(getWorkspacePlan("nope")).rejects.toMatchObject({ status: 404 });
  });

  it("assertFeature throws a 402 plan_required", async () => {
    try {
      await assertFeature("ws_1", "slack_alerts");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PlanError);
      expect(err).toMatchObject({ status: 402, code: "plan_required", extra: { feature: "slack_alerts", requiredPlan: "pro" } });
    }
    store.workspace = ws({ plan: "pro", planStatus: "active" });
    await expect(assertFeature("ws_1", "slack_alerts")).resolves.toBeUndefined();
  });

  it("assertWithinLimit checks current + adding", async () => {
    await expect(assertWithinLimit("ws_1", "sources_per_product", 2)).resolves.toBeUndefined();
    await expect(assertWithinLimit("ws_1", "sources_per_product", 3)).rejects.toMatchObject({
      status: 402,
      code: "limit_reached",
      extra: { limit: "sources_per_product", used: 3, max: 3, requiredPlan: "pro" },
    });
    await expect(assertWithinLimit("ws_1", "products", 1, 4)).rejects.toMatchObject({ extra: { requiredPlan: "team" } });
  });

  it("consumeUsage grants partial amounts and records them", async () => {
    store.counter = 495;
    await expect(consumeUsage("ws_1", "feedback_items_per_month", 10)).resolves.toEqual({ allowed: 5, used: 500, max: 500 });
    expect(store.counterUpdates).toBe(1);
  });

  it("consumeUsage grants nothing when exhausted", async () => {
    store.counter = 500;
    await expect(consumeUsage("ws_1", "feedback_items_per_month", 3)).resolves.toEqual({ allowed: 0, used: 500, max: 500 });
    expect(store.counterUpdates).toBe(0);
  });

  it("consumeUsage is unlimited on paid metrics", async () => {
    store.workspace = ws({ plan: "pro", planStatus: "active" });
    store.counter = 1000;
    await expect(consumeUsage("ws_1", "prds_per_month", 7)).resolves.toEqual({ allowed: 7, used: 1007, max: -1 });
  });

  it("assertAndConsume is all-or-nothing", async () => {
    store.counter = 3;
    await expect(assertAndConsume("ws_1", "manual_runs_per_month", 2)).rejects.toMatchObject({
      status: 402,
      code: "limit_reached",
      extra: { limit: "manual_runs_per_month", used: 3, max: 4, requiredPlan: "pro" },
    });
    expect(store.counterUpdates).toBe(0);
    await expect(assertAndConsume("ws_1", "manual_runs_per_month", 1)).resolves.toBeUndefined();
    expect(store.counterUpdates).toBe(1);
  });
});

// Keep the imported tables referenced so the mock compares against the same objects.
void workspaces;
void usageCounters;
