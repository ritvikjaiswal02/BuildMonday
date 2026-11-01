/**
 * Pure matching of new feedback to existing issues by embedding similarity.
 * Used on ingest so feedback from the widget, the extension or a paste shows
 * which issue it belongs to right away, instead of waiting for the next run.
 */
import { cosineSimilarity } from "@/lib/embeddings-math";

/** Minimum cosine similarity for a feedback item to count as the same issue. */
export const MATCH_THRESHOLD = 0.72;

export interface MatchItem {
  id: string;
  role: "own" | "competitor";
  competitorName: string | null;
  embedding: number[];
}

export interface MatchIssue {
  id: string;
  scope: "own" | "competitor";
  competitorName: string | null;
  embedding: number[];
}

function sameScope(item: MatchItem, issue: MatchIssue): boolean {
  if (item.role !== issue.scope) return false;
  if (item.role === "own") return true;
  // Competitor feedback only joins that competitor's issues.
  if (!item.competitorName || !issue.competitorName) return true;
  return item.competitorName.trim().toLowerCase() === issue.competitorName.trim().toLowerCase();
}

/** feedback id -> issue id, for items whose best same-scope issue reaches the threshold. */
export function matchToIssues(
  items: MatchItem[],
  issues: MatchIssue[],
  threshold = MATCH_THRESHOLD,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of items) {
    let best: { id: string; score: number } | null = null;
    for (const issue of issues) {
      if (!sameScope(item, issue)) continue;
      const score = cosineSimilarity(item.embedding, issue.embedding);
      if (score >= threshold && (!best || score > best.score)) best = { id: issue.id, score };
    }
    if (best) out.set(item.id, best.id);
  }
  return out;
}
