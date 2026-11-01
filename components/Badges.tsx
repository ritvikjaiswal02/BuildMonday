import * as React from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDot, Minus, Plus, type LucideIcon } from "lucide-react";
import type { FeedbackStatus, IssueTrend, IssueWorkflowStatus, RunStatus } from "@/lib/db/schema";
import type { Action, ChurnRisk, Effort, Severity } from "@/lib/types";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { RankNumber } from "@/components/ui/week-strip";
import { Spinner } from "@/components/ui/spinner";
import { cn, pluralize } from "@/lib/utils";
import {
  ACTION_META,
  EFFORT_META,
  FEEDBACK_STATUS_META,
  ISSUE_STATUS_META,
  LEVEL_TONE,
  RUN_STATUS_META,
  TREND_META,
} from "@/components/app/labels";

/**
 * Status vocabulary as badges. Every badge carries a word, so colour is never
 * the only signal (BUILD_CONTRACTS 8.2).
 */

type Size = BadgeProps["size"];

export function ActionBadge({ value, size }: { value: Action; size?: Size }) {
  const meta = ACTION_META[value];
  return (
    <Badge tone={meta.tone} size={size} dot title={meta.description}>
      {meta.label}
    </Badge>
  );
}

export function SeverityBadge({ value, size, compact }: { value: Severity; size?: Size; compact?: boolean }) {
  return (
    <Badge tone={LEVEL_TONE[value]} variant="outline" size={size} title={`Severity: ${value}`}>
      {compact ? value : `Severity ${value.toLowerCase()}`}
    </Badge>
  );
}

export function ChurnBadge({ value, size }: { value: ChurnRisk; size?: Size }) {
  return (
    <Badge
      tone={LEVEL_TONE[value]}
      variant="outline"
      size={size}
      title="Estimated from cancellation and switching language in the feedback"
    >
      Churn risk {value.toLowerCase()}
    </Badge>
  );
}

export function EffortBadge({ value, size }: { value: Effort; size?: Size }) {
  const meta = EFFORT_META[value];
  return (
    <Badge tone="neutral" variant="outline" size={size} title={`Effort: ${meta.label}`}>
      Effort {meta.short}
    </Badge>
  );
}

export function FrequencyBadge({ value, size }: { value: number; size?: Size }) {
  return (
    <Badge tone="neutral" size={size} className="tabular-nums">
      {pluralize(value, "report")}
    </Badge>
  );
}

/** Rank cell in the display face. `action` is accepted for older call sites and not used for colour. */
export function RankBadge({ rank, className }: { rank: number; action?: Action; className?: string }) {
  return <RankNumber rank={rank} className={className} />;
}

const TREND_ICON: Record<IssueTrend, LucideIcon> = {
  new: Plus,
  worsened: ArrowUpRight,
  improved: ArrowDownRight,
  resolved: CheckCircle2,
  persistent: Minus,
};

export function TrendBadge({
  trend,
  size,
  hidePersistent = false,
  delta,
}: {
  trend: IssueTrend;
  size?: Size;
  /** Ongoing issues are the default state and often not worth a badge. */
  hidePersistent?: boolean;
  /** Optional change in reports, shown after the label: "+4". */
  delta?: number | null;
}) {
  if (hidePersistent && trend === "persistent") return null;
  const meta = TREND_META[trend];
  const Icon = TREND_ICON[trend];
  return (
    <Badge tone={meta.tone} variant={meta.variant ?? "soft"} size={size} title={meta.description}>
      <Icon aria-hidden className="size-3 shrink-0" />
      {meta.label}
      {typeof delta === "number" && delta !== 0 ? (
        <span className="tabular-nums">{delta > 0 ? `+${delta}` : `${delta}`}</span>
      ) : null}
    </Badge>
  );
}

export function IssueStatusBadge({ status, size }: { status: IssueWorkflowStatus; size?: Size }) {
  const meta = ISSUE_STATUS_META[status];
  return (
    <Badge tone={meta.tone} variant={meta.variant ?? "soft"} size={size} dot>
      {meta.label}
    </Badge>
  );
}

export function RunStatusBadge({ status, size }: { status: RunStatus; size?: Size }) {
  const meta = RUN_STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size}>
      {status === "running" ? (
        <Spinner size="sm" className="size-3" />
      ) : status === "queued" ? (
        <CircleDot aria-hidden className="size-3 motion-safe:animate-pulse-dot" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            status === "succeeded" && "bg-success",
            status === "failed" && "bg-danger",
            status === "skipped" && "bg-ink-faint",
          )}
        />
      )}
      {meta.label}
    </Badge>
  );
}

export function FeedbackStatusBadge({ status, size }: { status: FeedbackStatus; size?: Size }) {
  const meta = FEEDBACK_STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}
