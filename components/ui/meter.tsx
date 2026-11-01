import * as React from "react";
import { cn } from "@/lib/utils";

export interface PriorityMeterProps {
  score: number;
  className?: string;
  /** Show the numeric score next to the segments. */
  showValue?: boolean;
}

/** Number of filled segments (0 to 5) for a 0 to 100 priority score: ceil(score / 20). */
export function prioritySegments(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(5, Math.ceil(Math.min(100, score) / 20));
}

/** Five-segment priority meter in Monday Cobalt. */
export function PriorityMeter({ score, className, showValue = false }: PriorityMeterProps) {
  const clamped = Math.round(Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0)));
  const filled = prioritySegments(clamped);
  return (
    <span
      role="img"
      aria-label={`Priority ${clamped} of 100`}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <span aria-hidden className="inline-flex items-center gap-[3px]">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn("h-2 w-3 rounded-sm", i < filled ? "bg-brand" : "bg-line")}
          />
        ))}
      </span>
      {showValue ? (
        <span aria-hidden className="text-xs font-medium tabular-nums text-ink-secondary">
          {clamped}
        </span>
      ) : null}
    </span>
  );
}

export interface ProgressBarProps {
  value: number;
  max: number;
  tone?: "brand" | "warning" | "danger";
  label?: string;
  className?: string;
}

const BAR_TONE = { brand: "bg-brand", warning: "bg-warning", danger: "bg-danger" } as const;

/** Horizontal usage bar. `max <= 0` renders an empty bar. */
export function ProgressBar({ value, max, tone = "brand", label, className }: ProgressBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max > 0 ? max : 0}
      aria-valuenow={Math.max(0, Math.min(value, max > 0 ? max : value))}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-240 ease-standard", BAR_TONE[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
