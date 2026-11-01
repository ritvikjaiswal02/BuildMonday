"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PriorityMeter } from "@/components/ui/meter";
import { RankNumber, WeekStrip } from "@/components/ui/week-strip";
import { SourceGlyph, sourceKindLabel } from "@/components/brand/logos";
import { cn, formatNumber } from "@/lib/utils";
import {
  EXAMPLE_ARRIVAL_ORDER,
  EXAMPLE_ISSUES,
  EXAMPLE_PRODUCT,
  EXAMPLE_WEEK,
  EXAMPLE_WEEK_TOTAL,
  type ExampleIssue,
} from "./example-data";
import { TrendBadge } from "./TrendBadge";

const RANKED = [...EXAMPLE_ISSUES].sort((a, b) => a.rank - b.rank);
const ARRIVED = EXAMPLE_ARRIVAL_ORDER.map((id) => EXAMPLE_ISSUES.find((i) => i.id === id)).filter(
  (i): i is ExampleIssue => Boolean(i),
);

/** Wait before the list sorts itself, so the reader sees the unsorted state first. */
const SORT_DELAY_MS = 900;

/**
 * "The Monday list" hero illustration. The one orchestrated moment on the page:
 * issues arrive unsorted and settle into ranked order once, then rest.
 */
export function MondayListArtifact({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const [sorted, setSorted] = React.useState(false);

  React.useEffect(() => {
    if (reduceMotion) {
      setSorted(true);
      return;
    }
    const t = window.setTimeout(() => setSorted(true), SORT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [reduceMotion]);

  // Only `sorted` picks the order: useReducedMotion() is null on the server, so
  // reading it here would make the first client render differ from the HTML.
  const items = sorted ? RANKED : ARRIVED;

  return (
    <figure
      className={cn(
        "overflow-hidden rounded-xl border border-line bg-surface shadow-lg",
        className,
      )}
      aria-label="Example of the Monday list for a note-taking app"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-6 text-ink">The Monday list</p>
          <p className="mt-0.5 text-sm text-ink-muted">Example: a note-taking app called {EXAMPLE_PRODUCT}</p>
        </div>
        <Badge tone="neutral" variant="outline" size="md">
          Example
        </Badge>
      </div>

      <div className="grid gap-4 border-b border-line bg-sunken/60 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-5">
        <div className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium text-ink-muted">Feedback this week</p>
            <p className="text-xs tabular-nums text-ink-secondary">
              {formatNumber(EXAMPLE_WEEK_TOTAL)} items
            </p>
          </div>
          <WeekStrip
            days={EXAMPLE_WEEK}
            highlightIndex={0}
            height={40}
            showValues={false}
            unit="feedback items"
            aria-label="Example feedback per day, Monday to Sunday"
          />
        </div>
        <dl className="flex gap-5 sm:flex-col sm:gap-2 sm:border-l sm:border-line sm:pl-5">
          <div>
            <dt className="text-xs text-ink-muted">New issues</dt>
            <dd className="font-display text-xl font-semibold tabular-nums text-ink">2</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Getting worse</dt>
            <dd className="font-display text-xl font-semibold tabular-nums text-ink">1</dd>
          </div>
        </dl>
      </div>

      <ol className="divide-y divide-line" aria-label="Example ranked issues">
        {items.map((issue) => (
          <motion.li
            key={issue.id}
            layout={reduceMotion ? false : "position"}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-start gap-3 bg-surface px-4 py-3.5 sm:px-5"
          >
            <RankNumber rank={issue.rank} className="mt-0.5 w-8 text-xl sm:w-10 sm:text-2xl" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-5 text-ink sm:text-base sm:leading-6">{issue.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <TrendBadge trend={issue.trend} />
                <span className="text-xs tabular-nums text-ink-muted">
                  {issue.mentions} mentions
                </span>
                <span className="flex items-center gap-1.5 text-ink-muted">
                  {issue.sources.map((kind) => (
                    <SourceGlyph key={kind} kind={kind} className="size-3.5" title={sourceKindLabel(kind)} />
                  ))}
                </span>
                <PriorityMeter score={issue.priority} className="sm:hidden" />
              </div>
            </div>
            <PriorityMeter score={issue.priority} showValue className="mt-1 hidden shrink-0 sm:inline-flex" />
          </motion.li>
        ))}
      </ol>

      <figcaption className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs text-ink-muted sm:px-5">
        <CalendarClock aria-hidden className="size-3.5 shrink-0" />
        Updated after every check, sent every Monday morning.
      </figcaption>
    </figure>
  );
}
