"use client";

import * as React from "react";
import { StageList } from "@/components/app/StageList";
import type { StepState } from "@/components/app/run-stages";
import { pluralize } from "@/lib/utils";

/**
 * Progress for the anonymous analysis. The API answers in one response, so the
 * steps advance on a timer that roughly matches the two model passes, and the
 * last step stays active until the response arrives.
 */
const STAGES = [
  { label: "Reading your complaints", hint: "Splitting the text into individual complaints.", ms: 1400 },
  { label: "Tagging each complaint", hint: "Category, severity, who is affected and churn language.", ms: 5200 },
  { label: "Grouping into issues", hint: "Putting complaints about the same problem together.", ms: 6500 },
  { label: "Ranking by impact", hint: "Weighing frequency, severity, churn risk and effort.", ms: 0 },
];

export function LoadingStages({ count }: { count?: number }) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (index >= STAGES.length - 1) return;
    const t = window.setTimeout(() => setIndex((i) => Math.min(i + 1, STAGES.length - 1)), STAGES[index].ms);
    return () => window.clearTimeout(t);
  }, [index]);

  const steps = STAGES.map((s, i) => ({
    label: s.label,
    hint: s.hint,
    state: (i < index ? "done" : i === index ? "active" : "pending") as StepState,
  }));

  return (
    <section
      aria-labelledby="analysis-progress-title"
      className="grid gap-6 rounded-lg border border-line bg-surface p-5 shadow-xs sm:p-6 md:grid-cols-[minmax(0,280px)_1fr]"
    >
      <div>
        <h2 id="analysis-progress-title" className="font-display text-xl font-semibold text-ink">
          Analyzing{typeof count === "number" && count > 0 ? ` ${pluralize(count, "complaint")}` : ""}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">This usually takes 10 to 20 seconds.</p>
        <StageList steps={steps} className="mt-5" />
        <p aria-live="polite" className="sr-only">
          {STAGES[index].label}
        </p>
      </div>
      <div aria-hidden className="hidden divide-y divide-line overflow-hidden rounded-md border border-line md:block">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <span className="w-8 font-display text-2xl font-semibold tabular-nums text-ink-faint">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-3.5 rounded-sm" style={{ width: `${70 - i * 8}%` }} />
              <div className="skeleton h-3 w-2/5 rounded-sm" />
            </div>
            <div className="flex gap-[3px]">
              {Array.from({ length: 5 }, (_, j) => (
                <span key={j} className="skeleton h-2 w-3 rounded-sm" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
