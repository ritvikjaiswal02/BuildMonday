import { describe, expect, it } from "vitest";
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  PLANS,
  PLAN_ORDER,
  UNLIMITED,
  computeNextRunAt,
  formatLimit,
  formatPrice,
  getPlan,
  hasFeature,
  isUnlimited,
  limitFor,
  minimumPlanFor,
  parsePlanError,
  plansWith,
} from "@/lib/plans";

describe("plan catalog", () => {
  it("orders plans from cheapest to most expensive", () => {
    expect(PLAN_ORDER).toEqual(["free", "pro", "team"]);
  });

  it("matches the spec prices", () => {
    expect(PLANS.free.prices).toEqual({ INR: { month: 0, year: 0 }, USD: { month: 0, year: 0 } });
    expect(PLANS.pro.prices).toEqual({ INR: { month: 1499, year: 14990 }, USD: { month: 19, year: 190 } });
    expect(PLANS.team.prices).toEqual({ INR: { month: 4999, year: 49990 }, USD: { month: 59, year: 590 } });
  });

  it("prices yearly at ten times monthly", () => {
    for (const id of PLAN_ORDER) {
      const p = PLANS[id].prices;
      expect(p.INR.year).toBe(p.INR.month * 10);
      expect(p.USD.year).toBe(p.USD.month * 10);
    }
  });

  it("matches the spec limits", () => {
    expect(PLANS.free.limits).toEqual({
      products: 1,
      sources_per_product: 3,
      competitors: 0,
      feedback_items_per_month: 500,
      manual_runs_per_month: 4,
      prds_per_month: 3,
      chat_messages_per_month: 20,
      extension_clips_per_month: 100,
      seats: 1,
      history_days: 30,
    });
    expect(PLANS.pro.limits).toEqual({
      products: 3,
      sources_per_product: 10,
      competitors: 2,
      feedback_items_per_month: 5000,
      manual_runs_per_month: 60,
      prds_per_month: UNLIMITED,
      chat_messages_per_month: UNLIMITED,
      extension_clips_per_month: UNLIMITED,
      seats: 2,
      history_days: 365,
    });
    expect(PLANS.team.limits).toEqual({
      products: 10,
      sources_per_product: 25,
      competitors: 10,
      feedback_items_per_month: 25000,
      manual_runs_per_month: 300,
      prds_per_month: UNLIMITED,
      chat_messages_per_month: UNLIMITED,
      extension_clips_per_month: UNLIMITED,
      seats: 10,
      history_days: 730,
    });
  });

  it("defines every limit and feature on every plan", () => {
    for (const id of PLAN_ORDER) {
      expect(Object.keys(PLANS[id].limits).sort()).toEqual([...LIMIT_KEYS].sort());
      expect(Object.keys(PLANS[id].features).sort()).toEqual([...FEATURE_KEYS].sort());
    }
  });

  it("matches the spec feature matrix", () => {
    for (const key of FEATURE_KEYS) expect(hasFeature("free", key)).toBe(false);
    const fromPro = [
      "daily_runs",
      "instant_email_alerts",
      "slack_alerts",
      "auto_file",
      "competitor_tracking",
      "export",
      "widget_unbranded",
    ] as const;
    for (const key of fromPro) {
      expect(hasFeature("pro", key)).toBe(true);
      expect(hasFeature("team", key)).toBe(true);
    }
    expect(hasFeature("pro", "team_members")).toBe(false);
    expect(hasFeature("pro", "priority_support")).toBe(false);
    expect(hasFeature("team", "team_members")).toBe(true);
    expect(hasFeature("team", "priority_support")).toBe(true);
  });

  it("runs weekly on Free and daily on paid plans", () => {
    expect(PLANS.free.runIntervalHours).toBe(168);
    expect(PLANS.pro.runIntervalHours).toBe(24);
    expect(PLANS.team.runIntervalHours).toBe(24);
  });

  it("uses the verbatim taglines", () => {
    expect(PLANS.free.tagline).toBe("Watch one product, get the Monday email.");
    expect(PLANS.pro.tagline).toBe("Daily monitoring, instant alerts and auto-filed issues.");
    expect(PLANS.team.tagline).toBe("More products, more sources, your whole team on the list.");
  });
});

describe("plan helpers", () => {
  it("falls back to free for unknown ids", () => {
    expect(getPlan(null).id).toBe("free");
    expect(getPlan(undefined).id).toBe("free");
    expect(getPlan("enterprise" as never).id).toBe("free");
    expect(getPlan("team").id).toBe("team");
  });

  it("reads limits", () => {
    expect(limitFor("pro", "sources_per_product")).toBe(10);
    expect(isUnlimited(limitFor("pro", "prds_per_month"))).toBe(true);
    expect(isUnlimited(0)).toBe(false);
  });

  it("formats limits", () => {
    expect(formatLimit(UNLIMITED)).toBe("Unlimited");
    expect(formatLimit(25000)).toBe("25,000");
    expect(formatLimit(3)).toBe("3");
  });

  it("finds the cheapest plan for a feature or limit", () => {
    expect(minimumPlanFor("slack_alerts")).toBe("pro");
    expect(minimumPlanFor("team_members")).toBe("team");
    expect(minimumPlanFor("competitors")).toBe("pro");
    expect(minimumPlanFor("products", 2)).toBe("pro");
    expect(minimumPlanFor("products", 4)).toBe("team");
    expect(minimumPlanFor("products", 1)).toBe("free");
    expect(minimumPlanFor("products", 50)).toBe("team");
    expect(minimumPlanFor("prds_per_month", 4)).toBe("pro");
    expect(minimumPlanFor("seats", 3)).toBe("team");
  });

  it("formats prices per currency", () => {
    expect(formatPrice(1499, "INR")).toBe("₹1,499");
    expect(formatPrice(14990, "INR")).toBe("₹14,990");
    expect(formatPrice(19, "USD")).toBe("$19");
    expect(formatPrice(590, "USD")).toBe("$590");
    expect(formatPrice(0, "USD")).toBe("$0");
  });

  it("lists plans that include a feature", () => {
    expect(plansWith("slack_alerts")).toBe("Pro and Team");
    expect(plansWith("team_members")).toBe("Team");
  });
});

describe("computeNextRunAt", () => {
  it("aligns paid plans to the next 05:00 UTC cron slot at least 12 hours away", () => {
    const from = new Date("2026-11-04T10:30:00Z");
    expect(computeNextRunAt("pro", from).toISOString()).toBe("2026-11-05T05:00:00.000Z");
    expect(computeNextRunAt("team", from).toISOString()).toBe("2026-11-05T05:00:00.000Z");
  });

  it("makes a run that finished at 05:03 due again at the next day's 05:00 cron", () => {
    const finished = new Date("2026-11-04T05:03:00Z");
    const next = computeNextRunAt("pro", finished);
    expect(next.toISOString()).toBe("2026-11-05T05:00:00.000Z");
    // The next day's cron fires at 05:00 and must find the product due.
    expect(next.getTime()).toBeLessThanOrEqual(new Date("2026-11-05T05:00:00Z").getTime());
  });

  it("skips to the day after when the next slot is under 12 hours away", () => {
    // 05:00 the next day is only 9 hours after a run that finished at 20:00.
    expect(computeNextRunAt("pro", new Date("2026-11-04T20:00:00Z")).toISOString()).toBe("2026-11-06T05:00:00.000Z");
    expect(computeNextRunAt("pro", new Date("2026-11-04T16:00:00Z")).toISOString()).toBe("2026-11-05T05:00:00.000Z");
  });

  it("picks the next Sunday 05:00 UTC on Free", () => {
    // Wednesday 4 Nov 2026 -> Sunday 8 Nov 2026
    expect(computeNextRunAt("free", new Date("2026-11-04T10:30:00Z")).toISOString()).toBe("2026-11-08T05:00:00.000Z");
  });

  it("uses the same Sunday when it is earlier that day", () => {
    expect(computeNextRunAt("free", new Date("2026-11-08T04:59:59Z")).toISOString()).toBe("2026-11-08T05:00:00.000Z");
  });

  it("is strictly after the input", () => {
    expect(computeNextRunAt("free", new Date("2026-11-08T05:00:00Z")).toISOString()).toBe("2026-11-15T05:00:00.000Z");
    expect(computeNextRunAt("free", new Date("2026-11-08T23:00:00Z")).toISOString()).toBe("2026-11-15T05:00:00.000Z");
  });

  it("handles Saturdays and year boundaries", () => {
    expect(computeNextRunAt("free", new Date("2026-10-31T12:00:00Z")).toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(computeNextRunAt("free", new Date("2026-12-27T06:00:00Z")).toISOString()).toBe("2027-01-03T05:00:00.000Z");
  });
});

describe("parsePlanError", () => {
  it("returns null for other bodies", () => {
    expect(parsePlanError(null)).toBeNull();
    expect(parsePlanError("nope")).toBeNull();
    expect(parsePlanError({ error: "x", code: "unauthorized" })).toBeNull();
  });

  it("parses feature gates", () => {
    expect(
      parsePlanError({
        error: "Slack alerts are on Pro and Team.",
        code: "plan_required",
        feature: "slack_alerts",
        requiredPlan: "pro",
      }),
    ).toEqual({ error: "Slack alerts are on Pro and Team.", code: "plan_required", feature: "slack_alerts", requiredPlan: "pro" });
  });

  it("parses limits and ignores unknown fields", () => {
    expect(
      parsePlanError({ error: "Limit", code: "limit_reached", limit: "products", used: 1, max: 1, requiredPlan: "pro", feature: "bogus" }),
    ).toEqual({ error: "Limit", code: "limit_reached", limit: "products", used: 1, max: 1, requiredPlan: "pro" });
  });

  it("defaults the required plan to Pro", () => {
    expect(parsePlanError({ code: "limit_reached" })?.requiredPlan).toBe("pro");
  });
});
