"use client";

import * as React from "react";
import type { MeteredLimitKey } from "@/lib/plans";
import { UsageMeter } from "./UsageMeter";
import { formatPeriod, periodResetDate } from "./copy";
import type { BillingUsage } from "./types";

const METERED_ROWS: Array<{ key: MeteredLimitKey; label: string }> = [
  { key: "feedback_items_per_month", label: "Feedback items" },
  { key: "manual_runs_per_month", label: "Manual runs" },
  { key: "extension_clips_per_month", label: "Extension clips" },
  { key: "prds_per_month", label: "PRDs" },
  { key: "chat_messages_per_month", label: "Chat messages" },
];

/** This month's metered usage, then the workspace counts that do not reset. */
export function UsagePanel({ usage }: { usage: BillingUsage }) {
  const feedback = usage.metrics.feedback_items_per_month;
  const nearQuota = feedback.max > 0 && feedback.used / feedback.max >= 0.9;

  return (
    <section aria-labelledby="usage-title" className="flex h-full flex-col rounded-lg border border-line bg-surface shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pb-1 pt-5 sm:px-6 sm:pt-6">
        <h2 id="usage-title" className="font-display text-xl font-semibold text-ink">
          Usage in {formatPeriod(usage.period)}
        </h2>
        <p className="text-xs text-ink-muted">Monthly allowances reset on {periodResetDate(usage.period)}</p>
      </div>
      {nearQuota ? (
        <p className="px-5 pt-1 text-sm text-ink-secondary sm:px-6">
          {feedback.used >= feedback.max
            ? "New feedback is not being saved until the allowance resets or you upgrade. Runs keep working on what is already stored."
            : "You are close to this month's feedback allowance. Past it, new feedback waits until the reset."}
        </p>
      ) : null}

      <ul className="divide-y divide-line px-5 sm:px-6">
        {METERED_ROWS.map((row) => {
          const m = usage.metrics[row.key];
          return (
            <li key={row.key} className="py-3.5">
              <UsageMeter compact label={row.label} used={m.used} limit={m.max} />
            </li>
          );
        })}
      </ul>

      <div className="mt-auto border-t border-line bg-sunken/60 px-5 py-1 rounded-b-lg sm:px-6">
        <p className="pt-3 text-xs font-medium text-ink-muted">Workspace</p>
        <ul className="divide-y divide-line">
          <li className="py-3">
            <UsageMeter compact label="Products" used={usage.counts.products.used} limit={usage.counts.products.max} />
          </li>
          <li className="py-3">
            <UsageMeter compact label="Seats" used={usage.counts.seats.used} limit={usage.counts.seats.max} />
          </li>
        </ul>
      </div>
    </section>
  );
}
