import * as React from "react";
import Link from "next/link";
import type { RunDTO } from "@/lib/db/dto";
import { RunStatusBadge } from "@/components/Badges";
import { cn, formatDuration, formatNumber, formatRelativeTime } from "@/lib/utils";
import { RUN_TRIGGER_LABEL } from "./labels";

/** One run in a list: status, trigger, when, how long, and the key figures as separate numbers. */
export function RunRow({ run, compact = false }: { run: RunDTO; compact?: boolean }) {
  const s = run.stats;
  const when = run.startedAt ?? run.createdAt;
  return (
    <li className="relative">
      <div className={cn("flex flex-col gap-2 px-4 py-3 sm:px-5", !compact && "md:flex-row md:items-center md:gap-6")}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
          <RunStatusBadge status={run.status} size="sm" />
          <Link
            href={`/runs/${run.id}`}
            className="focus-ring rounded-sm text-sm font-medium text-ink after:absolute after:inset-0 hover:text-brand"
          >
            {RUN_TRIGGER_LABEL[run.trigger]}
          </Link>
          <span className="text-sm text-ink-muted">
            <time dateTime={when}>{formatRelativeTime(when)}</time>
          </span>
          {run.durationMs != null ? (
            <span className="text-sm tabular-nums text-ink-muted">{formatDuration(run.durationMs)}</span>
          ) : null}
        </div>

        {!compact ? (
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <Figure label="Fetched" value={s?.fetched ?? 0} />
            <Figure label="New feedback" value={s?.inserted ?? 0} />
            <Figure label="New issues" value={s?.issuesNew ?? 0} tone={s?.issuesNew ? "brand" : undefined} />
            <Figure label="Worse" value={s?.issuesWorsened ?? 0} tone={s?.issuesWorsened ? "danger" : undefined} />
          </dl>
        ) : null}
      </div>
      {run.status === "failed" && run.error ? (
        <p className="-mt-1 line-clamp-2 px-4 pb-3 text-xs text-danger sm:px-5">{run.error}</p>
      ) : null}
      {run.status === "skipped" && s?.skippedReason ? (
        <p className="-mt-1 px-4 pb-3 text-xs text-ink-muted sm:px-5">{s.skippedReason}</p>
      ) : null}
    </li>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: "brand" | "danger" }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "font-medium tabular-nums text-ink",
          tone === "brand" && "text-brand",
          tone === "danger" && "text-danger",
        )}
      >
        {formatNumber(value)}
      </dd>
    </div>
  );
}
