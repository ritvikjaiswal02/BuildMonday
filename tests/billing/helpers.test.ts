import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {}, getDb: () => ({}) }));
vi.mock("@/lib/auth/session", () => ({ hasRole: () => true }));

import { checkoutDescription, findCheckoutConflict, suggestCurrency } from "@/app/api/billing/_lib/billing";
import { entityToSubscription, eventIdFor, isSubscriptionEvent, statusForEvent } from "@/app/api/webhooks/razorpay/_lib/events";
import {
  compareRows,
  featureGateMessage,
  formatBillingDate,
  formatPeriod,
  guessCurrencyFromTimeZone,
  limitCell,
  periodResetDate,
  priceLabel,
  resolveRequiredPlan,
  subscriptionStatusLine,
  usageText,
  usageTone,
} from "@/components/billing/copy";
import { planAction } from "@/components/billing/PlanChooser";
import { parsePreselect } from "@/components/billing/preselect";
import type { BillingState } from "@/components/billing/types";

const ws = (over: Partial<Parameters<typeof findCheckoutConflict>[0]> = {}) => ({
  plan: "pro" as const,
  planStatus: "active" as const,
  planInterval: "month" as const,
  cancelAtPeriodEnd: false,
  razorpaySubscriptionId: "sub_1",
  ...over,
});

describe("checkout rules", () => {
  it("describes the subscription for Razorpay", () => {
    expect(checkoutDescription("pro", "month")).toBe("Pro, billed monthly");
    expect(checkoutDescription("team", "year")).toBe("Team, billed yearly");
  });

  it("refuses a second subscription for the same plan and interval", () => {
    expect(findCheckoutConflict(ws(), "pro", "month")).toBe("You are already on Pro, billed monthly.");
    expect(findCheckoutConflict(ws({ planStatus: "past_due" }), "pro", "month")).not.toBeNull();
  });

  it("allows switching plan or interval, restarting a cancelled plan, and upgrading from free", () => {
    expect(findCheckoutConflict(ws(), "team", "month")).toBeNull();
    expect(findCheckoutConflict(ws(), "pro", "year")).toBeNull();
    expect(findCheckoutConflict(ws({ cancelAtPeriodEnd: true }), "pro", "month")).toBeNull();
    expect(findCheckoutConflict(ws({ planStatus: "cancelled" }), "pro", "month")).toBeNull();
    expect(findCheckoutConflict(ws({ plan: "free", planStatus: "none", planInterval: null }), "pro", "month")).toBeNull();
  });

  it("suggests the currency the workspace already pays in, else the visitor's country", () => {
    const h = new Headers({ "x-vercel-ip-country": "IN" });
    expect(suggestCurrency({ planCurrency: null }, h)).toBe("INR");
    expect(suggestCurrency({ planCurrency: "USD" }, h)).toBe("USD");
    expect(suggestCurrency({ planCurrency: null }, new Headers())).toBe("USD");
  });
});

describe("webhook helpers", () => {
  it("recognises subscription events", () => {
    expect(isSubscriptionEvent("subscription.charged")).toBe(true);
    expect(isSubscriptionEvent("payment.failed")).toBe(false);
    expect(isSubscriptionEvent("order.paid")).toBe(false);
  });

  it("maps events to statuses for when the live subscription cannot be fetched", () => {
    expect(statusForEvent("subscription.activated", "active")).toBe("active");
    expect(statusForEvent("subscription.charged", "active")).toBe("active");
    expect(statusForEvent("subscription.authenticated", "authenticated")).toBe("authenticated");
    expect(statusForEvent("subscription.pending", "pending")).toBe("past_due");
    expect(statusForEvent("subscription.halted", "halted")).toBe("halted");
    expect(statusForEvent("subscription.cancelled", "cancelled")).toBe("cancelled");
    expect(statusForEvent("subscription.completed", "completed")).toBe("completed");
    expect(statusForEvent("subscription.updated", "pending")).toBe("past_due");
  });

  it("uses the event id header, else a hash of the body", () => {
    expect(eventIdFor("evt_123", "{}")).toBe("evt_123");
    const a = eventIdFor(null, '{"a":1}');
    expect(a).toMatch(/^body_[0-9a-f]{64}$/);
    expect(eventIdFor("  ", '{"a":1}')).toBe(a);
    expect(eventIdFor(null, '{"a":2}')).not.toBe(a);
  });

  it("normalises a payload entity", () => {
    expect(entityToSubscription({})).toBeNull();
    expect(entityToSubscription({ id: "sub_9", plan_id: "plan_x", status: "active", current_end: 1_800_000_000 })).toEqual({
      id: "sub_9",
      plan_id: "plan_x",
      status: "active",
      current_start: null,
      current_end: 1_800_000_000,
      charge_at: null,
      total_count: 0,
      paid_count: 0,
      short_url: undefined,
      notes: {},
    });
  });
});

describe("billing copy", () => {
  it("states feature gates plainly", () => {
    expect(featureGateMessage("slack_alerts")).toBe("Slack alerts are on Pro and Team.");
    expect(featureGateMessage("export")).toBe("Export issues as CSV or JSON is on Pro and Team.");
    expect(featureGateMessage("team_members")).toBe("Admin roles for team members are on Team.");
  });

  it("picks the plan that unlocks a feature or raises a limit", () => {
    expect(resolveRequiredPlan({ feature: "auto_file" })).toBe("pro");
    expect(resolveRequiredPlan({ feature: "team_members" })).toBe("team");
    expect(resolveRequiredPlan({ limit: "products", current: "free" })).toBe("pro");
    expect(resolveRequiredPlan({ limit: "products", current: "pro" })).toBe("team");
    expect(resolveRequiredPlan({ requiredPlan: "team", feature: "auto_file" })).toBe("team");
    expect(resolveRequiredPlan({})).toBe("pro");
  });

  it("colours usage by how close it is to the limit", () => {
    expect(usageTone(10, 500)).toBe("brand");
    expect(usageTone(400, 500)).toBe("warning");
    expect(usageTone(499, 500)).toBe("warning");
    expect(usageTone(500, 500)).toBe("danger");
    expect(usageTone(9999, -1)).toBe("brand");
    expect(usageTone(0, 0)).toBe("brand");
  });

  it("writes usage figures", () => {
    expect(usageText(412, 500, "feedback items")).toBe("412 of 500 feedback items");
    expect(usageText(1204, -1, "clips")).toBe("1,204 clips");
    expect(usageText(3, 4)).toBe("3 of 4");
  });

  it("formats dates and periods in UTC", () => {
    expect(formatBillingDate("2026-12-12T10:00:00.000Z")).toBe("12 Dec 2026");
    expect(formatBillingDate(null)).toBe("");
    expect(formatPeriod("2026-11")).toBe("November 2026");
    expect(periodResetDate("2026-11")).toBe("1 Dec 2026");
    expect(periodResetDate("2026-12")).toBe("1 Jan 2027");
  });

  it("prices plans", () => {
    expect(priceLabel("pro", "INR", "month")).toBe("₹1,499 / month");
    expect(priceLabel("team", "USD", "year")).toBe("$590 / year");
  });

  it("guesses INR only for India's time zone", () => {
    expect(guessCurrencyFromTimeZone("Asia/Kolkata")).toBe("INR");
    expect(guessCurrencyFromTimeZone("Asia/Calcutta")).toBe("INR");
    expect(guessCurrencyFromTimeZone("Europe/Berlin")).toBe("USD");
    expect(guessCurrencyFromTimeZone(undefined)).toBe("USD");
  });

  it("puts the locked item first in the comparison", () => {
    const rows = compareRows({ limit: "competitors" });
    expect(rows[0]).toMatchObject({ kind: "limit", key: "competitors", highlight: true });
    expect(rows).toHaveLength(6);
    const featureRows = compareRows({ feature: "auto_file" });
    expect(featureRows[0]).toMatchObject({ kind: "feature", key: "auto_file", highlight: true });
    expect(featureRows.filter((r) => r.key === "auto_file")).toHaveLength(1);
    expect(limitCell("free", "competitors")).toBe("Not included");
    expect(limitCell("pro", "prds_per_month")).toBe("Unlimited");
  });

  it("says what happens next with the subscription", () => {
    const base = { plan: "pro" as const, currentPeriodEnd: "2026-12-12T00:00:00.000Z", cancelAtPeriodEnd: false };
    expect(subscriptionStatusLine({ ...base, status: "active" })).toEqual({ text: "Renews on 12 Dec 2026.", tone: "neutral" });
    expect(subscriptionStatusLine({ ...base, status: "active", cancelAtPeriodEnd: true }).tone).toBe("warning");
    expect(subscriptionStatusLine({ ...base, status: "past_due" }).tone).toBe("danger");
    expect(subscriptionStatusLine({ ...base, plan: "free", status: "none" }).tone).toBe("neutral");
  });
});

describe("plan chooser actions", () => {
  const state = (over: Partial<BillingState> = {}): BillingState => ({
    plan: "free",
    storedPlan: "free",
    status: "none",
    trialEndsAt: null,
    interval: null,
    currency: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    isPaid: false,
    ...over,
  });
  const pro = state({ plan: "pro", storedPlan: "pro", status: "active", interval: "month", currency: "INR", isPaid: true });

  it("upgrades from free without a confirmation", () => {
    expect(planAction(state(), "pro", "month")).toEqual({ kind: "checkout", label: "Upgrade to Pro", confirm: null });
  });

  it("marks the current plan and interval", () => {
    expect(planAction(pro, "pro", "month")).toEqual({ kind: "current", label: "Current plan" });
  });

  it("confirms before replacing a live subscription", () => {
    expect(planAction(pro, "team", "month")).toEqual({ kind: "checkout", label: "Switch to Team", confirm: "switch" });
    expect(planAction(pro, "pro", "year")).toEqual({ kind: "checkout", label: "Switch to yearly billing", confirm: "switch" });
  });

  it("offers a restart while a cancelled plan is still in its paid period", () => {
    const cancelled = { ...pro, cancelAtPeriodEnd: true };
    expect(planAction(cancelled, "pro", "month")).toEqual({ kind: "checkout", label: "Restart Pro", confirm: "restart" });
    expect(planAction(cancelled, "team", "month")).toEqual({ kind: "checkout", label: "Switch to Team", confirm: "restart" });
  });
});

describe("preselect from the URL", () => {
  it("reads valid values and ignores the rest", () => {
    expect(parsePreselect({ plan: "team", interval: "year", currency: "inr" })).toEqual({
      plan: "team",
      interval: "year",
      currency: "INR",
    });
    expect(parsePreselect({ plan: "free", interval: "week", currency: "EUR" })).toEqual({
      plan: null,
      interval: null,
      currency: null,
    });
    expect(parsePreselect({ plan: ["pro", "team"] }).plan).toBe("pro");
    expect(parsePreselect(undefined)).toEqual({ plan: null, interval: null, currency: null });
  });
});
