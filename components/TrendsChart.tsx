"use client";
import { useMemo, useState } from "react";
import type { HistoryEntry, Issue } from "@/lib/types";

const MATCH_THRESHOLD = 0.35;
const MAX_TRACKED = 6;

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface TrackedCluster {
  title: string;
  series: Array<{ timestamp: string; frequency: number }>;
  currentFreq: number;
}

function buildTrackedClusters(
  current: Issue[],
  history: HistoryEntry[]
): TrackedCluster[] {
  const orderedHistory = [...history].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
  if (orderedHistory.length === 0) return [];

  return current.slice(0, MAX_TRACKED).map((issue) => {
    const tokens = tokenize(issue.title);
    const series = orderedHistory.map((h) => {
      let bestSim = 0;
      let bestFreq = 0;
      for (const prior of h.issues) {
        const sim = jaccard(tokens, tokenize(prior.title));
        if (sim > bestSim) {
          bestSim = sim;
          bestFreq = prior.frequency ?? 0;
        }
      }
      const freq = bestSim >= MATCH_THRESHOLD ? bestFreq : 0;
      return { timestamp: h.timestamp, frequency: freq };
    });
    return {
      title: issue.title,
      series,
      currentFreq: issue.frequency ?? 0,
    };
  });
}

function Sparkline({ values }: { values: number[] }) {
  const w = 140;
  const h = 28;
  const pad = 2;
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const lastX = pad + (values.length - 1) * step;
  const lastY = h - pad - (values[values.length - 1] / max) * (h - pad * 2);
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const trendColor =
    last > first
      ? "stroke-red-400"
      : last < first
      ? "stroke-emerald-400"
      : "stroke-white/50";
  const dotColor =
    last > first
      ? "fill-red-400"
      : last < first
      ? "fill-emerald-400"
      : "fill-white/60";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline
        fill="none"
        strokeWidth={1.5}
        className={trendColor}
        points={points}
      />
      <circle cx={lastX} cy={lastY} r={2.5} className={dotColor} />
    </svg>
  );
}

export function TrendsChart({
  issues,
  history,
}: {
  issues: Issue[];
  history: HistoryEntry[];
}) {
  const [open, setOpen] = useState(false);
  const tracked = useMemo(() => buildTrackedClusters(issues, history), [issues, history]);
  const orderedHistory = useMemo(
    () => [...history].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [history]
  );

  if (history.length < 2 || tracked.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-[#0e0e10]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-white/[0.03]"
      >
        <span className="flex items-center gap-2 font-medium text-white/85">
          <span className="text-base">↗</span>
          Trends across {orderedHistory.length} runs
        </span>
        <span className="text-xs text-white/40">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-white/5 px-4 py-3">
          <div className="mb-2 flex justify-between text-[10px] uppercase tracking-wide text-white/30">
            <span>{formatDate(orderedHistory[0].timestamp)}</span>
            <span>{formatDate(orderedHistory[orderedHistory.length - 1].timestamp)}</span>
          </div>
          <ul className="space-y-2">
            {tracked.map((t) => {
              const first = t.series[0]?.frequency ?? 0;
              const last = t.series[t.series.length - 1]?.frequency ?? 0;
              const delta = last - first;
              const deltaLabel =
                delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "·";
              const deltaCls =
                delta > 0
                  ? "text-red-300"
                  : delta < 0
                  ? "text-emerald-300"
                  : "text-white/40";
              return (
                <li
                  key={t.title}
                  className="flex items-center gap-3 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-white/85" title={t.title}>
                    {t.title}
                  </span>
                  <Sparkline values={t.series.map((s) => s.frequency)} />
                  <span className={`w-10 text-right text-xs font-semibold ${deltaCls}`}>
                    {deltaLabel}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[10px] leading-snug text-white/30">
            Clusters matched across runs by title similarity (Jaccard ≥ {MATCH_THRESHOLD}).
            Missing data points are shown as 0.
          </p>
        </div>
      )}
    </div>
  );
}
