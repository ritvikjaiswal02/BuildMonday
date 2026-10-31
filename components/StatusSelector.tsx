"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import type { IssueWorkflowStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { ISSUE_STATUS_META } from "@/components/app/labels";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";

const DOT: Record<IssueWorkflowStatus, string> = {
  backlog: "bg-ink-faint",
  in_progress: "bg-brand",
  shipped: "bg-success",
  ignored: "border border-ink-faint bg-transparent",
};

/**
 * Compact status picker shared by the analyzer (three states, stored locally)
 * and app pages (four states, saved through the API).
 */
export function StatusSelector<S extends IssueWorkflowStatus>({
  status,
  onChange,
  options,
  disabled,
  pending,
  className,
  label = "Status",
}: {
  status: S;
  onChange: (s: S) => void;
  options?: S[];
  disabled?: boolean;
  /** Shows the trigger as busy while a save is in flight. */
  pending?: boolean;
  className?: string;
  label?: string;
}) {
  const list = options ?? (["backlog", "in_progress", "shipped"] as S[]);
  const meta = ISSUE_STATUS_META[status];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`${label}: ${meta.label}. Change status`}
        aria-busy={pending || undefined}
        className={cn(
          "focus-ring inline-flex h-[30px] shrink-0 items-center gap-2 rounded-md border border-line-strong bg-surface pl-2.5 pr-2 text-sm text-ink",
          "transition-colors duration-120 hover:bg-sunken disabled:pointer-events-none disabled:opacity-50",
          pending && "opacity-70",
          status === "ignored" && "text-ink-muted",
          className,
        )}
      >
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[status])} />
        <span className="whitespace-nowrap">{meta.label}</span>
        <ChevronDown aria-hidden className="size-3.5 text-ink-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {list.map((value) => {
          const m = ISSUE_STATUS_META[value];
          const selected = value === status;
          return (
            <DropdownMenuItem key={value} onSelect={() => (selected ? undefined : onChange(value))}>
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[value])} />
              <span className="flex-1">{m.label}</span>
              {selected ? <Check aria-hidden className="size-4 text-brand" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
