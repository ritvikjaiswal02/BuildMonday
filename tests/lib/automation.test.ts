import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dashboardAfterOnboarding, onboardingPath, onboardingThen } from "@/lib/auth/cookies";
import { digestSlot, digestTimingCopy, localClock, parseDigestMode } from "@/lib/digest/schedule";
import { matchToIssues, MATCH_THRESHOLD } from "@/lib/feedback/match";
import { widgetDailyCap } from "@/lib/feedback/widget";
import { buildSetupChecklist } from "@/components/app/setup-checklist";
import { rankAppStoreMatches } from "@/app/api/sources/suggest/rank";
import { createOAuthState, safeOAuthReturn, verifyOAuthState, withQuery } from "@/lib/oauth/state";

describe("plan intent through onboarding", () => {
  it("carries only billing destinations into onboarding", () => {
    expect(onboardingPath("/billing?plan=pro&interval=year")).toBe(
      `/onboarding?then=${encodeURIComponent("/billing?plan=pro&interval=year")}`,
    );
    expect(onboardingPath("/dashboard")).toBe("/onboarding");
    expect(onboardingPath("//evil.example/billing")).toBe("/onboarding");
    expect(onboardingThen("https://evil.example/billing")).toBeNull();
  });

  it("sends a would-be customer to the dashboard with the plan they picked", () => {
    expect(dashboardAfterOnboarding(null)).toBe("/dashboard?first=1");
    expect(dashboardAfterOnboarding("/billing?plan=team&interval=month")).toBe(
      "/dashboard?first=1&upgrade=team&interval=month",
    );
    expect(dashboardAfterOnboarding("/billing")).toBe("/dashboard?first=1&upgrade=pro&interval=year");
  });
});

describe("Monday digest timing", () => {
  it("defaults to one weekly send keyed by the UTC week", () => {
    expect(parseDigestMode(undefined)).toBe("weekly");
    expect(parseDigestMode("LOCAL")).toBe("local");
    const now = new Date("2026-11-09T03:30:00Z"); // Monday
    expect(digestSlot(now, "America/Los_Angeles", "weekly")).toEqual({ due: true, weekKey: "2026-W46" });
  });

  it("sends at 9:00 local on Monday in local mode, and catches up later that Monday", () => {
    // 03:30 UTC Monday is 09:00 in Kolkata but Sunday evening in Los Angeles.
    const tick = new Date("2026-11-09T03:30:00Z");
    expect(digestSlot(tick, "Asia/Kolkata", "local")).toEqual({ due: true, weekKey: "2026-W46" });
    expect(digestSlot(tick, "America/Los_Angeles", "local").due).toBe(false);
    // 17:30 UTC Monday is 09:30 in Los Angeles.
    expect(digestSlot(new Date("2026-11-09T17:30:00Z"), "America/Los_Angeles", "local")).toEqual({
      due: true,
      weekKey: "2026-W46",
    });
    // Auckland reaches Monday 9:00 on Sunday UTC; the week key follows the local date.
    expect(digestSlot(new Date("2026-11-08T20:30:00Z"), "Pacific/Auckland", "local")).toEqual({
      due: true,
      weekKey: "2026-W46",
    });
  });

  it("reads the local clock and falls back to UTC for unknown zones", () => {
    const c = localClock(new Date("2026-11-09T03:30:00Z"), "Not/AZone");
    expect(c.weekday).toBe(1);
    expect(c.hour).toBe(3);
  });

  it("describes the timing truthfully in both modes", () => {
    expect(digestTimingCopy("weekly").digest).toContain("03:30 UTC (9:00 in India)");
    expect(digestTimingCopy("local").digest).toContain("9:00 in your time zone");
  });
});

describe("incremental matching", () => {
  const issues = [
    { id: "i-sync", scope: "own" as const, competitorName: null, embedding: [1, 0, 0] },
    { id: "i-export", scope: "own" as const, competitorName: null, embedding: [0, 1, 0] },
    { id: "i-rival", scope: "competitor" as const, competitorName: "Rival", embedding: [0, 0, 1] },
  ];

  it("links each item to its closest issue above the threshold, within the same scope", () => {
    const matches = matchToIssues(
      [
        { id: "f1", role: "own", competitorName: null, embedding: [0.95, 0.1, 0] },
        { id: "f2", role: "own", competitorName: null, embedding: [0.5, 0.5, 0.7] },
        { id: "f3", role: "own", competitorName: null, embedding: [0, 0, 1] },
        { id: "f4", role: "competitor", competitorName: "rival", embedding: [0, 0.05, 1] },
        { id: "f5", role: "competitor", competitorName: "Other", embedding: [0, 0, 1] },
      ],
      issues,
    );
    expect(matches.get("f1")).toBe("i-sync");
    expect(matches.has("f2")).toBe(false);
    expect(matches.has("f3")).toBe(false); // own feedback never joins a competitor issue
    expect(matches.get("f4")).toBe("i-rival");
    expect(matches.has("f5")).toBe(false);
    expect(MATCH_THRESHOLD).toBe(0.72);
  });
});

describe("widget allowance", () => {
  it("leaves most of the monthly quota for monitored sources", () => {
    expect(widgetDailyCap("free")).toBe(10);
    expect(widgetDailyCap("free") * 30).toBeLessThan(500);
    expect(widgetDailyCap("pro")).toBe(67);
    expect(widgetDailyCap("team")).toBe(334);
  });
});

describe("setup checklist", () => {
  const base = {
    sources: 0,
    slack: false,
    trackerConnected: false,
    autofileOn: false,
    widgetFeedback: 0,
    extensionTokens: 0,
    members: 1,
  };

  it("counts what is done and points at where to finish the rest", () => {
    const list = buildSetupChecklist({ ...base, sources: 2, slack: true, trackerConnected: true })!;
    expect(list.total).toBe(6);
    expect(list.done).toBe(2);
    expect(list.items.find((i) => i.id === "autofile")).toMatchObject({ done: false, href: "/settings/alerts" });
  });

  it("disappears when everything is done", () => {
    expect(
      buildSetupChecklist({
        sources: 1,
        slack: true,
        trackerConnected: true,
        autofileOn: true,
        widgetFeedback: 3,
        extensionTokens: 1,
        members: 2,
      }),
    ).toBeNull();
  });
});

describe("App Store suggestions", () => {
  it("puts the developer whose site matches the website first and drops junk", () => {
    const ranked = rankAppStoreMatches(
      [
        { trackId: 1, trackName: "Notes Pro", sellerName: "Other Co", sellerUrl: "https://other.com" },
        { trackName: "No id" },
        { trackId: 2, trackName: "Acme Notes", sellerName: "Acme Inc", sellerUrl: "https://www.acme.com/apps", artworkUrl60: "https://is1.example/a.png" },
        { trackId: 1, trackName: "Notes Pro again" },
      ],
      "acme.com",
    );
    expect(ranked.map((r) => r.appId)).toEqual(["2", "1"]);
    expect(ranked[0]).toMatchObject({ name: "Acme Notes", developer: "Acme Inc", matchesWebsite: true });
  });
});

describe("OAuth state", () => {
  const saved = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-for-oauth-state";
  });
  afterEach(() => {
    process.env.AUTH_SECRET = saved;
  });

  it("round-trips for the same provider, browser and time window", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    const { state, nonce } = createOAuthState({ provider: "slack", workspaceId: "ws1", userId: "u1", returnTo: "/onboarding?then=%2Fbilling", now });
    const payload = verifyOAuthState(state, "slack", nonce, now);
    expect(payload).toMatchObject({ p: "slack", w: "ws1", u: "u1", r: "/onboarding?then=%2Fbilling" });
  });

  it("rejects another provider, another browser, tampering and expiry", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    const { state, nonce } = createOAuthState({ provider: "linear", workspaceId: "ws1", userId: "u1", returnTo: "/settings/integrations", now });
    expect(verifyOAuthState(state, "github", nonce, now)).toBeNull();
    expect(verifyOAuthState(state, "linear", "other-nonce", now)).toBeNull();
    expect(verifyOAuthState(`${state}x`, "linear", nonce, now)).toBeNull();
    expect(verifyOAuthState(state, "linear", nonce, new Date(now.getTime() + 11 * 60 * 1000))).toBeNull();
  });

  it("only returns to pages inside the app", () => {
    expect(safeOAuthReturn("https://evil.example")).toBe("/settings/integrations");
    expect(safeOAuthReturn("/pricing")).toBe("/settings/integrations");
    expect(safeOAuthReturn("/onboarding?new=1")).toBe("/onboarding?new=1");
    expect(withQuery("/onboarding?new=1", { connected: "slack" })).toBe("/onboarding?new=1&connected=slack");
  });
});
