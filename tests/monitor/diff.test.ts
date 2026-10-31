import { beforeEach, describe, expect, it, vi } from "vitest";

const embedBatch = vi.fn();
vi.mock("@/lib/embeddings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/embeddings")>("@/lib/embeddings");
  return { ...actual, embedBatch: (...args: unknown[]) => embedBatch(...args) };
});

import { classifyTrend, computeDiff, greedyMatch, issueSignature } from "@/lib/monitor/diff";
import type { Issue } from "@/lib/types";

const issue = (title: string, frequency: number): Issue => ({
  title,
  frequency,
  severity: "Medium",
  churn_risk: "Low",
  effort: "M",
  affected_segment: "All",
  evidence: [`${title} evidence`],
  recommended_action: "investigate",
  priority_score: 50,
});

beforeEach(() => embedBatch.mockReset());

describe("greedyMatch", () => {
  it("pairs the most similar first, one to one, above the threshold", () => {
    const current = [
      [1, 0, 0],
      [0.9, 0.1, 0],
      [0, 0, 1],
    ];
    const prior = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    const matches = greedyMatch(current, prior, 0.72);
    expect(matches).toEqual([{ current: 0, prior: 0, similarity: 1 }]);
  });

  it("lets a second-best pair match once the best is taken", () => {
    const current = [
      [1, 0.2],
      [1, 0.25],
    ];
    const prior = [
      [1, 0.21],
      [1, 0.4],
    ];
    const matches = greedyMatch(current, prior, 0.5);
    expect(matches).toHaveLength(2);
    expect(new Set(matches.map((m) => m.prior))).toEqual(new Set([0, 1]));
  });

  it("ignores vectors of different lengths", () => {
    expect(greedyMatch([[1, 0]], [[1, 0, 0]])).toEqual([]);
  });
});

describe("classifyTrend", () => {
  it("needs at least max(2, 25%) change", () => {
    expect(classifyTrend(4, 5)).toBe("persistent");
    expect(classifyTrend(4, 6)).toBe("worsened");
    expect(classifyTrend(4, 2)).toBe("improved");
    expect(classifyTrend(20, 24)).toBe("persistent");
    expect(classifyTrend(20, 25)).toBe("worsened");
    expect(classifyTrend(20, 15)).toBe("improved");
    expect(classifyTrend(0, 2)).toBe("worsened");
  });
});

describe("issueSignature", () => {
  it("uses the title and first three quotes", () => {
    expect(issueSignature({ title: "T", evidence: ["a", "b", "c", "d"] })).toBe("T. a b c");
  });
});

describe("computeDiff (anonymous analyzer)", () => {
  it("returns all new without embedding when there is no prior run", async () => {
    const diff = await computeDiff([issue("A", 3)], [], "2026-10-01");
    expect(diff).toEqual({ perIssue: [{ category: "new" }], resolved: [], priorRunDate: "2026-10-01" });
    expect(embedBatch).not.toHaveBeenCalled();
  });

  it("classifies matched issues by any frequency change and lists resolved ones", async () => {
    embedBatch.mockResolvedValueOnce([
      [1, 0, 0], // current: checkout
      [0, 1, 0], // current: brand new
      [0, 0, 1], // current: sync
      [1, 0, 0], // prior: checkout
      [0, 0, 1], // prior: sync
      [0.5, 0.5, 0.7071], // prior: gone
    ]);
    const diff = await computeDiff(
      [issue("Checkout", 5), issue("Fresh", 1), issue("Sync", 2)],
      [issue("Checkout", 3), issue("Sync", 2), issue("Gone", 4)],
      "2026-10-01",
    );
    expect(diff.perIssue.map((d) => d.category)).toEqual(["worsened", "new", "persistent"]);
    expect(diff.perIssue[0]).toMatchObject({ priorIdx: 0, priorTitle: "Checkout", priorFrequency: 3 });
    expect(diff.resolved).toEqual([{ priorIdx: 2, title: "Gone", frequency: 4 }]);
  });
});
