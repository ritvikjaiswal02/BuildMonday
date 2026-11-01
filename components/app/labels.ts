/**
 * Words and tones for every status-like value the app shows. One place, so the
 * dashboard, inbox, issues, runs and the anonymous analyzer always agree
 * (BUILD_CONTRACTS 8.2 "Semantic mapping"). Pure and client-safe.
 */
import type {
  FeedbackSourceKind,
  FeedbackStatus,
  IssueTrend,
  IssueWorkflowStatus,
  RunStatus,
  RunTrigger,
} from "@/lib/db/schema";
import type { Action, ChurnRisk, Effort, Severity } from "@/lib/types";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger";
export type ToneVariant = "soft" | "outline" | "solid";

export interface LabelMeta {
  label: string;
  tone: Tone;
  variant?: ToneVariant;
  /** Longer explanation for tooltips and screen readers. */
  description?: string;
}

export const ACTION_META: Record<Action, LabelMeta> = {
  fix_now: { label: "Fix now", tone: "danger", description: "Hurting many users or likely to cause churn. Put it in this sprint." },
  investigate: { label: "Investigate", tone: "warning", description: "Real, but the cause or reach is unclear. Worth a closer look." },
  monitor: { label: "Monitor", tone: "neutral", description: "Low reach or low severity for now. Keep an eye on it." },
};

export const TREND_META: Record<IssueTrend, LabelMeta> = {
  new: { label: "New", tone: "brand", description: "First seen in the latest run." },
  worsened: { label: "Getting worse", tone: "danger", description: "More reports than in the previous run." },
  improved: { label: "Improving", tone: "success", description: "Fewer reports than in the previous run." },
  resolved: {
    label: "Resolved",
    tone: "success",
    variant: "outline",
    description: "Seen before, but not in the latest run.",
  },
  persistent: { label: "Ongoing", tone: "neutral", description: "About as many reports as in the previous run." },
};

export const LEVEL_TONE: Record<Severity | ChurnRisk, Tone> = {
  High: "danger",
  Medium: "warning",
  Low: "neutral",
};

export const EFFORT_META: Record<Effort, { short: string; label: string }> = {
  S: { short: "S", label: "Small, 1 to 2 days" },
  M: { short: "M", label: "Medium, about a week" },
  L: { short: "L", label: "Large, more than a sprint" },
};

/** Workflow status of an issue. The analyzer uses the first three; the database adds "ignored". */
export const ISSUE_STATUS_META: Record<IssueWorkflowStatus, LabelMeta> = {
  backlog: { label: "Backlog", tone: "neutral" },
  in_progress: { label: "In progress", tone: "brand" },
  shipped: { label: "Shipped", tone: "success" },
  ignored: { label: "Ignored", tone: "neutral", variant: "outline" },
};

export const ISSUE_STATUS_ORDER: IssueWorkflowStatus[] = ["backlog", "in_progress", "shipped", "ignored"];

export const RUN_STATUS_META: Record<RunStatus, LabelMeta> = {
  queued: { label: "Queued", tone: "brand" },
  running: { label: "Running", tone: "brand" },
  succeeded: { label: "Succeeded", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "neutral" },
};

export const RUN_TRIGGER_LABEL: Record<RunTrigger, string> = {
  schedule: "Scheduled",
  manual: "Run now",
  onboarding: "First run",
};

export const FEEDBACK_STATUS_META: Record<FeedbackStatus, LabelMeta> = {
  new: { label: "Not grouped", tone: "brand" },
  triaged: { label: "Grouped", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
  spam: { label: "Spam", tone: "warning" },
};

export const FEEDBACK_STATUS_ORDER: FeedbackStatus[] = ["new", "triaged", "archived", "spam"];

export const FEEDBACK_KIND_LABEL: Record<FeedbackSourceKind, string> = {
  appstore: "App Store",
  playstore: "Google Play",
  reddit: "Reddit",
  hackernews: "Hacker News",
  trustpilot: "Trustpilot",
  widget: "Website widget",
  extension: "Extension",
  manual: "Added by hand",
  import: "Pasted list",
};

export const FEEDBACK_KIND_ORDER: FeedbackSourceKind[] = [
  "appstore",
  "playstore",
  "reddit",
  "hackernews",
  "trustpilot",
  "widget",
  "extension",
  "manual",
  "import",
];

export function isRunActive(status: RunStatus): boolean {
  return status === "queued" || status === "running";
}

/** "2 of 5" for star ratings; null when the item has no rating. */
export function formatRating(rating: number | null | undefined): string | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return `${r} of 5`;
}
