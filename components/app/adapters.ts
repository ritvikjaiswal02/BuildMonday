/**
 * Converters between persisted issues (IssueDTO, camelCase) and the analyzer's
 * Issue shape (snake_case), so the Markdown and tracker helpers written for the
 * anonymous analyzer work on stored issues too. Pure and client-safe.
 */
import type { IssueDTO } from "@/lib/db/dto";
import type { FeedbackSourceKind } from "@/lib/db/schema";
import { feedbackKindToSource, type Issue, type PrdStub, type SourceMix } from "@/lib/types";

/** Feedback-kind counts (hackernews, import, ...) to analyzer source counts (hn, manual, ...). */
export function sourceMixFromKinds(mix: Partial<Record<FeedbackSourceKind, number>> | null | undefined): SourceMix {
  const out: SourceMix = {};
  if (!mix) return out;
  for (const [kind, count] of Object.entries(mix) as Array<[FeedbackSourceKind, number | undefined]>) {
    if (!count || count <= 0) continue;
    const source = feedbackKindToSource(kind);
    out[source] = (out[source] ?? 0) + count;
  }
  return out;
}

export function issueDtoToAnalysis(dto: IssueDTO): Issue {
  return {
    title: dto.title,
    frequency: dto.frequency,
    severity: dto.severity,
    churn_risk: dto.churnRisk,
    effort: dto.effort,
    affected_segment: dto.affectedSegment,
    evidence: dto.evidence,
    recommended_action: dto.recommendedAction,
    priority_score: dto.priorityScore,
    ranking_reason: dto.rankingReason ?? undefined,
    source_mix: sourceMixFromKinds(dto.sourceMix),
    category: dto.category ?? undefined,
  };
}

export function issuePrd(dto: IssueDTO): PrdStub | null {
  return dto.prd ? { ...dto.prd } : null;
}

/** Entries of a source mix, largest first, with their share of the total (0 to 1). */
export function sourceMixEntries<K extends string>(
  mix: Partial<Record<K, number>> | null | undefined,
): Array<{ kind: K; count: number; share: number }> {
  if (!mix) return [];
  const entries = (Object.entries(mix) as Array<[K, number | undefined]>)
    .filter((e): e is [K, number] => typeof e[1] === "number" && e[1] > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return entries.map(([kind, count]) => ({ kind, count, share: total > 0 ? count / total : 0 }));
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * For each evidence quote, the source kind of the linked feedback item it was
 * taken from (matched on the first 60 normalised characters), or null.
 */
export function matchEvidenceSources(
  evidence: string[],
  feedback: Array<{ text: string; sourceKind: FeedbackSourceKind }>,
): Array<FeedbackSourceKind | null> {
  const normalized = feedback.map((f) => ({ text: normalizeForMatch(f.text), kind: f.sourceKind }));
  return evidence.map((quote) => {
    const q = normalizeForMatch(quote).slice(0, 60);
    if (q.length < 8) return null;
    const hit = normalized.find((f) => f.text.includes(q));
    return hit ? hit.kind : null;
  });
}
