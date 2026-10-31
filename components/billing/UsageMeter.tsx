"use client";

import * as React from "react";
import { ProgressBar } from "@/components/ui/meter";
import { cn } from "@/lib/utils";
import { isUnlimited } from "@/lib/plans";
import { usageText, usageTone } from "./copy";

export interface UsageMeterProps {
  label: string;
  used: number;
  /** -1 means unlimited: no bar is drawn. */
  limit: number;
  /** Plural noun for the figures, e.g. "feedback items". */
  unit?: string;
  /** One line: label left, figures right, thin bar below. */
  compact?: boolean;
  className?: string;
}

/**
 * Usage against a plan limit. Bar tone: brand below 80%, warning from 80 to
 * 99%, danger at 100%. The state is also said in words, never colour alone.
 */
export function UsageMeter({ label, used, limit, unit, compact = false, className }: UsageMeterProps) {
  const safeUsed = Number.isFinite(used) && used > 0 ? Math.floor(used) : 0;
  const unlimited = isUnlimited(limit);
  const notIncluded = !unlimited && limit === 0;
  const tone = usageTone(safeUsed, limit);
  const figures = usageText(safeUsed, limit, unit);
  const remaining = unlimited ? null : Math.max(0, limit - safeUsed);

  const note = unlimited
    ? "Unlimited"
    : notIncluded
      ? "Not on your plan"
      : tone === "danger"
        ? "Limit reached"
        : tone === "warning"
          ? `${new Intl.NumberFormat("en-US").format(remaining ?? 0)} left`
          : null;

  const noteClass =
    tone === "danger" && !notIncluded
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : "text-ink-muted";

  const bar =
    unlimited || notIncluded ? null : (
      <ProgressBar value={safeUsed} max={limit} tone={tone} label={`${label}: ${figures}`} />
    );

  if (compact) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-ink-secondary">{label}</span>
          <span className="shrink-0 tabular-nums text-ink">
            {unlimited ? (
              <>
                {figures}
                <span className="ml-1.5 text-ink-muted">Unlimited</span>
              </>
            ) : (
              figures
            )}
          </span>
        </div>
        {bar}
        {note && !unlimited ? <p className={cn("text-xs", noteClass)}>{note}</p> : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm font-medium text-ink">{label}</p>
        {note ? <p className={cn("text-xs font-medium", noteClass)}>{note}</p> : null}
      </div>
      <p className="font-display text-xl font-semibold tabular-nums text-ink">{figures}</p>
      {bar ?? <div aria-hidden className="h-1.5 w-full rounded-full border border-dashed border-line" />}
    </div>
  );
}
