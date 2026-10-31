import { describe, expect, it } from "vitest";
import type { Source as SourceRow } from "@/lib/db/schema";
import { kindsToSourceMix, rowToAnalysisIssue, sourceMixToKinds } from "@/lib/monitor/mappers";
import { majority, planIssueUpdates, selectSourcesForPlan } from "@/lib/monitor/plan";
import { normalizePrd } from "@/lib/monitor/prd";

describe("planIssueUpdates", () => {
  const stored = [
    { id: "checkout", frequency: 4, lastSeenRunId: "run-prev" },
    { id: "sync", frequency: 10, lastSeenRunId: "run-prev" },
    { id: "gone", frequency: 3, lastSeenRunId: "run-prev" },
    { id: "ancient", frequency: 3, lastSeenRunId: "run-older" },
  ];
  const storedEmbeds = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];

  it("matches, creates and resolves", () => {
    const plan = planIssueUpdates({
      clusterFrequencies: [8, 9, 2],
      clusterEmbeds: [
        [1, 0, 0, 0], // checkout 4 -> 8: worsened
        [0, 1, 0, 0], // sync 10 -> 9: persistent
        [0.5, 0.5, 0.5, -0.5], // nothing close: new
      ],
      stored,
      storedEmbeds,
      previousRunId: "run-prev",
    });
    expect(plan.matched).toEqual([
      { cluster: 0, issueId: "checkout", trend: "worsened", similarity: 1, previousFrequency: 4 },
      { cluster: 1, issueId: "sync", trend: "persistent", similarity: 1, previousFrequency: 10 },
    ]);
    expect(plan.created).toEqual([2]);
    // "ancient" was not in the previous run, so it is not resolved now.
    expect(plan.resolved).toEqual(["gone"]);
  });

  it("resolves nothing on the first run", () => {
    const plan = planIssueUpdates({
      clusterFrequencies: [1],
      clusterEmbeds: [[1, 0, 0, 0]],
      stored: [],
      storedEmbeds: [],
      previousRunId: null,
    });
    expect(plan).toEqual({ matched: [], created: [0], resolved: [] });
  });
});

const source = (id: string, createdAt: string, extra: Partial<SourceRow> = {}): SourceRow =>
  ({
    id,
    workspaceId: "w",
    productId: "p",
    kind: "reddit",
    config: { mode: "search", query: "x" },
    label: id,
    role: "own",
    competitorName: null,
    enabled: true,
    lastFetchedAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastItemCount: null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    ...extra,
  }) as SourceRow;

describe("selectSourcesForPlan", () => {
  const list = [
    source("s3", "2026-01-03"),
    source("s1", "2026-01-01"),
    source("off", "2026-01-00T00:00:00Z", { enabled: false }),
    source("s2", "2026-01-02"),
    source("c1", "2026-01-04", { role: "competitor", competitorName: "Notion" }),
    source("c2", "2026-01-05", { role: "competitor", competitorName: "notion " }),
    source("c3", "2026-01-06", { role: "competitor", competitorName: "Bear" }),
  ];

  it("keeps the oldest sources within the limit and pauses the rest", () => {
    const r = selectSourcesForPlan(list, { sourcesPerProduct: 3, competitors: 0, competitorTracking: false });
    expect(r.active.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(r.paused.map((s) => s.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("limits distinct competitor names", () => {
    const r = selectSourcesForPlan(list, { sourcesPerProduct: 10, competitors: 1, competitorTracking: true });
    expect(r.active.map((s) => s.id)).toEqual(["s1", "s2", "s3", "c1", "c2"]);
    expect(r.paused.map((s) => s.id)).toEqual(["c3"]);
  });

  it("treats -1 as unlimited", () => {
    const r = selectSourcesForPlan(list, { sourcesPerProduct: -1, competitors: -1, competitorTracking: true });
    expect(r.active).toHaveLength(6);
    expect(r.paused).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("majority picks the most common non-empty value", () => {
    expect(majority(["Notion", null, "Bear", "Notion", " "])).toBe("Notion");
    expect(majority([null, ""])).toBeNull();
  });

  it("converts source mixes both ways", () => {
    expect(sourceMixToKinds({ hn: 2, appstore: 1, manual: 0 })).toEqual({ hackernews: 2, appstore: 1 });
    expect(kindsToSourceMix({ hackernews: 2, import: 1, manual: 2 })).toEqual({ hn: 2, manual: 3 });
  });

  it("maps a stored issue to the analyzer shape", () => {
    const issue = rowToAnalysisIssue({
      title: "T",
      frequency: 3,
      severity: "High",
      churnRisk: "Low",
      effort: "S",
      affectedSegment: "All",
      evidence: ["e"],
      recommendedAction: "fix_now",
      priorityScore: 90,
      rankingReason: null,
      sourceMix: { hackernews: 3 },
      category: "sync",
    } as never);
    expect(issue).toMatchObject({ churn_risk: "Low", recommended_action: "fix_now", source_mix: { hn: 3 }, ranking_reason: undefined });
  });

  it("normalises PRD output", () => {
    expect(normalizePrd({ problem_statement: "P", acceptance_criteria: ["a", 1, " b "], estimated_complexity: "large" })).toEqual({
      problem_statement: "P",
      affected_users: [],
      acceptance_criteria: ["a", "b"],
      edge_cases: [],
      success_metrics: [],
      implementation_notes: "Not provided.",
      estimated_complexity: "L",
    });
    expect(normalizePrd(null).estimated_complexity).toBe("M");
  });
});
