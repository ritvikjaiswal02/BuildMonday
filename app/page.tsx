"use client";
import { useEffect, useMemo, useState } from "react";
import { AddMoreComplaints } from "@/components/AddMoreComplaints";
import { ChatPanel } from "@/components/ChatPanel";
import { FilterBar, type SortMode } from "@/components/FilterBar";
import { InputPanel } from "@/components/InputPanel";
import { IssueCard } from "@/components/IssueCard";
import { LoadingStages } from "@/components/LoadingStages";
import { SummaryBar } from "@/components/SummaryBar";
import { TrendsChart } from "@/components/TrendsChart";
import {
  appendHistory,
  clearState,
  clearStatuses,
  loadHistory,
  loadState,
  loadStatuses,
  saveState,
  saveStatuses,
  slugify,
} from "@/lib/storage";
import { buildFullReportMarkdown } from "@/lib/markdown";
import { buildShareUrl, decodeIssuesFromShare } from "@/lib/share";
import type {
  Action,
  AnalysisDiff,
  HistoryEntry,
  Issue,
  IssueStatus,
  PrdStub,
  Source,
} from "@/lib/types";

const SEVERITY_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

export default function HomePage() {
  const [text, setText] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [prdData, setPrdData] = useState<Record<number, PrdStub>>({});
  const [statuses, setStatuses] = useState<Record<string, IssueStatus>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sharedView, setSharedView] = useState(false);
  const [diff, setDiff] = useState<AnalysisDiff | null>(null);
  const [filterActions, setFilterActions] = useState<Set<Action>>(new Set());
  const [filterStatuses, setFilterStatuses] = useState<Set<IssueStatus>>(new Set());
  const [filterSources, setFilterSources] = useState<Set<Source>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [sourcesByText, setSourcesByText] = useState<Record<string, Source>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("results");
    if (r) {
      const decoded = decodeIssuesFromShare(r);
      if (decoded && decoded.length > 0) {
        setIssues(decoded);
        setSharedView(true);
        setRestored(true);
        return;
      }
    }
    const s = loadState();
    if (s) {
      setIssues(s.issues ?? []);
      setPrdData(s.prdData ?? {});
    }
    setStatuses(loadStatuses());
    setHistory(loadHistory());
    setRestored(true);
  }, []);

  const clearResultsParam = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("results")) {
      url.searchParams.delete("results");
      window.history.replaceState({}, "", url.toString());
    }
  };

  useEffect(() => {
    if (!restored) return;
    if (sharedView) return;
    if (issues.length > 0) saveState({ issues, prdData });
  }, [issues, prdData, restored, sharedView]);

  useEffect(() => {
    if (!restored) return;
    if (sharedView) return;
    saveStatuses(statuses);
  }, [statuses, restored, sharedView]);

  const actionCounts = useMemo(() => {
    const c: Record<Action, number> = { fix_now: 0, investigate: 0, monitor: 0 };
    for (const i of issues) c[i.recommended_action] = (c[i.recommended_action] ?? 0) + 1;
    return c;
  }, [issues]);

  const statusCounts = useMemo(() => {
    const c: Record<IssueStatus, number> = { backlog: 0, in_progress: 0, shipped: 0 };
    for (const i of issues) {
      const s = statuses[slugify(i.title)] ?? "backlog";
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [issues, statuses]);

  const sourceCounts = useMemo(() => {
    const c: Record<Source, number> = { appstore: 0, reddit: 0, hn: 0, manual: 0 };
    for (const i of issues) {
      if (!i.source_mix) continue;
      for (const key of Object.keys(i.source_mix) as Source[]) {
        if ((i.source_mix[key] ?? 0) > 0) c[key] = (c[key] ?? 0) + 1;
      }
    }
    return c;
  }, [issues]);

  const orderedIssues = useMemo(() => {
    const filtered = issues
      .map((issue, originalRank) => ({ issue, originalRank }))
      .filter(({ issue }) => {
        if (filterActions.size > 0 && !filterActions.has(issue.recommended_action)) return false;
        if (filterStatuses.size > 0) {
          const s = statuses[slugify(issue.title)] ?? "backlog";
          if (!filterStatuses.has(s)) return false;
        }
        if (filterSources.size > 0) {
          const mix = issue.source_mix ?? {};
          let any = false;
          for (const src of filterSources) {
            if ((mix[src] ?? 0) > 0) { any = true; break; }
          }
          if (!any) return false;
        }
        return true;
      });
    return filtered.sort((a, b) => {
      const aShipped = statuses[slugify(a.issue.title)] === "shipped" ? 1 : 0;
      const bShipped = statuses[slugify(b.issue.title)] === "shipped" ? 1 : 0;
      if (aShipped !== bShipped) return aShipped - bShipped;
      if (sortMode === "frequency") {
        const d = (b.issue.frequency ?? 0) - (a.issue.frequency ?? 0);
        if (d !== 0) return d;
      } else if (sortMode === "severity") {
        const d = (SEVERITY_RANK[b.issue.severity] ?? 0) - (SEVERITY_RANK[a.issue.severity] ?? 0);
        if (d !== 0) return d;
      }
      return a.originalRank - b.originalRank;
    });
  }, [issues, statuses, filterActions, filterStatuses, filterSources, sortMode]);

  const toggleAction = (a: Action) => {
    setFilterActions((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  };

  const toggleStatus = (s: IssueStatus) => {
    setFilterStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleSource = (s: Source) => {
    setFilterSources((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const clearFilters = () => {
    setFilterActions(new Set());
    setFilterStatuses(new Set());
    setFilterSources(new Set());
  };

  const tagLines = (lines: string[], source: Source) => {
    setSourcesByText((prev) => {
      const next = { ...prev };
      for (const line of lines) {
        const t = line.trim();
        if (t.length > 0) next[t] = source;
      }
      return next;
    });
  };

  const runAnalysis = async (complaintsText: string): Promise<boolean> => {
    setIsAnalyzing(true);
    setError(null);
    setSharedView(false);
    setDiff(null);
    clearResultsParam();
    try {
      const history = loadHistory();
      const prior = history[0];
      const complaintsTagged = complaintsText
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((text) => ({ text, source: sourcesByText[text] ?? ("manual" as Source) }));
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaintsTagged,
          priorIssues: prior?.issues,
          priorRunDate: prior?.timestamp,
        }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Analysis failed");
      }
      const data = (await r.json()) as { issues: Issue[]; diff?: AnalysisDiff | null };
      setIssues(data.issues);
      setPrdData({});
      setDiff(data.diff ?? null);
      const complaintCount = complaintsText
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0).length;
      appendHistory({
        timestamp: new Date().toISOString(),
        complaintCount,
        issues: data.issues,
      });
      setHistory(loadHistory());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      return false;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyze = () => {
    void runAnalysis(text);
  };

  const addMoreAndReanalyze = async (newComplaints: string) => {
    const trimmedNew = newComplaints.trim();
    if (!trimmedNew) return;
    const combined = text.trim()
      ? `${text.trim()}\n${trimmedNew}`
      : trimmedNew;
    setText(combined);
    setStatuses({});
    clearStatuses();
    const total = combined
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0).length;
    const ok = await runAnalysis(combined);
    if (ok) showToast(`Re-analyzed with ${total} total complaints · statuses reset`);
  };

  const startOver = () => {
    setIssues([]);
    setPrdData({});
    setStatuses({});
    setError(null);
    setSharedView(false);
    clearResultsParam();
    clearState();
    clearStatuses();
  };

  const shareResults = async () => {
    if (issues.length === 0) return;
    const url = buildShareUrl(issues);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied to clipboard");
    } catch {
      showToast("Copy failed — copy URL manually from address bar");
    }
  };

  const setIssueStatus = (title: string, status: IssueStatus) => {
    const key = slugify(title);
    setStatuses((prev) => {
      const next = { ...prev };
      if (status === "backlog") delete next[key];
      else next[key] = status;
      return next;
    });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const exportMarkdown = () =>
    buildFullReportMarkdown(issues, prdData, statuses, slugify);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(exportMarkdown());
      showToast("Report copied to clipboard");
    } catch {
      showToast("Copy failed — try Download instead");
    }
  };

  const downloadReport = () => {
    const md = exportMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buildmonday-report-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Report downloaded");
  };

  const hasResults = issues.length > 0;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:py-16">
      {!hasResults ? (
        <InputPanel
          text={text}
          setText={setText}
          onAnalyze={analyze}
          disabled={isAnalyzing}
          onLinesTagged={tagLines}
        />
      ) : (
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Ranked engineering issues</h1>
            <p className="mt-1 text-sm text-white/60">
              {issues.length} clusters · sorted by priority
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={shareResults}
              className="rounded-md border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/25"
              title="Copy a link that loads this analysis (no PRDs included)"
            >
              Share Results
            </button>
            <button
              onClick={copyReport}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
              title="Copy full report (issues + PRDs) as Markdown"
            >
              Copy Report
            </button>
            <button
              onClick={downloadReport}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
              title="Download full report as .md file"
            >
              Download .md
            </button>
            <button
              onClick={startOver}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
            >
              {sharedView ? "Run your own →" : "← Start over"}
            </button>
          </div>
        </div>
      )}

      {sharedView && hasResults && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">
          <span>
            Viewing shared analysis · <span className="font-semibold">{issues.length}</span> issues · PRDs not included
          </span>
          <button
            onClick={startOver}
            className="rounded-md border border-indigo-400/40 bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500/30"
          >
            Run your own →
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-100 shadow-lg backdrop-blur">
          {toast}
        </div>
      )}

      {isAnalyzing && (
        <div className="mt-8">
          <LoadingStages />
        </div>
      )}

      {error && !isAnalyzing && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {hasResults && (
        <>
          <SummaryBar issues={issues} diff={diff} />
          {!sharedView && <TrendsChart issues={issues} history={history} />}
          <FilterBar
            actionCounts={actionCounts}
            statusCounts={statusCounts}
            sourceCounts={sourceCounts}
            filterActions={filterActions}
            filterStatuses={filterStatuses}
            filterSources={filterSources}
            sortMode={sortMode}
            onToggleAction={toggleAction}
            onToggleStatus={toggleStatus}
            onToggleSource={toggleSource}
            onSortChange={setSortMode}
            onClear={clearFilters}
            totalVisible={orderedIssues.length}
            totalIssues={issues.length}
          />
          {orderedIssues.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-[#0e0e10] px-4 py-6 text-center text-sm text-white/50">
              No clusters match the current filters.{" "}
              <button
                onClick={clearFilters}
                className="font-semibold text-indigo-300 underline-offset-2 hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
          <div className="space-y-4">
            {orderedIssues.map(({ issue, originalRank }) => (
              <IssueCard
                key={originalRank}
                rank={originalRank + 1}
                issue={issue}
                prd={prdData[originalRank] ?? null}
                status={statuses[slugify(issue.title)] ?? "backlog"}
                diff={diff?.perIssue[originalRank] ?? null}
                onStatusChange={(s) => setIssueStatus(issue.title, s)}
                onGenerate={(p) =>
                  setPrdData((prev) => ({ ...prev, [originalRank]: p }))
                }
                onNotify={showToast}
              />
            ))}
          </div>
          {diff && diff.resolved.length > 0 && (
            <div className="mt-6 rounded-xl border border-white/10 bg-[#0e0e10] px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Resolved since last run
              </div>
              <p className="mt-1 text-xs text-white/40">
                Clusters from the previous analysis that did not reappear this time.
              </p>
              <ul className="mt-3 space-y-1.5">
                {diff.resolved.map((r) => (
                  <li
                    key={r.priorIdx}
                    className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                  >
                    <span className="text-white/80">{r.title}</span>
                    <span className="shrink-0 text-xs text-white/40">
                      was {r.frequency} complaint{r.frequency === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ChatPanel issues={issues} />
          {!sharedView && (
            <AddMoreComplaints
              onSubmit={(c) => void addMoreAndReanalyze(c)}
              disabled={isAnalyzing}
            />
          )}
        </>
      )}

      <footer className="mt-12 text-center text-xs text-white/30">
        BuildMonday · Founders already know customers are unhappy. The hard part is deciding what
        engineering should build Monday morning.
      </footer>
    </main>
  );
}
