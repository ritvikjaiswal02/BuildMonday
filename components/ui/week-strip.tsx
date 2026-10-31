import * as React from "react";
import { cn, formatNumber } from "@/lib/utils";

export interface WeekStripDay {
  /** Short day label, e.g. "Mon". */
  label: string;
  value: number;
  /** Optional full label for screen readers, e.g. "Monday 3 Nov". */
  title?: string;
}

export interface WeekStripProps {
  days: WeekStripDay[];
  /** Index of the day to emphasise (usually today). */
  highlightIndex?: number;
  /** Unit for screen readers: "12 feedback items". */
  unit?: string;
  height?: number;
  showValues?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * The week strip: Mon to Sun cells with a volume bar each. Used on the dashboard,
 * the marketing hero and (as HTML) in the digest email.
 */
export function WeekStrip({
  days,
  highlightIndex,
  unit = "items",
  height = 56,
  showValues = true,
  className,
  "aria-label": ariaLabel = "Feedback per day",
}: WeekStripProps) {
  const max = Math.max(1, ...days.map((d) => (Number.isFinite(d.value) ? d.value : 0)));
  return (
    <ol aria-label={ariaLabel} className={cn("grid gap-1.5", className)} style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}>
      {days.map((day, i) => {
        const value = Number.isFinite(day.value) ? Math.max(0, day.value) : 0;
        const pct = value === 0 ? 0 : Math.max(8, Math.round((value / max) * 100));
        const active = i === highlightIndex;
        return (
          <li key={`${day.label}-${i}`} className="flex min-w-0 flex-col items-stretch gap-1.5">
            <span className="sr-only">
              {day.title ?? day.label}: {formatNumber(value)} {unit}
            </span>
            <div
              aria-hidden
              className={cn(
                "relative flex items-end overflow-hidden rounded-sm border",
                active ? "border-brand/40 bg-brand-soft" : "border-line bg-sunken",
              )}
              style={{ height }}
            >
              <div
                className={cn(
                  "w-full rounded-[2px] transition-[height] duration-240 ease-standard",
                  active ? "bg-brand" : "bg-brand/55",
                )}
                style={{ height: `${pct}%` }}
              />
            </div>
            <div aria-hidden className="flex flex-col items-center leading-none">
              <span className={cn("text-xs", active ? "font-medium text-ink" : "text-ink-muted")}>
                {day.label}
              </span>
              {showValues ? (
                <span className="mt-1 text-xs tabular-nums text-ink-secondary">{formatNumber(value)}</span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export interface RankNumberProps {
  rank: number | null | undefined;
  className?: string;
}

/** Rank cell: display face, tabular, brand colour for ranks 1 to 3, 40 px column. */
export function RankNumber({ rank, className }: RankNumberProps) {
  return (
    <span
      className={cn(
        "rank-number inline-flex w-10 shrink-0 justify-start leading-none",
        rank != null && rank >= 1 && rank <= 3 ? "text-brand" : "text-ink",
        rank == null && "text-ink-faint",
        className,
      )}
      aria-label={rank != null ? `Rank ${rank}` : "Unranked"}
    >
      {rank != null ? rank : "–"}
    </span>
  );
}
