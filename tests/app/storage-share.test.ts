// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendHistory,
  clearState,
  loadHistory,
  loadLastSource,
  loadState,
  loadStatuses,
  saveLastSource,
  saveState,
  saveStatuses,
  slugify,
} from "@/lib/storage";
import { buildShareUrl, decodeIssuesFromShare, encodeIssuesForShare } from "@/lib/share";
import type { Issue } from "@/lib/types";

const issue: Issue = {
  title: "Login loops",
  frequency: 4,
  severity: "Medium",
  churn_risk: "Low",
  effort: "S",
  affected_segment: "New users",
  evidence: ["Keeps asking me to log in"],
  recommended_action: "investigate",
  priority_score: 55,
  member_indices: [1, 2, 3, 4],
};

describe("analyzer storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips state, statuses and the last source", () => {
    saveState({ issues: [issue], prdData: {}, diff: null, text: "a\nb" });
    expect(loadState()).toEqual({ issues: [issue], prdData: {}, diff: null, text: "a\nb" });
    saveStatuses({ "login-loops": "shipped" });
    expect(loadStatuses()).toEqual({ "login-loops": "shipped" });
    saveLastSource("https://example.com/r/acme");
    expect(loadLastSource()).toBe("https://example.com/r/acme");
  });

  it("clears state, statuses and the source but keeps history", () => {
    saveState({ issues: [issue], prdData: {} });
    saveStatuses({ x: "in_progress" });
    saveLastSource("https://example.com");
    appendHistory({ timestamp: "2026-10-01T00:00:00.000Z", complaintCount: 3, issues: [issue] });
    clearState();
    expect(loadState()).toBeNull();
    expect(loadStatuses()).toEqual({});
    expect(loadLastSource()).toBeNull();
    expect(loadHistory()).toHaveLength(1);
  });

  it("keeps the newest 10 history entries", () => {
    for (let i = 0; i < 12; i++) {
      appendHistory({ timestamp: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`, complaintCount: i, issues: [] });
    }
    const history = loadHistory();
    expect(history).toHaveLength(10);
    expect(history[0].complaintCount).toBe(11);
  });

  it("ignores corrupt JSON", () => {
    window.localStorage.setItem("buildmonday:state", "{nope");
    window.localStorage.setItem("buildmonday:history", '{"not":"an array"}');
    expect(loadState()).toBeNull();
    expect(loadHistory()).toEqual([]);
  });

  it("slugifies titles", () => {
    expect(slugify("  Checkout: fails (iOS) ")).toBe("checkout-fails-ios");
  });
});

describe("share links", () => {
  it("round-trips issues without member indices", () => {
    const decoded = decodeIssuesFromShare(encodeIssuesForShare([issue]));
    expect(decoded).toHaveLength(1);
    expect(decoded?.[0].title).toBe("Login loops");
    expect(decoded?.[0].member_indices).toBeUndefined();
  });

  it("rejects garbage and payloads without valid issues", () => {
    expect(decodeIssuesFromShare("not-a-payload")).toBeNull();
    expect(decodeIssuesFromShare(encodeIssuesForShare([]))).toBeNull();
  });

  it("builds a URL on the current page with only the results parameter", () => {
    window.history.replaceState({}, "", "/app?foo=1#x");
    const url = new URL(buildShareUrl([issue]));
    expect(url.pathname).toBe("/app");
    expect(Array.from(url.searchParams.keys())).toEqual(["results"]);
    expect(url.hash).toBe("");
  });
});
