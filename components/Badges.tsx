import type { Action, ChurnRisk, Effort, Severity } from "@/lib/types";

const base =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

export function SeverityBadge({ value }: { value: Severity }) {
  const cls =
    value === "High"
      ? "bg-red-500/15 text-red-300 ring-red-500/30"
      : value === "Medium"
      ? "bg-yellow-500/15 text-yellow-300 ring-yellow-500/30"
      : "bg-green-500/15 text-green-300 ring-green-500/30";
  return <span className={`${base} ${cls}`}>Severity: {value}</span>;
}

export function ChurnBadge({ value }: { value: ChurnRisk }) {
  const cls =
    value === "High"
      ? "bg-red-500/10 text-red-300 ring-red-500/25"
      : value === "Medium"
      ? "bg-amber-500/10 text-amber-300 ring-amber-500/25"
      : "bg-white/5 text-white/70 ring-white/15";
  return (
    <span
      className={`${base} ${cls} cursor-help`}
      title="Estimated from cancellation and switching intent language in complaints"
    >
      Churn: {value}
    </span>
  );
}

export function EffortBadge({ value }: { value: Effort }) {
  const label = value === "S" ? "S · 1-2 days" : value === "M" ? "M · ~1 week" : "L · multi-sprint";
  return <span className={`${base} bg-white/5 text-white/80 ring-white/15`}>Effort: {label}</span>;
}

export function FrequencyBadge({ value }: { value: number }) {
  return (
    <span className={`${base} bg-indigo-500/15 text-indigo-300 ring-indigo-500/30`}>
      {value} reports
    </span>
  );
}

export function ActionBadge({ value }: { value: Action }) {
  const cls =
    value === "fix_now"
      ? "bg-red-500/20 text-red-200 ring-red-500/40"
      : value === "investigate"
      ? "bg-amber-500/20 text-amber-200 ring-amber-500/40"
      : "bg-white/10 text-white/70 ring-white/20";
  const label = value === "fix_now" ? "Fix Now" : value === "investigate" ? "Investigate" : "Monitor";
  return <span className={`${base} ${cls}`}>{label}</span>;
}

export function RankBadge({ rank, action }: { rank: number; action: Action }) {
  const cls =
    action === "fix_now"
      ? "bg-red-500/20 text-red-200 ring-red-500/40"
      : action === "investigate"
      ? "bg-amber-500/20 text-amber-200 ring-amber-500/40"
      : "bg-white/10 text-white/60 ring-white/20";
  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold ring-1 ring-inset ${cls}`}
    >
      #{rank}
    </span>
  );
}
