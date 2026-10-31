/**
 * Conversions between stored issue rows and the analyzer's `Issue` shape.
 * Pure; type-only imports.
 */
import type { FeedbackSourceKind, Issue as IssueRow } from "@/lib/db/schema";
import {
  feedbackKindToSource,
  isSource,
  sourceToFeedbackKind,
  type Issue,
  type IssueStatus,
  type PrdStub,
  type SourceMix,
} from "@/lib/types";

export function sourceMixToKinds(mix: SourceMix | undefined): Partial<Record<FeedbackSourceKind, number>> {
  const out: Partial<Record<FeedbackSourceKind, number>> = {};
  for (const [k, v] of Object.entries(mix ?? {})) {
    if (!isSource(k) || typeof v !== "number" || v <= 0) continue;
    const kind = sourceToFeedbackKind(k);
    out[kind] = (out[kind] ?? 0) + v;
  }
  return out;
}

export function kindsToSourceMix(mix: Partial<Record<FeedbackSourceKind, number>> | null | undefined): SourceMix {
  const out: SourceMix = {};
  for (const [k, v] of Object.entries(mix ?? {})) {
    if (typeof v !== "number" || v <= 0) continue;
    const source = feedbackKindToSource(k as FeedbackSourceKind);
    out[source] = (out[source] ?? 0) + v;
  }
  return out;
}

/** A stored issue in the analyzer's shape (for Markdown, PRDs and chat). */
export function rowToAnalysisIssue(r: IssueRow): Issue {
  return {
    title: r.title,
    frequency: r.frequency,
    severity: r.severity,
    churn_risk: r.churnRisk,
    effort: r.effort,
    affected_segment: r.affectedSegment,
    evidence: r.evidence ?? [],
    recommended_action: r.recommendedAction,
    priority_score: r.priorityScore,
    ranking_reason: r.rankingReason ?? undefined,
    source_mix: kindsToSourceMix(r.sourceMix),
    category: r.category ?? undefined,
  };
}

/** Workflow status in the analyzer's vocabulary ("ignored" has no analyzer equivalent). */
export function rowStatus(r: IssueRow): IssueStatus | "ignored" {
  return r.status;
}

export function rowPrd(r: IssueRow): PrdStub | null {
  return (r.prd as PrdStub | null) ?? null;
}
