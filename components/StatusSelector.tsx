"use client";
import type { IssueStatus } from "@/lib/types";

const STATES: { value: IssueStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "in_progress", label: "In Progress" },
  { value: "shipped", label: "Shipped" },
];

export function StatusSelector({
  status,
  onChange,
}: {
  status: IssueStatus;
  onChange: (s: IssueStatus) => void;
}) {
  const stylesFor = (v: IssueStatus, active: boolean) => {
    if (!active) return "text-white/40 hover:text-white/70";
    if (v === "backlog") return "bg-white/10 text-white/80 ring-white/15";
    if (v === "in_progress") return "bg-blue-500/20 text-blue-200 ring-blue-500/40";
    return "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40";
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.03] p-0.5">
      {STATES.map((s) => {
        const active = status === s.value;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ring-1 ring-inset transition ${
              active ? stylesFor(s.value, true) : "ring-transparent " + stylesFor(s.value, false)
            }`}
            title={s.label}
          >
            {s.value === "in_progress" && active && (
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-300" />
              </span>
            )}
            {s.value === "shipped" && active && <span aria-hidden>✓</span>}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
