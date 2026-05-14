"use client";
import { useState } from "react";
import type { IssueDiff, Issue, IssueStatus, PrdStub } from "@/lib/types";
import {
  ActionBadge,
  ChurnBadge,
  EffortBadge,
  FrequencyBadge,
  RankBadge,
  SeverityBadge,
} from "./Badges";
import { DiffBadge } from "./DiffBadge";
import { PrdSection } from "./PrdSection";
import { SendToMenu } from "./SendToMenu";
import { SourceMixBadge } from "./SourceMixBadge";
import { StatusSelector } from "./StatusSelector";
import { prdToMarkdown } from "@/lib/markdown";

export function IssueCard({
  rank,
  issue,
  prd,
  status,
  diff,
  onStatusChange,
  onGenerate,
  onNotify,
}: {
  rank: number;
  issue: Issue;
  prd: PrdStub | null;
  status: IssueStatus;
  diff: IssueDiff | null;
  onStatusChange: (s: IssueStatus) => void;
  onGenerate: (prd: PrdStub) => void;
  onNotify: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPrd, setCopiedPrd] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
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
      if (!r.ok) throw new Error("PRD generation failed");
      const data = (await r.json()) as { prd: PrdStub };
      onGenerate(data.prd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PRD generation failed");
    } finally {
      setLoading(false);
    }
  };

  const copyPrd = async () => {
    if (!prd) return;
    try {
      await navigator.clipboard.writeText(prdToMarkdown(issue, prd));
      setCopiedPrd(true);
      setTimeout(() => setCopiedPrd(false), 1500);
    } catch {
      // ignore
    }
  };

  const articleBase = "rounded-xl border bg-[#111113] p-5 shadow-sm transition-all";
  const statusFrame =
    status === "in_progress"
      ? "border-white/10 border-l-4 border-l-blue-500"
      : status === "shipped"
      ? "border-emerald-500/30 bg-emerald-500/[0.04] opacity-75"
      : "border-white/10";

  return (
    <article className={`${articleBase} ${statusFrame}`}>
      <header className="flex items-start gap-4">
        <RankBadge rank={rank} action={issue.recommended_action} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {status === "shipped" && (
              <span className="inline-flex items-center rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-inset ring-emerald-500/40">
                Shipped
              </span>
            )}
            {diff && <DiffBadge diff={diff} currentFrequency={issue.frequency} />}
          </div>
          <h3 className="mt-1 text-lg font-semibold leading-tight text-white">
            {issue.title}
          </h3>
          {issue.ranking_reason && (
            <p className="mt-1.5 text-xs italic leading-snug text-white/50">
              {issue.ranking_reason}
            </p>
          )}
          <p className="mt-1 text-sm text-white/60">
            Affected: <span className="text-white/80">{issue.affected_segment}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusSelector status={status} onChange={onStatusChange} />
          <ActionBadge value={issue.recommended_action} />
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FrequencyBadge value={issue.frequency} />
        <SeverityBadge value={issue.severity} />
        <ChurnBadge value={issue.churn_risk} />
        <EffortBadge value={issue.effort} />
      </div>

      {issue.source_mix && (
        <div className="mt-2">
          <SourceMixBadge mix={issue.source_mix} />
        </div>
      )}

      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
          Evidence
        </div>
        {issue.evidence.slice(0, 3).map((e, i) => (
          <blockquote
            key={i}
            className="border-l-2 border-white/15 bg-white/[0.02] px-3 py-2 text-sm italic text-white/75"
          >
            “{e}”
          </blockquote>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-md bg-indigo-500/90 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "Generating..." : prd ? "Regenerate PRD" : "Generate PRD →"}
        </button>
        <button
          onClick={copyPrd}
          disabled={!prd}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-40"
        >
          {copiedPrd ? "Copied ✓" : "Copy PRD"}
        </button>
        <SendToMenu
          issue={issue}
          prd={prd}
          status={status}
          onNotify={onNotify}
        />
      </div>

      <PrdSection issue={issue} prd={prd} loading={loading} error={error} />
    </article>
  );
}
