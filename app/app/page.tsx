"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, ClipboardCopy, Download, Eye, FileDown, Link2, RotateCcw, SearchX } from "lucide-react";
import { AddMoreComplaints } from "@/components/AddMoreComplaints";
import { AppHeader } from "@/components/AppHeader";
import { ChatPanel } from "@/components/ChatPanel";
import { FilterBar } from "@/components/FilterBar";
import { InputPanel } from "@/components/InputPanel";
import { IssueCard } from "@/components/IssueCard";
import { LoadingStages } from "@/components/LoadingStages";
import { SummaryBar } from "@/components/SummaryBar";
import { TrendsChart } from "@/components/TrendsChart";
import { TrendBadge } from "@/components/Badges";
import {
  countComplaints,
  MAX_ANALYZE_ITEMS,
  orderAnalyzerIssues,
  splitComplaints,
  watchSourceHref,
  carryFeedbackForSignup,
  type SortMode,
} from "@/components/app/analyzer";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import {
  appendHistory,
  clearState,
  clearStatuses,
  loadHistory,
  loadLastSource,
  loadState,
  loadStatuses,
  saveLastSource,
  saveState,
  saveStatuses,
  slugify,
} from "@/lib/storage";
import { buildFullReportMarkdown } from "@/lib/markdown";
import { buildShareUrl, decodeIssuesFromShare } from "@/lib/share";
import type { Action, AnalysisDiff, HistoryEntry, Issue, IssueStatus, PrdStub, Source } from "@/lib/types";
import { pluralize } from "@/lib/utils";

type AnalyzeError = { message: string; limited: boolean };

function toggleIn<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function AnalyzerPage() {
  const [text, setText] = React.useState("");
  const [issues, setIssues] = React.useState<Issue[]>([]);
  const [prdData, setPrdData] = React.useState<Record<number, PrdStub>>({});
  const [statuses, setStatuses] = React.useState<Record<string, IssueStatus>>({});
  const [diff, setDiff] = React.useState<AnalysisDiff | null>(null);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [sourcesByText, setSourcesByText] = React.useState<Record<string, Source>>({});
  const [lastSource, setLastSource] = React.useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analyzingCount, setAnalyzingCount] = React.useState(0);
  const [error, setError] = React.useState<AnalyzeError | null>(null);
  const [restored, setRestored] = React.useState(false);
  const [sharedView, setSharedView] = React.useState(false);
  const [copied, setCopied] = React.useState<"share" | "md" | null>(null);

  const [filterActions, setFilterActions] = React.useState<Set<Action>>(new Set());
  const [filterStatuses, setFilterStatuses] = React.useState<Set<IssueStatus>>(new Set());
  const [filterSources, setFilterSources] = React.useState<Set<Source>>(new Set());
  const [sortMode, setSortMode] = React.useState<SortMode>("priority");

  const resultsHeadingRef = React.useRef<HTMLHeadingElement>(null);

  // Restore from a share link first, then from this browser.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("results");
    if (shared) {
      const decoded = decodeIssuesFromShare(shared);
      if (decoded) {
        setIssues(decoded);
        setSharedView(true);
        setRestored(true);
        return;
      }
    }
    const saved = loadState();
    if (saved && saved.issues.length > 0) {
      setIssues(saved.issues);
      setPrdData(saved.prdData ?? {});
      setDiff(saved.diff ?? null);
      if (saved.text) setText(saved.text);
    }
    setStatuses(loadStatuses());
    setHistory(loadHistory());
    setLastSource(loadLastSource());
    setRestored(true);
  }, []);

  React.useEffect(() => {
    if (!restored || sharedView || issues.length === 0) return;
    saveState({ issues, prdData, diff, text });
  }, [issues, prdData, diff, text, restored, sharedView]);

  React.useEffect(() => {
    if (!restored || sharedView) return;
    saveStatuses(statuses);
  }, [statuses, restored, sharedView]);

  const statusOf = React.useCallback(
    (issue: Issue): IssueStatus => statuses[slugify(issue.title)] ?? "backlog",
    [statuses],
  );

  const actionCounts = React.useMemo(() => {
    const c: Record<Action, number> = { fix_now: 0, investigate: 0, monitor: 0 };
    for (const i of issues) c[i.recommended_action] = (c[i.recommended_action] ?? 0) + 1;
    return c;
  }, [issues]);

  const statusCounts = React.useMemo(() => {
    const c: Record<IssueStatus, number> = { backlog: 0, in_progress: 0, shipped: 0 };
    for (const i of issues) c[statusOf(i)] += 1;
    return c;
  }, [issues, statusOf]);

  const sourceCounts = React.useMemo(() => {
    const c: Partial<Record<Source, number>> = {};
    for (const i of issues) {
      for (const [key, n] of Object.entries(i.source_mix ?? {}) as Array<[Source, number | undefined]>) {
        if ((n ?? 0) > 0) c[key] = (c[key] ?? 0) + 1;
      }
    }
    return c;
  }, [issues]);

  const ordered = React.useMemo(
    () =>
      orderAnalyzerIssues(issues, statusOf, {
        actions: filterActions,
        statuses: filterStatuses,
        sources: filterSources,
        sort: sortMode,
      }),
    [issues, statusOf, filterActions, filterStatuses, filterSources, sortMode],
  );

  const clearFilters = () => {
    setFilterActions(new Set());
    setFilterStatuses(new Set());
    setFilterSources(new Set());
  };

  const clearResultsParam = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("results")) {
      url.searchParams.delete("results");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const tagLines = (lines: string[], source: Source) => {
    setSourcesByText((prev) => {
      const next = { ...prev };
      for (const line of lines) {
        const t = line.trim();
        if (t) next[t] = source;
      }
      return next;
    });
  };

  const runAnalysis = async (complaintsText: string): Promise<boolean> => {
    const lines = splitComplaints(complaintsText).slice(0, MAX_ANALYZE_ITEMS);
    if (lines.length === 0) return false;
    setIsAnalyzing(true);
    setAnalyzingCount(lines.length);
    setError(null);
    setSharedView(false);
    clearResultsParam();
    try {
      const prior = loadHistory()[0];
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaintsTagged: lines.map((t) => ({ text: t, source: sourcesByText[t] ?? ("manual" as Source) })),
          priorIssues: prior?.issues,
          priorRunDate: prior?.timestamp,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        issues?: Issue[];
        diff?: AnalysisDiff | null;
        error?: string;
      };
      if (r.status === 429) {
        setError({ message: "You have used today's free analyses. Create a free account to keep going.", limited: true });
        return false;
      }
      if (!r.ok || !Array.isArray(data.issues)) {
        throw new Error(data.error ?? "The analysis did not finish. Try again in a moment.");
      }
      if (data.issues.length === 0) {
        throw new Error("No issues came back. Add more complaints, one per line, and try again.");
      }
      setIssues(data.issues);
      setPrdData({});
      setDiff(data.diff ?? null);
      appendHistory({ timestamp: new Date().toISOString(), complaintCount: lines.length, issues: data.issues });
      setHistory(loadHistory());
      window.requestAnimationFrame(() => resultsHeadingRef.current?.focus());
      return true;
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "The analysis did not finish.", limited: false });
      return false;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addMoreAndReanalyze = async (more: string) => {
    const extra = more.trim();
    if (!extra) return;
    const combined = text.trim() ? `${text.trim()}\n${extra}` : extra;
    setText(combined);
    const ok = await runAnalysis(combined);
    if (ok) {
      setStatuses({});
      clearStatuses();
      toast.success(`Re-analyzed ${pluralize(countComplaints(combined), "complaint")}. Statuses were reset.`);
    }
  };

  const startOver = () => {
    setIssues([]);
    setPrdData({});
    setStatuses({});
    setDiff(null);
    setError(null);
    setSharedView(false);
    setLastSource(null);
    setText("");
    clearResultsParam();
    clearState();
    clearStatuses();
  };

  const flashCopied = (which: "share" | "md") => {
    setCopied(which);
    window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  };

  const shareResults = async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl(issues));
      flashCopied("share");
      toast.success("Share link copied. It includes the ranked issues, not PRDs or statuses.");
    } catch {
      toast.error("Your browser blocked the clipboard. Copy the link from the address bar instead.");
    }
  };

  const reportMarkdown = () => buildFullReportMarkdown(issues, prdData, statuses, slugify);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportMarkdown());
      flashCopied("md");
      toast.success("Report copied as Markdown");
    } catch {
      toast.error("Your browser blocked the clipboard. Use Download instead.");
    }
  };

  const downloadReport = () => {
    const blob = new Blob([reportMarkdown()], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `buildmonday-report-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    toast.success("Report downloaded");
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

  const hasResults = issues.length > 0;
  const showResults = hasResults && !isAnalyzing;

  const headerActions = hasResults ? (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={shareResults}
        leftIcon={copied === "share" ? <Check aria-hidden /> : <Link2 aria-hidden />}
      >
        {copied === "share" ? "Copied" : "Share"}
      </Button>
      {!sharedView ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={copied === "md" ? <Check aria-hidden /> : <Download aria-hidden />}
              rightIcon={<ChevronDown aria-hidden />}
            >
              {copied === "md" ? "Copied" : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void copyReport()}>
              <ClipboardCopy aria-hidden className="size-4" />
              Copy as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => downloadReport()}>
              <FileDown aria-hidden className="size-4" />
              Download Markdown file
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Button size="sm" variant="secondary" onClick={startOver} leftIcon={<RotateCcw aria-hidden />}>
        {sharedView ? "Run your own" : "Start over"}
      </Button>
    </>
  ) : null;

  return (
    <div className="min-h-dvh bg-canvas">
      <AppHeader actions={headerActions} />
      <main id="main" className="mx-auto w-full max-w-[960px] px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        {!hasResults && !isAnalyzing ? (
          <div className="space-y-6">
            <div className="max-w-[60ch] space-y-2">
              <h1 className="text-balance font-display text-3xl font-semibold text-ink sm:text-4xl">
                Find out what is bothering your users most
              </h1>
              <p className="text-lg text-ink-secondary">
                Paste complaints or fetch reviews from a link. BuildMonday groups them into issues and ranks them by
                how much they hurt, so you know what to fix first.
              </p>
            </div>
            {restored ? (
              <InputPanel
                text={text}
                setText={setText}
                onAnalyze={() => void runAnalysis(text)}
                disabled={isAnalyzing}
                onLinesTagged={tagLines}
                onSourceFetched={(url) => {
                  setLastSource(url);
                  saveLastSource(url);
                }}
              />
            ) : (
              <div aria-hidden className="skeleton h-[380px] rounded-lg" />
            )}
            <p className="text-sm text-ink-muted">
              Free, no account needed. Your text is sent to Google Gemini for analysis and not stored. Results stay
              in this browser. Want it to run on its own?{" "}
              <Link href="/login?next=/onboarding" className="focus-ring rounded-sm font-medium text-brand hover:underline">
                Start free
              </Link>
              .
            </p>
          </div>
        ) : null}

        {isAnalyzing ? <LoadingStages count={analyzingCount} /> : null}

        {error && !isAnalyzing ? (
          <Callout
            tone={error.limited ? "warning" : "danger"}
            title={error.limited ? "Daily limit reached" : "The analysis did not finish"}
            className="mt-6"
            action={
              error.limited ? (
                <Button asChild size="sm" variant="primary">
                  <Link href={watchSourceHref(lastSource)} onClick={() => carryFeedbackForSignup(text)}>
                    Start free
                  </Link>
                </Button>
              ) : (
                <Button size="sm" onClick={() => void runAnalysis(text)} disabled={countComplaints(text) === 0}>
                  Try again
                </Button>
              )
            }
          >
            {error.message}
          </Callout>
        ) : null}

        {showResults ? (
          <div className="space-y-8">
            <div className="flex flex-col gap-1.5">
              <h1
                ref={resultsHeadingRef}
                tabIndex={-1}
                className="font-display text-2xl font-semibold text-ink outline-none sm:text-3xl"
              >
                {sharedView ? "Shared ranked issues" : "Your ranked issues"}
              </h1>
              <p className="max-w-[72ch] text-base text-ink-secondary">
                {pluralize(issues.length, "issue")}, most urgent first. Open one to see what people said, write a PRD
                stub or send it to your tracker.
              </p>
            </div>

            {sharedView ? (
              <Callout
                tone="neutral"
                icon={Eye}
                title="You are viewing a shared analysis"
                action={
                  <Button size="sm" variant="primary" onClick={startOver}>
                    Run your own
                  </Button>
                }
              >
                Statuses and PRDs are not included in share links.
              </Callout>
            ) : null}

            <SummaryBar issues={issues} diff={sharedView ? null : diff} />
            {!sharedView ? <TrendsChart issues={issues} history={history} /> : null}

            <section aria-label="Ranked issues" className="space-y-3">
              <FilterBar
                actionCounts={actionCounts}
                statusCounts={statusCounts}
                sourceCounts={sourceCounts}
                filterActions={filterActions}
                filterStatuses={filterStatuses}
                filterSources={filterSources}
                sortMode={sortMode}
                onToggleAction={(a) => setFilterActions((s) => toggleIn(s, a))}
                onToggleStatus={(s) => setFilterStatuses((p) => toggleIn(p, s))}
                onToggleSource={(s) => setFilterSources((p) => toggleIn(p, s))}
                onSortChange={setSortMode}
                onClear={clearFilters}
                totalVisible={ordered.length}
                totalIssues={issues.length}
              />
              {ordered.length === 0 ? (
                <div className="rounded-lg border border-line bg-surface">
                  <EmptyState
                    icon={SearchX}
                    title="No issues match these filters"
                    description="Clear a filter to see more of the list."
                    action={<Button onClick={clearFilters}>Clear filters</Button>}
                  />
                </div>
              ) : (
                <ul className="animate-fade-in divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
                  {ordered.map(({ issue, originalRank }, i) => (
                    <IssueCard
                      key={`${originalRank}-${issue.title}`}
                      rank={originalRank + 1}
                      issue={issue}
                      prd={prdData[originalRank] ?? null}
                      status={statusOf(issue)}
                      diff={sharedView ? null : (diff?.perIssue[originalRank] ?? null)}
                      onStatusChange={(s) => setIssueStatus(issue.title, s)}
                      onGenerate={(p) => setPrdData((prev) => ({ ...prev, [originalRank]: p }))}
                      defaultOpen={i === 0 && issues.length <= 12}
                      readOnly={sharedView}
                    />
                  ))}
                </ul>
              )}
            </section>

            {!sharedView && diff && diff.resolved.length > 0 ? (
              <section aria-labelledby="resolved-title" className="space-y-3">
                <div>
                  <h2 id="resolved-title" className="font-display text-xl font-semibold text-ink">
                    Resolved since your last analysis
                  </h2>
                  <p className="text-sm text-ink-muted">These issues were in the previous run and did not come up this time.</p>
                </div>
                <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                  {diff.resolved.map((r) => (
                    <li key={r.priorIdx} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <TrendBadge trend="resolved" size="sm" />
                        <span className="truncate text-sm text-ink-secondary">{r.title}</span>
                      </span>
                      <span className="text-xs tabular-nums text-ink-muted">
                        Was {pluralize(r.frequency, "report")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!sharedView ? (
              <Callout
                tone="brand"
                title="Get this list every Monday"
                action={
                  <Button asChild size="sm" variant="primary">
                    <Link href={watchSourceHref(lastSource)} onClick={() => carryFeedbackForSignup(text)}>
                      Start free
                    </Link>
                  </Button>
                }
              >
                {lastSource
                  ? "Sign up free and BuildMonday keeps checking this source on its own, tracks what gets better or worse, and emails you the ranked list. What you pasted here comes with you."
                  : "Sign up free and BuildMonday checks your app reviews, Reddit and Hacker News on its own, tracks what gets better or worse, and emails you the ranked list. What you pasted here comes with you."}
              </Callout>
            ) : null}

            <ChatPanel issues={issues} />

            {!sharedView ? (
              <AddMoreComplaints
                onSubmit={(c) => void addMoreAndReanalyze(c)}
                disabled={isAnalyzing}
                currentCount={countComplaints(text) || undefined}
              />
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
