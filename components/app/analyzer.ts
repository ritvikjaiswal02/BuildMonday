/**
 * Pure helpers for the anonymous analyzer at /app.
 */
import type { Action, Issue, IssueStatus, Source } from "@/lib/types";
import { CARRY_FEEDBACK_KEY, type CarriedFeedback } from "@/components/onboarding/model";

/** Non-empty trimmed lines; each line is one complaint. */
export function splitComplaints(text: string): string[] {
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function countComplaints(text: string): number {
  return splitComplaints(text).length;
}

/** The analyze API accepts at most this many items per request. */
export const MAX_ANALYZE_ITEMS = 300;

export type BatchHint = { tone: "neutral" | "warning"; message: string } | null;

/** Guidance under the textarea for the current number of complaints. */
export function complaintBatchHint(count: number): BatchHint {
  if (count === 0) return null;
  if (count > MAX_ANALYZE_ITEMS)
    return {
      tone: "warning",
      message: `Only the first ${MAX_ANALYZE_ITEMS} are analyzed. Remove some lines or split the batch.`,
    };
  if (count < 5) return { tone: "warning", message: "Add a few more. Grouping works best with at least 5." };
  if (count > 100) return { tone: "neutral", message: "Large batch. Analysis takes about 20 seconds." };
  return { tone: "neutral", message: "Ready to analyze." };
}

/**
 * Sign-up link that carries the analyzed source into onboarding, so step 2 is
 * pre-filled: /login?next=/onboarding?source=<url>. Without a URL it just
 * leads to onboarding.
 */
export function watchSourceHref(sourceUrl: string | null | undefined): string {
  const url = sourceUrl?.trim();
  const next = url ? `/onboarding?source=${encodeURIComponent(url)}` : "/onboarding";
  return `/login?next=${encodeURIComponent(next)}`;
}

/**
 * Keeps what the visitor just analyzed so onboarding can add it to the new
 * product's inbox: the first run then has data even before any source is
 * added. localStorage (not sessionStorage) so it survives the email sign-in
 * link opening in a new tab; it expires after a day and is cleared on use.
 */
export function carryFeedbackForSignup(text: string, now: number = Date.now()): number {
  const items = splitComplaints(text).slice(0, MAX_ANALYZE_ITEMS);
  if (items.length === 0) return 0;
  try {
    const value: CarriedFeedback = { items, savedAt: now };
    window.localStorage.setItem(CARRY_FEEDBACK_KEY, JSON.stringify(value));
    return items.length;
  } catch {
    return 0;
  }
}

export type SortMode = "priority" | "frequency" | "severity";

const SEVERITY_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

export interface AnalyzerFilters {
  actions: Set<Action>;
  statuses: Set<IssueStatus>;
  sources: Set<Source>;
  sort: SortMode;
}

/**
 * Issues with their original 0-based rank, filtered and sorted for display.
 * Shipped issues sink to the bottom; ties keep the analysis order.
 */
export function orderAnalyzerIssues(
  issues: Issue[],
  statusOf: (issue: Issue) => IssueStatus,
  filters: AnalyzerFilters,
): Array<{ issue: Issue; originalRank: number }> {
  const filtered = issues
    .map((issue, originalRank) => ({ issue, originalRank }))
    .filter(({ issue }) => {
      if (filters.actions.size > 0 && !filters.actions.has(issue.recommended_action)) return false;
      if (filters.statuses.size > 0 && !filters.statuses.has(statusOf(issue))) return false;
      if (filters.sources.size > 0) {
        const mix = issue.source_mix ?? {};
        let any = false;
        for (const src of filters.sources) {
          if ((mix[src] ?? 0) > 0) {
            any = true;
            break;
          }
        }
        if (!any) return false;
      }
      return true;
    });

  return filtered.sort((a, b) => {
    const aShipped = statusOf(a.issue) === "shipped" ? 1 : 0;
    const bShipped = statusOf(b.issue) === "shipped" ? 1 : 0;
    if (aShipped !== bShipped) return aShipped - bShipped;
    if (filters.sort === "frequency") {
      const d = (b.issue.frequency ?? 0) - (a.issue.frequency ?? 0);
      if (d !== 0) return d;
    } else if (filters.sort === "severity") {
      const d = (SEVERITY_RANK[b.issue.severity] ?? 0) - (SEVERITY_RANK[a.issue.severity] ?? 0);
      if (d !== 0) return d;
    }
    return a.originalRank - b.originalRank;
  });
}

/** Rough sprint estimate shown in the summary: half a sprint per fix-now, a third per investigate. */
export function sprintEstimate(issues: Issue[]): number {
  const fixNow = issues.filter((i) => i.recommended_action === "fix_now").length;
  const investigate = issues.filter((i) => i.recommended_action === "investigate").length;
  if (fixNow + investigate === 0) return 0;
  return Math.max(1, Math.ceil(fixNow * 0.5 + investigate * 0.3));
}
