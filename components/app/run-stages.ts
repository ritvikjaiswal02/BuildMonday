/**
 * The stage list a monitor run walks through (PRODUCT_SPEC 6.2), and how a
 * run's current stage and status map onto it. Pure and client-safe.
 */
import type { RunStage, RunStatus } from "@/lib/db/schema";

export const RUN_STEPS = [
  { key: "fetching", label: "Fetching sources", hint: "Reading your app stores, threads and pages." },
  { key: "storing", label: "Saving new feedback", hint: "Skipping anything already in your inbox." },
  { key: "clustering", label: "Grouping into issues", hint: "Reading every item and grouping the same problem." },
  { key: "diffing", label: "Comparing with last run", hint: "Marking what is new, worse, better or resolved." },
  { key: "alerting", label: "Sending alerts", hint: "Emails, Slack and auto-filed issues, if you set them up." },
] as const;

export type RunStepKey = (typeof RUN_STEPS)[number]["key"];
export type StepState = "done" | "active" | "pending" | "failed" | "skipped";

/** Position of a stage in RUN_STEPS: -1 before it starts, RUN_STEPS.length once done. */
export function stageIndex(stage: RunStage): number {
  switch (stage) {
    case "queued":
      return -1;
    case "fetching":
      return 0;
    case "storing":
      return 1;
    case "clustering":
      return 2;
    case "diffing":
      return 3;
    case "alerting":
    case "filing":
      return 4;
    case "done":
      return RUN_STEPS.length;
    default:
      return -1;
  }
}

/** One state per entry of RUN_STEPS. */
export function runStepStates(stage: RunStage, status: RunStatus): StepState[] {
  const n = RUN_STEPS.length;
  const idx = stageIndex(stage);

  if (status === "succeeded") return Array.from({ length: n }, () => "done");

  if (status === "skipped") {
    // A run is skipped after storing when nothing new arrived; the rest never ran.
    const reached = idx >= n || idx < 0 ? 2 : idx;
    return Array.from({ length: n }, (_, i) => (i < reached ? "done" : "skipped"));
  }

  if (status === "failed") {
    const at = idx < 0 ? 0 : Math.min(idx, n - 1);
    return Array.from({ length: n }, (_, i) => (i < at ? "done" : i === at ? "failed" : "pending"));
  }

  // queued or running
  if (idx < 0) return Array.from({ length: n }, () => "pending");
  return Array.from({ length: n }, (_, i) => (i < idx ? "done" : i === idx ? "active" : "pending"));
}

/** Short sentence for live regions: "Grouping into issues (step 3 of 5)". */
export function describeRunProgress(stage: RunStage, status: RunStatus): string {
  if (status === "succeeded") return "Run finished.";
  if (status === "failed") return "Run failed.";
  if (status === "skipped") return "Run skipped.";
  const idx = stageIndex(stage);
  if (idx < 0) return "Waiting to start.";
  if (idx >= RUN_STEPS.length) return "Finishing up.";
  return `${RUN_STEPS[idx].label} (step ${idx + 1} of ${RUN_STEPS.length}).`;
}
