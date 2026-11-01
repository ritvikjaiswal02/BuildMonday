import { describe, expect, it } from "vitest";
import {
  complaintBatchHint,
  countComplaints,
  orderAnalyzerIssues,
  splitComplaints,
  sprintEstimate,
  watchSourceHref,
} from "@/components/app/analyzer";
import type { Action, Issue, IssueStatus, Source } from "@/lib/types";

function issue(partial: Partial<Issue> & { title: string }): Issue {
  return {
    frequency: 1,
    severity: "Low",
    churn_risk: "Low",
    effort: "S",
    affected_segment: "",
    evidence: [],
    recommended_action: "monitor",
    priority_score: 10,
    ...partial,
  };
}

describe("splitComplaints", () => {
  it("splits on newlines and drops blank lines", () => {
    expect(splitComplaints("  a \n\n b\r\n\nc  ")).toEqual(["a", "b", "c"]);
    expect(countComplaints("\n \n")).toBe(0);
  });
});

describe("complaintBatchHint", () => {
  it("guides the batch size", () => {
    expect(complaintBatchHint(0)).toBeNull();
    expect(complaintBatchHint(3)?.tone).toBe("warning");
    expect(complaintBatchHint(20)).toEqual({ tone: "neutral", message: "Ready to analyze." });
    expect(complaintBatchHint(150)?.message).toMatch(/Large batch/);
    expect(complaintBatchHint(301)?.message).toMatch(/first 300/);
  });
});

describe("watchSourceHref", () => {
  it("carries the source URL through login into onboarding", () => {
    const url = "https://apps.apple.com/us/app/x/id123?l=en&x=1";
    const href = watchSourceHref(url);
    expect(href.startsWith("/login?next=")).toBe(true);
    const next = new URLSearchParams(href.slice("/login?".length)).get("next");
    expect(next).toBe(`/onboarding?source=${encodeURIComponent(url)}`);
    const source = new URLSearchParams(next!.slice("/onboarding?".length)).get("source");
    expect(source).toBe(url);
  });

  it("falls back to plain onboarding", () => {
    expect(watchSourceHref(null)).toBe("/login?next=%2Fonboarding");
    expect(watchSourceHref("   ")).toBe("/login?next=%2Fonboarding");
  });
});

describe("orderAnalyzerIssues", () => {
  const issues = [
    issue({ title: "A", frequency: 3, severity: "Low", recommended_action: "fix_now", source_mix: { reddit: 3 } }),
    issue({ title: "B", frequency: 9, severity: "Medium", recommended_action: "investigate", source_mix: { appstore: 9 } }),
    issue({ title: "C", frequency: 5, severity: "High", recommended_action: "monitor" }),
  ];
  const none = {
    actions: new Set<Action>(),
    statuses: new Set<IssueStatus>(),
    sources: new Set<Source>(),
  };
  const statusOf = (statuses: Record<string, IssueStatus>) => (i: Issue) => statuses[i.title] ?? "backlog";
  const titles = (out: Array<{ issue: Issue }>) => out.map((o) => o.issue.title);

  it("keeps analysis order for priority sort", () => {
    const out = orderAnalyzerIssues(issues, statusOf({}), { ...none, sort: "priority" });
    expect(titles(out)).toEqual(["A", "B", "C"]);
    expect(out.map((o) => o.originalRank)).toEqual([0, 1, 2]);
  });

  it("sorts by frequency and severity", () => {
    expect(titles(orderAnalyzerIssues(issues, statusOf({}), { ...none, sort: "frequency" }))).toEqual(["B", "C", "A"]);
    expect(titles(orderAnalyzerIssues(issues, statusOf({}), { ...none, sort: "severity" }))).toEqual(["C", "B", "A"]);
  });

  it("sinks shipped issues and filters by action and source", () => {
    expect(titles(orderAnalyzerIssues(issues, statusOf({ A: "shipped" }), { ...none, sort: "priority" }))).toEqual([
      "B",
      "C",
      "A",
    ]);
    expect(
      titles(orderAnalyzerIssues(issues, statusOf({}), { ...none, actions: new Set<Action>(["fix_now"]), sort: "priority" })),
    ).toEqual(["A"]);
    expect(
      titles(orderAnalyzerIssues(issues, statusOf({}), { ...none, sources: new Set<Source>(["appstore"]), sort: "priority" })),
    ).toEqual(["B"]);
  });
});

describe("sprintEstimate", () => {
  it("is zero with nothing urgent and at least one otherwise", () => {
    expect(sprintEstimate([issue({ title: "x" })])).toBe(0);
    expect(sprintEstimate([issue({ title: "x", recommended_action: "investigate" })])).toBe(1);
    expect(
      sprintEstimate(Array.from({ length: 4 }, (_, i) => issue({ title: `f${i}`, recommended_action: "fix_now" }))),
    ).toBe(2);
  });
});
