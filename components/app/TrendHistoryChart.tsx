import * as React from "react";
import type { IssueSnapshotDTO } from "@/lib/db/dto";
import { formatDate } from "@/lib/utils";

/** Rounded-up axis maximum with a pleasant step: 4 -> 4, 7 -> 8, 13 -> 15, 42 -> 50. */
export function niceMax(value: number): number {
  if (value <= 4) return Math.max(1, Math.ceil(value));
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * exp >= value) return m * exp;
  }
  return 10 * exp;
}

/**
 * Reports per run for one issue, from its snapshots (oldest first). Plain SVG
 * in currentColor, with a visually hidden table for screen readers.
 */
export function TrendHistoryChart({ snapshots, className }: { snapshots: IssueSnapshotDTO[]; className?: string }) {
  if (snapshots.length === 0) {
    return <p className="text-sm text-ink-muted">The chart appears after the first run that includes this issue.</p>;
  }

  const W = 320;
  const H = 140;
  const pad = { top: 10, right: 8, bottom: 22, left: 28 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(...snapshots.map((s) => s.frequency), 1));
  const n = snapshots.length;
  const x = (i: number) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const points = snapshots.map((s, i) => [x(i), y(s.frequency)] as const);
  const line = points.map(([px, py]) => `${px},${py}`).join(" ");
  const area = n > 1 ? `${pad.left},${pad.top + innerH} ${line} ${x(n - 1)},${pad.top + innerH}` : "";
  const ticks = [0, max / 2, max];

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full text-brand" role="img" aria-label={`Reports per run, ${n} runs`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 3.5} textAnchor="end" className="fill-ink-muted text-[10px] tabular-nums">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {area ? <polygon points={area} fill="currentColor" fillOpacity={0.08} /> : null}
        {n > 1 ? (
          <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {points.map(([px, py], i) => (
          <circle key={snapshots[i].runId} cx={px} cy={py} r={i === n - 1 ? 3.5 : 2.5} fill="currentColor">
            <title>{`${formatDate(snapshots[i].createdAt)}: ${snapshots[i].frequency} reports`}</title>
          </circle>
        ))}
        <text x={pad.left} y={H - 6} className="fill-ink-muted text-[10px]">
          {formatDate(snapshots[0].createdAt)}
        </text>
        {n > 1 ? (
          <text x={W - pad.right} y={H - 6} textAnchor="end" className="fill-ink-muted text-[10px]">
            {formatDate(snapshots[n - 1].createdAt)}
          </text>
        ) : null}
      </svg>
      <table className="sr-only">
        <caption>Reports per run</caption>
        <thead>
          <tr>
            <th scope="col">Run date</th>
            <th scope="col">Reports</th>
            <th scope="col">Priority</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.runId}>
              <td>{formatDate(s.createdAt)}</td>
              <td>{s.frequency}</td>
              <td>{s.priorityScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
