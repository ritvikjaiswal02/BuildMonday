"use client";

import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import type { Action, IssueStatus, Source } from "@/lib/types";
import { SOURCES, SOURCE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ACTION_META, ISSUE_STATUS_META } from "@/components/app/labels";
import type { SortMode } from "@/components/app/analyzer";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";

export type { SortMode } from "@/components/app/analyzer";

const ACTIONS: Action[] = ["fix_now", "investigate", "monitor"];
const STATUSES: IssueStatus[] = ["backlog", "in_progress", "shipped"];

/**
 * Filters for the analyzer's ranked list: multi-select menus for action,
 * status and source, a sort select and a clear button.
 */
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
  sourceCounts: Partial<Record<Source, number>>;
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
  const visibleSources = SOURCES.filter((s) => (sourceCounts[s] ?? 0) > 0 || filterSources.has(s));
  const hasFilters = filterActions.size > 0 || filterStatuses.size > 0 || filterSources.size > 0;
  const sortId = React.useId();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter issues">
        <FilterMenu
          label="Action"
          selected={filterActions}
          options={ACTIONS.map((a) => ({ value: a, label: ACTION_META[a].label, count: actionCounts[a] ?? 0 }))}
          onToggle={onToggleAction}
        />
        <FilterMenu
          label="Status"
          selected={filterStatuses}
          options={STATUSES.map((s) => ({ value: s, label: ISSUE_STATUS_META[s].label, count: statusCounts[s] ?? 0 }))}
          onToggle={onToggleStatus}
        />
        {visibleSources.length > 1 || filterSources.size > 0 ? (
          <FilterMenu
            label="Source"
            selected={filterSources}
            options={visibleSources.map((s) => ({ value: s, label: SOURCE_LABELS[s], count: sourceCounts[s] ?? 0 }))}
            onToggle={onToggleSource}
          />
        ) : null}
        {hasFilters ? (
          <Button variant="ghost" size="sm" leftIcon={<X aria-hidden />} onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
        <span aria-live="polite" className={cn("text-sm text-ink-muted", !hasFilters && "sr-only")}>
          Showing {totalVisible} of {totalIssues}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={sortId} className="text-sm text-ink-muted">
          Sort by
        </label>
        <Select
          id={sortId}
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
          className="w-[140px]"
        >
          <option value="priority">Priority</option>
          <option value="frequency">Reports</option>
          <option value="severity">Severity</option>
        </Select>
      </div>
    </div>
  );
}

function FilterMenu<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Array<{ value: T; label: string; count: number }>;
  selected: Set<T>;
  onToggle: (value: T) => void;
}) {
  const active = selected.size;
  const summary =
    active === 0
      ? null
      : active === 1
        ? options.find((o) => selected.has(o.value))?.label
        : `${active} selected`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "focus-ring inline-flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors duration-120",
          active > 0
            ? "border-brand/40 bg-brand-soft text-brand-ink"
            : "border-line-strong bg-surface text-ink-secondary hover:bg-sunken hover:text-ink",
        )}
      >
        <span>{label}</span>
        {summary ? <span className="font-medium">: {summary}</span> : null}
        <ChevronDown aria-hidden className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.has(o.value)}
            disabled={o.count === 0 && !selected.has(o.value)}
            onCheckedChange={() => onToggle(o.value)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="flex-1">{o.label}</span>
            <span className="ml-3 text-xs tabular-nums text-ink-muted">{o.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
