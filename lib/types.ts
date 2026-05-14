export type IssueStatus = "backlog" | "in_progress" | "shipped";

export type Severity = "Low" | "Medium" | "High";
export type ChurnRisk = "Low" | "Medium" | "High";
export type Effort = "S" | "M" | "L";
export type Action = "fix_now" | "investigate" | "monitor";
export type Source = "appstore" | "reddit" | "hn" | "manual";

export const SOURCES: Source[] = ["appstore", "reddit", "hn", "manual"];

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
