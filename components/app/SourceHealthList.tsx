import * as React from "react";
import Link from "next/link";
import type { SourceDTO } from "@/lib/db/dto";
import { SourceGlyph } from "@/components/brand/logos";
import { cn, formatRelativeTime, pluralize } from "@/lib/utils";

export type SourceHealth = "healthy" | "error" | "paused" | "waiting";

export function sourceHealth(source: Pick<SourceDTO, "enabled" | "lastError" | "lastFetchedAt" | "lastSuccessAt">): SourceHealth {
  if (!source.enabled) return "paused";
  if (source.lastError && (!source.lastSuccessAt || (source.lastFetchedAt ?? "") >= source.lastSuccessAt)) return "error";
  if (!source.lastFetchedAt) return "waiting";
  return "healthy";
}

const HEALTH: Record<SourceHealth, { label: string; dot: string }> = {
  healthy: { label: "Healthy", dot: "bg-success" },
  error: { label: "Error", dot: "bg-danger" },
  paused: { label: "Paused", dot: "border border-ink-faint bg-transparent" },
  waiting: { label: "Waiting for first run", dot: "bg-ink-faint" },
};

/** Compact source health list for the dashboard side column. */
export function SourceHealthList({ sources, className }: { sources: SourceDTO[]; className?: string }) {
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {sources.map((s) => {
        const health = sourceHealth(s);
        const meta = HEALTH[health];
        return (
          <li key={s.id} className="flex items-start gap-3 px-4 py-3">
            <SourceGlyph kind={s.kind} className="mt-0.5 size-4 text-ink-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink" title={s.label}>
                {s.role === "competitor" && s.competitorName ? `${s.competitorName}: ` : ""}
                {s.label}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
                  {meta.label}
                </span>
                {s.lastFetchedAt ? <span>Checked {formatRelativeTime(s.lastFetchedAt)}</span> : null}
                {health === "healthy" && typeof s.lastItemCount === "number" ? (
                  <span>{pluralize(s.lastItemCount, "item")}</span>
                ) : null}
              </p>
              {health === "error" && s.lastError ? (
                <p className="mt-1 line-clamp-2 text-xs text-danger">{s.lastError}</p>
              ) : null}
            </div>
          </li>
        );
      })}
      <li className="px-4 py-2.5">
        <Link href="/settings/sources" className="focus-ring rounded-sm text-sm font-medium text-brand hover:underline">
          Manage sources
        </Link>
      </li>
    </ul>
  );
}
