"use client";
import type { Action, IssueStatus, Source } from "@/lib/types";

export type SortMode = "priority" | "frequency" | "severity";

const pillBase =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition";

function actionLabel(a: Action): string {
  if (a === "fix_now") return "Fix Now";
  if (a === "investigate") return "Investigate";
  return "Monitor";
}

function actionColor(a: Action, active: boolean): string {
  if (a === "fix_now") {
    return active
      ? "bg-red-500/25 text-red-100 ring-red-500/50"
      : "bg-red-500/10 text-red-300/80 ring-red-500/25 hover:bg-red-500/15";
  }
  if (a === "investigate") {
    return active
      ? "bg-amber-500/25 text-amber-100 ring-amber-500/50"
      : "bg-amber-500/10 text-amber-300/80 ring-amber-500/25 hover:bg-amber-500/15";
  }
  return active
    ? "bg-white/15 text-white ring-white/30"
    : "bg-white/5 text-white/60 ring-white/15 hover:bg-white/10";
}

function statusLabel(s: IssueStatus): string {
  if (s === "in_progress") return "In progress";
  if (s === "shipped") return "Shipped";
  return "Backlog";
}

function sourceLabel(s: Source): string {
  if (s === "appstore") return "App Store";
  if (s === "reddit") return "Reddit";
  if (s === "hn") return "HN";
  return "Pasted";
}

function sourceColor(s: Source, active: boolean): string {
  if (s === "appstore") {
    return active
      ? "bg-sky-500/25 text-sky-100 ring-sky-500/50"
      : "bg-sky-500/10 text-sky-300/80 ring-sky-500/25 hover:bg-sky-500/15";
  }
  if (s === "reddit") {
    return active
      ? "bg-orange-500/25 text-orange-100 ring-orange-500/50"
      : "bg-orange-500/10 text-orange-300/80 ring-orange-500/25 hover:bg-orange-500/15";
  }
  if (s === "hn") {
    return active
      ? "bg-amber-500/25 text-amber-100 ring-amber-500/50"
      : "bg-amber-500/10 text-amber-300/80 ring-amber-500/25 hover:bg-amber-500/15";
  }
  return active
    ? "bg-white/15 text-white ring-white/30"
    : "bg-white/5 text-white/60 ring-white/15 hover:bg-white/10";
}

function statusColor(s: IssueStatus, active: boolean): string {
  if (s === "in_progress") {
    return active
      ? "bg-blue-500/25 text-blue-100 ring-blue-500/50"
      : "bg-blue-500/10 text-blue-300/80 ring-blue-500/25 hover:bg-blue-500/15";
  }
  if (s === "shipped") {
    return active
      ? "bg-emerald-500/25 text-emerald-100 ring-emerald-500/50"
      : "bg-emerald-500/10 text-emerald-300/80 ring-emerald-500/25 hover:bg-emerald-500/15";
  }
  return active
    ? "bg-white/15 text-white ring-white/30"
    : "bg-white/5 text-white/60 ring-white/15 hover:bg-white/10";
}

export function FilterBar({
  actionCounts,
  statusCounts,
  sourceCounts,
  filterActions,
  filterStatuses,
  filterSources,
  sortMode,
  onToggleAction,
  onToggleStatus,
  onToggleSource,
  onSortChange,
  onClear,
  totalVisible,
  totalIssues,
}: {
  actionCounts: Record<Action, number>;
  statusCounts: Record<IssueStatus, number>;
  sourceCounts: Record<Source, number>;
  filterActions: Set<Action>;
  filterStatuses: Set<IssueStatus>;
  filterSources: Set<Source>;
  sortMode: SortMode;
  onToggleAction: (a: Action) => void;
  onToggleStatus: (s: IssueStatus) => void;
  onToggleSource: (s: Source) => void;
  onSortChange: (m: SortMode) => void;
  onClear: () => void;
  totalVisible: number;
  totalIssues: number;
}) {
  const actions: Action[] = ["fix_now", "investigate", "monitor"];
  const statuses: IssueStatus[] = ["backlog", "in_progress", "shipped"];
  const sources: Source[] = ["appstore", "reddit", "hn", "manual"];
  const visibleSources = sources.filter((s) => (sourceCounts[s] ?? 0) > 0 || filterSources.has(s));
  const hasFilters =
    filterActions.size > 0 || filterStatuses.size > 0 || filterSources.size > 0;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-[#0e0e10] px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">
          Action
        </span>
        {actions.map((a) => {
          const active = filterActions.has(a);
          const count = actionCounts[a] ?? 0;
          return (
            <button
              key={a}
              onClick={() => onToggleAction(a)}
              disabled={count === 0 && !active}
              className={`${pillBase} ${actionColor(a, active)} disabled:cursor-not-allowed disabled:opacity-30`}
            >
              {actionLabel(a)} <span className="text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <span className="hidden text-white/15 sm:inline">|</span>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">
          Status
        </span>
        {statuses.map((s) => {
          const active = filterStatuses.has(s);
          const count = statusCounts[s] ?? 0;
          return (
            <button
              key={s}
              onClick={() => onToggleStatus(s)}
              disabled={count === 0 && !active}
              className={`${pillBase} ${statusColor(s, active)} disabled:cursor-not-allowed disabled:opacity-30`}
            >
              {statusLabel(s)} <span className="text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {visibleSources.length > 0 && (
        <>
          <span className="hidden text-white/15 sm:inline">|</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">
              Source
            </span>
            {visibleSources.map((s) => {
              const active = filterSources.has(s);
              const count = sourceCounts[s] ?? 0;
              return (
                <button
                  key={s}
                  onClick={() => onToggleSource(s)}
                  disabled={count === 0 && !active}
                  className={`${pillBase} ${sourceColor(s, active)} disabled:cursor-not-allowed disabled:opacity-30`}
                >
                  {sourceLabel(s)} <span className="text-[10px] opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
          Sort
        </label>
        <select
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
          className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none transition hover:bg-white/10 focus:border-indigo-400/60"
        >
          <option value="priority" className="bg-[#161618]">
            Priority
          </option>
          <option value="frequency" className="bg-[#161618]">
            Frequency
          </option>
          <option value="severity" className="bg-[#161618]">
            Severity
          </option>
        </select>
        {hasFilters && (
          <button
            onClick={onClear}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/70 transition hover:bg-white/10"
          >
            Clear
          </button>
        )}
      </div>

      {hasFilters && (
        <div className="w-full text-[11px] text-white/40">
          Showing <span className="font-semibold text-white/70">{totalVisible}</span> of {totalIssues} clusters
        </div>
      )}
    </div>
  );
}
