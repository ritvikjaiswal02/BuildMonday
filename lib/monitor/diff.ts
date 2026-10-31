import "server-only";

import { cosineSimilarity, embedBatch } from "@/lib/embeddings";
import type { IssueTrend } from "@/lib/db/schema";
import type { AnalysisDiff, Issue, IssueDiff, ResolvedIssue } from "@/lib/types";

/** Cosine similarity at or above this means two issues are the same problem. */
export const SIMILARITY_THRESHOLD = 0.72;

/** Title plus the first three evidence quotes; what gets embedded for matching. */
export function issueSignature(i: { title?: string | null; evidence?: string[] | null }): string {
  const head = i.title ?? "";
  const ev = (i.evidence ?? []).slice(0, 3).join(" ");
  return `${head}. ${ev}`.slice(0, 1500);
}

export interface MatchPair {
  current: number;
  prior: number;
  similarity: number;
}

/**
 * One-to-one greedy matching: all pairs at or above the threshold, highest
 * similarity first, each side used once. Deterministic for ties (lower
 * indices win).
 */
export function greedyMatch(
  currentEmbeds: number[][],
  priorEmbeds: number[][],
  threshold = SIMILARITY_THRESHOLD,
): MatchPair[] {
  const pairs: MatchPair[] = [];
  for (let c = 0; c < currentEmbeds.length; c++) {
    for (let p = 0; p < priorEmbeds.length; p++) {
      const similarity = cosineSimilarity(currentEmbeds[c], priorEmbeds[p]);
      if (similarity >= threshold) pairs.push({ current: c, prior: p, similarity });
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity || a.current - b.current || a.prior - b.prior);
  const usedC = new Set<number>();
  const usedP = new Set<number>();
  const out: MatchPair[] = [];
  for (const pair of pairs) {
    if (usedC.has(pair.current) || usedP.has(pair.prior)) continue;
    usedC.add(pair.current);
    usedP.add(pair.prior);
    out.push(pair);
  }
  return out;
}

/**
 * Trend for a matched issue in the monitor: worsened when frequency rose by
 * at least max(2, 25% of the previous frequency), improved when it fell by at
 * least that much, otherwise persistent.
 */
export function classifyTrend(previousFrequency: number, currentFrequency: number): Extract<IssueTrend, "worsened" | "improved" | "persistent"> {
  const prev = Math.max(0, previousFrequency);
  const step = Math.max(2, Math.ceil(prev * 0.25));
  const delta = currentFrequency - prev;
  if (delta >= step) return "worsened";
  if (-delta >= step) return "improved";
  return "persistent";
}

/**
 * Run-over-run diff for the anonymous analyzer (localStorage history).
 * Same behaviour as before: any frequency increase is "worsened", any
 * decrease "improved"; unmatched prior issues are "resolved".
 */
export async function computeDiff(current: Issue[], prior: Issue[], priorRunDate: string): Promise<AnalysisDiff> {
  if (prior.length === 0 || current.length === 0) {
    return {
      perIssue: current.map(() => ({ category: "new" as const })),
      resolved: [],
      priorRunDate,
    };
  }

  const all = await embedBatch([...current.map(issueSignature), ...prior.map(issueSignature)]);
  const currentEmbeds = all.slice(0, current.length);
  const priorEmbeds = all.slice(current.length);
  const matches = greedyMatch(currentEmbeds, priorEmbeds);
  const byCurrent = new Map(matches.map((m) => [m.current, m]));
  const matchedPrior = new Set(matches.map((m) => m.prior));

  const perIssue: IssueDiff[] = current.map((cur, ci) => {
    const m = byCurrent.get(ci);
    if (!m) return { category: "new" };
    const priorIssue = prior[m.prior];
    const delta = (cur.frequency ?? 0) - (priorIssue.frequency ?? 0);
    return {
      category: delta > 0 ? "worsened" : delta < 0 ? "improved" : "persistent",
      priorIdx: m.prior,
      priorTitle: priorIssue.title,
      priorFrequency: priorIssue.frequency,
      similarity: m.similarity,
    };
  });

  const resolved: ResolvedIssue[] = [];
  prior.forEach((p, priorIdx) => {
    if (!matchedPrior.has(priorIdx)) resolved.push({ priorIdx, title: p.title, frequency: p.frequency ?? 0 });
  });

  return { perIssue, resolved, priorRunDate };
}
