"use client";

import * as React from "react";
import { AlertTriangle, CalendarClock, OctagonAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLANS, formatLimit, formatPrice } from "@/lib/plans";
import { PlanBadge } from "./PlanBadge";
import { subscriptionStatusLine } from "./copy";
import type { BillingState } from "./types";

export interface CurrentPlanPanelProps {
  state: BillingState;
  canManage: boolean;
  billingEnabled: boolean;
  onCancel: () => void;
  onChangePlan: () => void;
}

function StatusBadge({ state }: { state: BillingState }) {
  if (state.status === "trialing") {
    return (
      <Badge tone="brand" dot>
        Trial
      </Badge>
    );
  }
  if (state.plan === "free") return null;
  if (state.status === "past_due" || state.status === "halted") {
    return (
      <Badge tone="danger" dot>
        Payment due
      </Badge>
    );
  }
  if (state.cancelAtPeriodEnd || state.status === "cancelled" || state.status === "completed") {
    return (
      <Badge tone="warning" dot>
        Cancelled
      </Badge>
    );
  }
  return (
    <Badge tone="success" dot>
      Active
    </Badge>
  );
}

const LINE_ICON = { neutral: CalendarClock, warning: AlertTriangle, danger: OctagonAlert } as const;
const LINE_TONE = { neutral: "text-ink-secondary", warning: "text-warning-ink", danger: "text-danger-ink" } as const;
const ICON_TONE = { neutral: "text-ink-muted", warning: "text-warning", danger: "text-danger" } as const;

/** The plan the workspace is on, what it costs, when it renews, and the cancel action. */
export function CurrentPlanPanel({ state, canManage, billingEnabled, onCancel, onChangePlan }: CurrentPlanPanelProps) {
  const plan = PLANS[state.plan];
  const line = subscriptionStatusLine(state);
  const LineIcon = LINE_ICON[line.tone];
  const price =
    state.plan !== "free" && state.isPaid && state.interval && state.currency
      ? { amount: formatPrice(plan.prices[state.currency][state.interval], state.currency), suffix: `/ ${state.interval}` }
      : null;
  const cancellable =
    canManage &&
    billingEnabled &&
    state.isPaid &&
    !state.cancelAtPeriodEnd &&
    (state.status === "active" || state.status === "authenticated" || state.status === "past_due");

  const competitors = plan.limits.competitors;
  const facts: Array<{ term: string; value: string }> = [
    { term: "Checks", value: plan.features.daily_runs ? "Every day" : "Every Sunday" },
    { term: "Sources per product", value: formatLimit(plan.limits.sources_per_product) },
    { term: "Feedback a month", value: `${formatLimit(plan.limits.feedback_items_per_month)} items` },
    { term: "Competitors", value: competitors === 0 ? "Not included" : `${formatLimit(competitors)} per product` },
    { term: "Alerts", value: plan.features.instant_email_alerts ? "Email and Slack" : "Monday email only" },
    { term: "History", value: `${formatLimit(plan.limits.history_days)} days` },
  ];

  return (
    <section aria-labelledby="current-plan-title" className="flex h-full flex-col rounded-lg border border-line bg-surface shadow-xs">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="current-plan-title" className="text-sm font-medium text-ink-muted">
            Current plan
          </h2>
          <StatusBadge state={state} />
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-display text-3xl font-semibold text-ink">{plan.name}</p>
            {price ? (
              <p className="text-base tabular-nums text-ink-secondary">
                {price.amount} <span className="text-ink-muted">{price.suffix}</span>
              </p>
            ) : (
              <p className="text-base text-ink-muted">{state.status === "trialing" ? "Free during the trial" : "No charge"}</p>
            )}
          </div>
          <p className="max-w-[48ch] text-sm text-ink-secondary">{plan.tagline}</p>
        </div>

        <p className={cn("flex items-start gap-2 text-sm", LINE_TONE[line.tone])}>
          <LineIcon aria-hidden className={cn("mt-0.5 size-4 shrink-0", ICON_TONE[line.tone])} />
          <span>{line.text}</span>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line px-5 py-4 text-sm sm:px-6">
        {facts.map((f) => (
          <div key={f.term} className="min-w-0">
            <dt className="text-xs text-ink-muted">{f.term}</dt>
            <dd className="truncate tabular-nums text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <PlanBadge plan={state.plan} size="sm" />
          {state.currency && state.isPaid ? <span>Billed in {state.currency} through Razorpay</span> : <span>No card on file</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {cancellable ? (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-danger hover:text-danger">
              Cancel subscription
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={onChangePlan}>
            {state.plan === "free" ? "See paid plans" : "Change plan"}
          </Button>
        </div>
      </div>
    </section>
  );
}
