"use client";

import * as React from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import type { HistoryEntry, Issue } from "@/lib/types";
import { Sparkline } from "@/components/ui/sparkline";
import { cn, formatDate } from "@/lib/utils";

const MATCH_THRESHOLD = 0.35;
const MAX_TRACKED = 6;

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

export interface TrackedCluster {
  title: string;
  series: Array<{ timestamp: string; frequency: number }>;
}

/**
 * Follows the current top issues back through earlier analyses in this
 * browser, matching by title similarity. Missing points count as 0.
 */
export function buildTrackedClusters(current: Issue[], history: HistoryEntry[]): TrackedCluster[] {
  const ordered = [...history].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (ordered.length === 0) return [];
  return current.slice(0, MAX_TRACKED).map((issue) => {
    const tokens = tokenize(issue.title);
    const series = ordered.map((h) => {
      let bestSim = 0;
      let bestFreq = 0;
      for (const prior of h.issues) {
        const sim = jaccard(tokens, tokenize(prior.title));
        if (sim > bestSim) {
          bestSim = sim;
          bestFreq = prior.frequency ?? 0;
        }
      }
      return { timestamp: h.timestamp, frequency: bestSim >= MATCH_THRESHOLD ? bestFreq : 0 };
    });
    return { title: issue.title, series };
  });
}

/** Collapsible sparkline table of how the top issues moved across analyses in this browser. */
export function TrendsChart({ issues, history }: { issues: Issue[]; history: HistoryEntry[] }) {
  const [open, setOpen] = React.useState(false);
  const tracked = React.useMemo(() => buildTrackedClusters(issues, history), [issues, history]);
  const ordered = React.useMemo(
    () => [...history].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [history],
  );
  const panelId = React.useId();

  if (history.length < 2 || tracked.length === 0) return null;

  return (
    <section className="rounded-lg border border-line bg-surface shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="focus-ring flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors duration-120 hover:bg-sunken"
      >
        <TrendingUp aria-hidden className="size-4 text-ink-muted" />
        <span className="flex-1 text-sm font-medium text-ink">
          How the top issues moved across your last {ordered.length} analyses
        </span>
        <ChevronDown aria-hidden className={cn("size-4 text-ink-muted transition-transform duration-180", open && "rotate-180")} />
      </button>
      <div id={panelId} hidden={!open} className="border-t border-line px-4 py-3">
        <div className="mb-2 flex justify-between text-xs text-ink-muted">
          <span>{formatDate(ordered[0].timestamp)}</span>
          <span>{formatDate(ordered[ordered.length - 1].timestamp)}</span>
        </div>
        <ul className="divide-y divide-line">
          {tracked.map((t) => {
            const first = t.series[0]?.frequency ?? 0;
            const last = t.series[t.series.length - 1]?.frequency ?? 0;
            const delta = last - first;
            const tone = delta > 0 ? "text-danger" : delta < 0 ? "text-success" : "text-ink-muted";
            return (
              <li key={t.title} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary" title={t.title}>
                  {t.title}
                </span>
                <Sparkline
                  values={t.series.map((s) => s.frequency)}
                  width={96}
                  height={22}
                  className={tone}
                  aria-label={`Reports per analysis for ${t.title}: ${t.series.map((s) => s.frequency).join(", ")}`}
                />
                <span className={cn("w-10 text-right text-xs font-medium tabular-nums", tone)}>
                  {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "0"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">
          Issues are matched across analyses by title. Saved in this browser only.
        </p>
      </div>
    </section>
  );
}
