"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import type { IssueDTO } from "@/lib/db/dto";
import type { IssueWorkflowStatus } from "@/lib/db/schema";
import { cn, pluralize } from "@/lib/utils";
import { PriorityMeter } from "@/components/ui/meter";
import { Sparkline } from "@/components/ui/sparkline";
import { RankNumber } from "@/components/ui/week-strip";
import { toast } from "@/components/ui/toast";
import { ActionBadge, TrendBadge } from "@/components/Badges";
import { StatusSelector } from "@/components/StatusSelector";
import { apiFetch } from "./api";
import { ISSUE_STATUS_META, ISSUE_STATUS_ORDER } from "./labels";
import { useApiErrorHandler } from "./use-api-error";

export interface IssueListItem {
  issue: IssueDTO;
  /** Frequency per run, oldest first. */
  history: number[];
  /** New feedback matched to this issue since the last run. */
  pending?: number;
}

/**
 * The ranked list used on the dashboard and the issues page: rank, title and
 * reason, trend, reports with a sparkline, priority meter and status. Rows
 * reorder with a layout animation when a finished run changes the ranking.
 */
export function IssueList({
  items,
  showStatus = true,
  showFiled = false,
  showCompetitor = false,
  rankFallback = "index",
  className,
  "aria-label": ariaLabel = "Issues",
}: {
  items: IssueListItem[];
  showStatus?: boolean;
  showFiled?: boolean;
  showCompetitor?: boolean;
  /** For lists without stored ranks (competitors), number rows by position. */
  rankFallback?: "index" | "none";
  className?: string;
  "aria-label"?: string;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const { handle, dialog } = useApiErrorHandler();
  const [overrides, setOverrides] = React.useState<Record<string, IssueWorkflowStatus>>({});
  const [pending, setPending] = React.useState<Record<string, boolean>>({});

  // Server data wins once it reflects the change.
  React.useEffect(() => {
    setOverrides((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const { issue } of items) {
        if (next[issue.id] && next[issue.id] === issue.status) {
          delete next[issue.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  const changeStatus = async (issue: IssueDTO, status: IssueWorkflowStatus) => {
    const previous = overrides[issue.id] ?? issue.status;
    setOverrides((o) => ({ ...o, [issue.id]: status }));
    setPending((p) => ({ ...p, [issue.id]: true }));
    try {
      await apiFetch(`/api/issues/${encodeURIComponent(issue.id)}`, { method: "PATCH", json: { status } });
      toast.success(`Marked "${issue.title}" as ${ISSUE_STATUS_META[status].label.toLowerCase()}`);
      router.refresh();
    } catch (err) {
      setOverrides((o) => ({ ...o, [issue.id]: previous }));
      handle(err, "The status could not be saved.");
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[issue.id];
        return next;
      });
    }
  };

  return (
    <>
      <ol
        aria-label={ariaLabel}
        className={cn("divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-xs", className)}
      >
        {items.map(({ issue, history, pending: matched = 0 }, index) => {
          const status = overrides[issue.id] ?? issue.status;
          const rank = issue.rank ?? (rankFallback === "index" ? index + 1 : null);
          const muted = status === "shipped" || status === "ignored" || issue.trend === "resolved";
          return (
            <motion.li
              key={issue.id}
              layout={reduce ? false : "position"}
              transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
              className="relative bg-surface transition-colors duration-120 ease-standard hover:bg-sunken/50"
            >
              <div className="flex gap-3 px-4 py-3.5 sm:gap-4 sm:px-5">
                <RankNumber rank={rank} className={cn("pt-0.5", muted && "text-ink-faint")} />
                <div className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6">
                  <div className="min-w-0">
                    <Link
                      href={`/issues/${issue.id}`}
                      className={cn(
                        "focus-ring rounded-sm text-base font-medium leading-6 text-ink hover:text-brand",
                        "after:absolute after:inset-0 after:content-['']",
                        muted && "text-ink-secondary",
                      )}
                    >
                      {issue.title}
                    </Link>
                    {issue.rankingReason ? (
                      <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{issue.rankingReason}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <TrendBadge trend={issue.trend} size="sm" hidePersistent />
                      <ActionBadge value={issue.recommendedAction} size="sm" />
                      {showCompetitor && issue.competitorName ? (
                        <span className="text-xs text-ink-muted">{issue.competitorName}</span>
                      ) : null}
                      {matched > 0 ? (
                        <span className="text-xs font-medium text-brand-ink">
                          +{matched} new since the last run
                        </span>
                      ) : null}
                      {showFiled && issue.externalUrl ? (
                        <a
                          href={issue.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring relative z-[1] inline-flex items-center gap-1 rounded-sm text-xs font-medium text-brand hover:underline"
                        >
                          <ExternalLink aria-hidden className="size-3" />
                          Filed in {issue.externalTarget === "github" ? "GitHub" : "Linear"}
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 md:mt-0 md:flex-nowrap">
                    <div className="flex items-center gap-2">
                      {history.length > 1 ? (
                        <Sparkline
                          values={history}
                          width={56}
                          height={18}
                          className={issue.trend === "worsened" ? "text-danger" : "text-brand"}
                          aria-label={`Reports per run: ${history.join(", ")}`}
                        />
                      ) : null}
                      <span className="w-[86px] text-sm tabular-nums text-ink-secondary">
                        {pluralize(issue.frequency, "report")}
                      </span>
                    </div>
                    <PriorityMeter score={issue.priorityScore} />
                    {showStatus ? (
                      <div className="relative z-[1]">
                        <StatusSelector
                          status={status}
                          options={ISSUE_STATUS_ORDER}
                          pending={!!pending[issue.id]}
                          onChange={(s) => void changeStatus(issue, s)}
                          label={`Status of ${issue.title}`}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ol>
      {dialog}
    </>
  );
}
