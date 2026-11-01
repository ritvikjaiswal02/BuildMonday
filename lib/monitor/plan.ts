/**
 * Pure planning for the monitor's "diff and persist" step and for source
 * selection under plan limits. No database or network access.
 */
import type { IssueTrend, Source as SourceRow } from "@/lib/db/schema";
import { classifyTrend, greedyMatch, SIMILARITY_THRESHOLD } from "./diff";

export interface StoredIssueLite {
  id: string;
  frequency: number;
  lastSeenRunId: string | null;
}

export interface IssueUpdatePlan {
  matched: Array<{
    cluster: number;
    issueId: string;
    trend: Extract<IssueTrend, "worsened" | "improved" | "persistent">;
    similarity: number;
    previousFrequency: number;
  }>;
  /** Cluster indices that become new issues. */
  created: number[];
  /** Stored issues seen in the previous run that did not come back. */
  resolved: string[];
}

/**
 * Matches this run's clusters to stored issues (one-to-one, greedy by
 * similarity, threshold 0.72), classifies trends, and finds resolved issues
 * (seen in the previous successful run but not matched now).
 */
export function planIssueUpdates(args: {
  clusterFrequencies: number[];
  clusterEmbeds: number[][];
  stored: StoredIssueLite[];
  storedEmbeds: number[][];
  previousRunId: string | null;
  threshold?: number;
}): IssueUpdatePlan {
  const matches = greedyMatch(args.clusterEmbeds, args.storedEmbeds, args.threshold ?? SIMILARITY_THRESHOLD);
  const matchedClusters = new Set(matches.map((m) => m.current));
  const matchedStored = new Set(matches.map((m) => m.prior));

  const matched = matches
    .map((m) => {
      const stored = args.stored[m.prior];
      return {
        cluster: m.current,
        issueId: stored.id,
        trend: classifyTrend(stored.frequency, args.clusterFrequencies[m.current] ?? 0),
        similarity: m.similarity,
        previousFrequency: stored.frequency,
      };
    })
    .sort((a, b) => a.cluster - b.cluster);

  const created: number[] = [];
  for (let i = 0; i < args.clusterFrequencies.length; i++) if (!matchedClusters.has(i)) created.push(i);

  const resolved: string[] = [];
  if (args.previousRunId) {
    args.stored.forEach((s, i) => {
      if (!matchedStored.has(i) && s.lastSeenRunId === args.previousRunId) resolved.push(s.id);
    });
  }
  return { matched, created, resolved };
}

export interface SourceSelection {
  active: SourceRow[];
  paused: SourceRow[];
}

/**
 * Applies plan limits to a product's enabled sources, oldest first:
 * `sources_per_product` over all sources, competitor sources only with
 * competitor tracking, and at most `competitors` distinct competitor names.
 * `-1` means unlimited.
 */
export function selectSourcesForPlan(
  sources: SourceRow[],
  limits: { sourcesPerProduct: number; competitors: number; competitorTracking: boolean },
): SourceSelection {
  const ordered = [...sources]
    .filter((s) => s.enabled)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const active: SourceRow[] = [];
  const paused: SourceRow[] = [];
  const names = new Set<string>();

  for (const s of ordered) {
    const overSources = limits.sourcesPerProduct !== -1 && active.length >= limits.sourcesPerProduct;
    let overCompetitor = false;
    const name = (s.competitorName ?? "").trim().toLowerCase();
    if (s.role === "competitor") {
      if (!limits.competitorTracking) overCompetitor = true;
      else if (!names.has(name) && limits.competitors !== -1 && names.size >= limits.competitors) overCompetitor = true;
    }
    if (overSources || overCompetitor) {
      paused.push(s);
      continue;
    }
    if (s.role === "competitor") names.add(name);
    active.push(s);
  }
  return { active, paused };
}

/** Assigns 1-based ranks in priority order (input is already sorted). */
export function ranksFor(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

/** Most common non-empty value, or null. */
export function majority(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const t = v?.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [k, c] of counts) {
    if (c > n) {
      best = k;
      n = c;
    }
  }
  return best;
}
