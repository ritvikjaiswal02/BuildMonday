/**
 * Analysis vocabulary shared by the anonymous analyzer (`/app`, localStorage),
 * the API routes and the monitor engine. Client-safe: type-only imports.
 */
import type { FeedbackSourceKind } from "@/lib/db/schema";

export type IssueStatus = "backlog" | "in_progress" | "shipped";

export type Severity = "Low" | "Medium" | "High";
export type ChurnRisk = "Low" | "Medium" | "High";
export type Effort = "S" | "M" | "L";
export type Action = "fix_now" | "investigate" | "monitor";

/** Where a complaint came from, as the analyzer and its UI name it. */
export type Source = "appstore" | "playstore" | "reddit" | "hn" | "trustpilot" | "widget" | "extension" | "manual";

export const SOURCES: Source[] = ["appstore", "playstore", "reddit", "hn", "trustpilot", "widget", "extension", "manual"];

export const SOURCE_LABELS: Record<Source, string> = {
  appstore: "App Store",
  playstore: "Google Play",
  reddit: "Reddit",
  hn: "Hacker News",
  trustpilot: "Trustpilot",
  widget: "Website widget",
  extension: "Extension",
  manual: "Pasted",
};

export function isSource(value: unknown): value is Source {
  return typeof value === "string" && (SOURCES as string[]).includes(value);
}

/** Database feedback kind to analyzer source: hackernews -> hn, import -> manual, others identical. */
export function feedbackKindToSource(kind: FeedbackSourceKind): Source {
  switch (kind) {
    case "hackernews":
      return "hn";
    case "import":
      return "manual";
    default:
      return kind;
  }
}

/** Analyzer source to database feedback kind: hn -> hackernews, others identical. */
export function sourceToFeedbackKind(source: Source): FeedbackSourceKind {
  return source === "hn" ? "hackernews" : source;
}

export type SourceMix = Partial<Record<Source, number>>;

export interface TaggedComplaint {
  complaint: string;
  category: string;
  severity: Severity;
  affected_segment: string;
  churn_signal: ChurnRisk;
  urgency_keywords: string[];
  source: Source;
}

export interface Issue {
  title: string;
  frequency: number;
  severity: Severity;
  churn_risk: ChurnRisk;
  effort: Effort;
  affected_segment: string;
  evidence: string[];
  recommended_action: Action;
  priority_score: number;
  ranking_reason?: string;
  source_mix?: SourceMix;
  /** Most common complaint category in the cluster (from pass 1). */
  category?: string;
  /** 1-based indices into the analyzed items that belong to this issue. */
  member_indices?: number[];
}

export type DiffCategory = "new" | "persistent" | "worsened" | "improved";

export interface IssueDiff {
  category: DiffCategory;
  priorIdx?: number;
  priorTitle?: string;
  priorFrequency?: number;
  similarity?: number;
}

export interface ResolvedIssue {
  priorIdx: number;
  title: string;
  frequency: number;
}

export interface AnalysisDiff {
  perIssue: IssueDiff[];
  resolved: ResolvedIssue[];
  priorRunDate: string;
}

export interface HistoryEntry {
  timestamp: string;
  complaintCount: number;
  issues: Issue[];
}

export interface PrdStub {
  problem_statement: string;
  affected_users: string[];
  acceptance_criteria: string[];
  edge_cases: string[];
  success_metrics: string[];
  implementation_notes: string;
  estimated_complexity: Effort;
}
