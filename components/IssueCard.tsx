"use client";

import * as React from "react";
import { ChevronDown, FileText, Users } from "lucide-react";
import type { IssueDiff, Issue, IssueStatus, PrdStub } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PriorityMeter } from "@/components/ui/meter";
import { RankNumber } from "@/components/ui/week-strip";
import { ActionBadge, ChurnBadge, EffortBadge, SeverityBadge } from "./Badges";
import { DiffBadge } from "./DiffBadge";
import { PrdSection } from "./PrdSection";
import { SendToMenu } from "./SendToMenu";
import { SourceMixBadge } from "./SourceMixBadge";
import { StatusSelector } from "./StatusSelector";

/**
 * One ranked issue in the anonymous analyzer: a list row that expands to show
 * evidence, the PRD and the send-to actions. Render inside a `divide-y` list.
 */
export function IssueCard({
  rank,
  issue,
  prd,
  status,
  diff,
  onStatusChange,
  onGenerate,
  onNotify,
  defaultOpen = false,
  readOnly = false,
}: {
  rank: number;
  issue: Issue;
  prd: PrdStub | null;
  status: IssueStatus;
  diff: IssueDiff | null;
  onStatusChange: (s: IssueStatus) => void;
  onGenerate: (prd: PrdStub) => void;
  onNotify?: (msg: string) => void;
  defaultOpen?: boolean;
  /** Shared views cannot change status or generate PRDs. */
  readOnly?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const panelId = React.useId();
  const shipped = status === "shipped";

  const generate = async () => {
    setLoading(true);
    setError(null);
    setOpen(true);
    try {
      const r = await fetch("/api/prd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issue.title,
          evidence: issue.evidence,
          affected_segment: issue.affected_segment,
          severity: issue.severity,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { prd?: PrdStub; error?: string };
      if (!r.ok || !data.prd) {
        throw new Error(
          r.status === 429
            ? "You have used today's free PRDs. Create a free account to keep going."
            : (data.error ?? "The PRD could not be generated. Try again."),
        );
      }
      onGenerate(data.prd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The PRD could not be generated. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className={cn("bg-surface", shipped && "bg-canvas")}>
      <div className="flex gap-3 px-4 py-4 sm:gap-4 sm:px-5">
        <RankNumber rank={rank} className={cn("pt-0.5", shipped && "text-ink-faint")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h3 className={cn("text-base font-medium leading-6 text-ink", shipped && "text-ink-muted line-through decoration-ink-faint")}>
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  className="focus-ring rounded-sm text-left hover:text-brand"
                >
                  {issue.title}
                </button>
              </h3>
              {issue.ranking_reason ? (
                <p className={cn("mt-0.5 text-sm text-ink-muted", !open && "line-clamp-2")}>{issue.ranking_reason}</p>
              ) : null}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <ActionBadge value={issue.recommended_action} size="sm" />
                {diff ? <DiffBadge diff={diff} currentFrequency={issue.frequency} size="sm" /> : null}
                <SeverityBadge value={issue.severity} size="sm" />
                <ChurnBadge value={issue.churn_risk} size="sm" />
                <EffortBadge value={issue.effort} size="sm" />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4 md:flex-col md:items-end md:gap-2">
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums text-ink-secondary">{pluralize(issue.frequency, "report")}</span>
                <PriorityMeter score={issue.priority_score} />
              </div>
              {readOnly ? null : <StatusSelector status={status} onChange={onStatusChange} />}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={panelId}
              rightIcon={<ChevronDown aria-hidden className={cn("transition-transform duration-180", open && "rotate-180")} />}
              className="-ml-2.5"
            >
              {open ? "Hide details" : "Evidence and actions"}
            </Button>
          </div>

          <div id={panelId} hidden={!open} className="mt-3 space-y-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <section aria-label="Evidence">
                <h4 className="text-xs font-medium text-ink-muted">What people said</h4>
                <ul className="mt-2 space-y-2">
                  {issue.evidence.slice(0, 3).map((quote, i) => (
                    <li key={i}>
                      <blockquote className="border-l-2 border-line-strong pl-3 text-sm text-ink-secondary">
                        {quote}
                      </blockquote>
                    </li>
                  ))}
                </ul>
              </section>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                    <Users aria-hidden className="size-3.5" /> Who is affected
                  </dt>
                  <dd className="mt-0.5 text-ink-secondary">{issue.affected_segment || "Not specified"}</dd>
                </div>
                {issue.source_mix && Object.keys(issue.source_mix).length > 0 ? (
                  <div>
                    <dt className="text-xs font-medium text-ink-muted">Where it came from</dt>
                    <dd className="mt-1">
                      <SourceMixBadge mix={issue.source_mix} />
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-medium text-ink-muted">Priority</dt>
                  <dd className="mt-0.5 tabular-nums text-ink-secondary">{issue.priority_score} of 100</dd>
                </div>
              </dl>
            </div>

            {!readOnly ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={prd ? "secondary" : "primary"}
                  leftIcon={<FileText aria-hidden />}
                  onClick={generate}
                  loading={loading}
                >
                  {prd ? "Regenerate PRD" : "Write a PRD stub"}
                </Button>
                <SendToMenu issue={issue} prd={prd} status={status} onNotify={onNotify} />
              </div>
            ) : null}

            <PrdSection issue={issue} prd={prd} loading={loading} error={error} />
          </div>
        </div>
      </div>
    </li>
  );
}
