import * as React from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatDelta {
  value: string;
  direction: "up" | "down" | "flat";
  tone?: "good" | "bad" | "neutral";
}

export interface StatProps {
  label: string;
  value: React.ReactNode;
  delta?: StatDelta;
  hint?: string;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
}

const DELTA_TONE = {
  good: "text-success",
  bad: "text-danger",
  neutral: "text-ink-muted",
} as const;

const DELTA_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;
const DELTA_WORD = { up: "Up", down: "Down", flat: "No change," } as const;

/** One figure with its label. Group several inside `StatGroup` rather than separate cards. */
export function Stat({ label, value, delta, hint, icon: Icon, loading = false, className }: StatProps) {
  const DeltaIcon = delta ? DELTA_ICON[delta.direction] : null;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 bg-surface px-4 py-4 sm:px-5", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <div aria-hidden className="skeleton mt-1 h-7 w-20 rounded" />
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-display text-2xl font-semibold tabular-nums text-ink">{value}</span>
          {delta && DeltaIcon ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
                DELTA_TONE[delta.tone ?? "neutral"],
              )}
            >
              <DeltaIcon aria-hidden className="size-3.5" />
              <span className="sr-only">{DELTA_WORD[delta.direction]} </span>
              {delta.value}
            </span>
          ) : null}
        </div>
      )}
      {hint ? <p className="truncate text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

const COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

/** A single bordered row of stats divided by hairlines. Wraps to two columns on small screens. */
export function StatGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  const count = React.Children.toArray(children).filter(Boolean).length;
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs",
        COLS[Math.min(Math.max(count, 1), 6)],
        // An odd last cell on the 2-column layout spans the row so no empty gap shows.
        count === 5 && "[&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
