/**
 * URL-backed filters for /issues. Pure, so the server page and the client
 * filter row share one parser.
 */
import type { IssueTrend, IssueWorkflowStatus, SourceRole } from "@/lib/db/schema";
import { ISSUE_STATUS_META, TREND_META } from "./labels";

export interface IssueFilterValues {
  scope: SourceRole;
  status: IssueWorkflowStatus | "open" | "all";
  trend: IssueTrend | "all";
  sort: "priority" | "frequency" | "recent";
  q: string;
}

export const DEFAULT_ISSUE_FILTERS: IssueFilterValues = {
  scope: "own",
  status: "open",
  trend: "all",
  sort: "priority",
  q: "",
};

export const ISSUE_STATUS_FILTER_OPTIONS: Array<{ value: IssueFilterValues["status"]; label: string }> = [
  { value: "open", label: "Open (backlog and in progress)" },
  { value: "all", label: "All statuses" },
  ...(["backlog", "in_progress", "shipped", "ignored"] as IssueWorkflowStatus[]).map((s) => ({
    value: s,
    label: ISSUE_STATUS_META[s].label,
  })),
];

export const ISSUE_TREND_FILTER_OPTIONS: Array<{ value: IssueFilterValues["trend"]; label: string }> = [
  { value: "all", label: "Any trend" },
  ...(["new", "worsened", "improved", "persistent", "resolved"] as IssueTrend[]).map((t) => ({
    value: t,
    label: TREND_META[t].label,
  })),
];

/** Parse search params into filters, falling back to defaults for unknown values. */
export function parseIssueFilters(params: Record<string, string | string[] | undefined>): IssueFilterValues {
  const get = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const scope = get("scope") === "competitor" ? "competitor" : "own";
  const statusRaw = get("status");
  const status = ISSUE_STATUS_FILTER_OPTIONS.some((o) => o.value === statusRaw)
    ? (statusRaw as IssueFilterValues["status"])
    : DEFAULT_ISSUE_FILTERS.status;
  const trendRaw = get("trend");
  const trend = ISSUE_TREND_FILTER_OPTIONS.some((o) => o.value === trendRaw) ? (trendRaw as IssueFilterValues["trend"]) : "all";
  const sortRaw = get("sort");
  const sort = sortRaw === "frequency" || sortRaw === "recent" ? sortRaw : "priority";
  const q = (get("q") ?? "").slice(0, 100);
  return { scope, status, trend, sort, q };
}

export function isDefaultIssueFilters(f: IssueFilterValues): boolean {
  return f.status === DEFAULT_ISSUE_FILTERS.status && f.trend === "all" && f.sort === "priority" && f.q === "";
}

