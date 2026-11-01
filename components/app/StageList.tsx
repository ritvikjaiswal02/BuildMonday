import * as React from "react";
import { Check, CircleSlash, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { StepState } from "./run-stages";

export interface StageListStep {
  label: string;
  hint?: string;
  state: StepState;
}

const STATE_WORD: Record<StepState, string> = {
  done: "done",
  active: "in progress",
  pending: "waiting",
  failed: "failed",
  skipped: "skipped",
};

/**
 * Vertical list of steps for long jobs (analysis, monitor runs). One marker per
 * step joined by a hairline; the active step shows a spinner and its hint.
 */
export function StageList({ steps, className }: { steps: StageListStep[]; className?: string }) {
  return (
    <ol className={cn("space-y-0", className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.label} className="relative flex gap-3 pb-4 last:pb-0">
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[11px] top-6 h-[calc(100%-16px)] w-px",
                  step.state === "done" ? "bg-brand/50" : "bg-line",
                )}
              />
            ) : null}
            <StepMarker state={step.state} />
            <div className="min-w-0 pt-0.5">
              <p
                className={cn(
                  "text-sm",
                  step.state === "active" && "font-medium text-ink",
                  step.state === "done" && "text-ink-secondary",
                  step.state === "pending" && "text-ink-muted",
                  step.state === "skipped" && "text-ink-faint line-through decoration-ink-faint/60",
                  step.state === "failed" && "font-medium text-danger",
                )}
              >
                {step.label}
                <span className="sr-only">, {STATE_WORD[step.state]}</span>
              </p>
              {step.hint && step.state === "active" ? (
                <p className="mt-0.5 text-xs text-ink-muted">{step.hint}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepMarker({ state }: { state: StepState }) {
  const base = "relative z-[1] inline-flex size-6 shrink-0 items-center justify-center rounded-full border";
  if (state === "done")
    return (
      <span aria-hidden className={cn(base, "border-brand bg-brand text-on-brand")}>
        <Check className="size-3.5" strokeWidth={2.5} />
      </span>
    );
  if (state === "active")
    return (
      <span aria-hidden className={cn(base, "border-brand/40 bg-brand-soft text-brand")}>
        <Spinner size="sm" className="size-3.5" />
      </span>
    );
  if (state === "failed")
    return (
      <span aria-hidden className={cn(base, "border-danger bg-danger text-on-brand")}>
        <X className="size-3.5" strokeWidth={2.5} />
      </span>
    );
  if (state === "skipped")
    return (
      <span aria-hidden className={cn(base, "border-line bg-sunken text-ink-faint")}>
        <CircleSlash className="size-3" />
      </span>
    );
  return <span aria-hidden className={cn(base, "border-line-strong bg-surface")} />;
}
