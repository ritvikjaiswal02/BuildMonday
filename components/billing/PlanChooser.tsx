"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { PLANS, formatPrice, type BillingInterval, type Currency } from "@/lib/plans";
import { perMonthOfYearly, type PaidPlanId } from "./copy";
import type { BillingState } from "./types";

const PAID_PLANS: PaidPlanId[] = ["pro", "team"];

const INTERVAL_OPTIONS: Array<{ value: BillingInterval; label: string }> = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

const CURRENCY_OPTIONS: Array<{ value: Currency; label: string }> = [
  { value: "INR", label: "INR" },
  { value: "USD", label: "USD" },
];

export type PlanAction =
  | { kind: "current"; label: string }
  | { kind: "checkout"; label: string; confirm: "switch" | "restart" | null };

/**
 * What the button in a plan column does, given the workspace's subscription.
 * "current" disables the button; "checkout" starts Razorpay Checkout.
 * `confirm` asks first: "switch" replaces a live subscription, "restart"
 * starts a new one while a cancelled one is still in its paid period.
 */
export function planAction(state: BillingState, target: PaidPlanId, interval: BillingInterval): PlanAction {
  const name = PLANS[target].name;
  const live =
    state.isPaid &&
    !state.cancelAtPeriodEnd &&
    (state.status === "active" || state.status === "authenticated" || state.status === "past_due");

  if (state.plan === target && state.isPaid) {
    if (live && state.interval === interval) return { kind: "current", label: "Current plan" };
    if (live) {
      return { kind: "checkout", label: `Switch to ${interval === "year" ? "yearly" : "monthly"} billing`, confirm: "switch" };
    }
    return { kind: "checkout", label: `Restart ${name}`, confirm: "restart" };
  }
  if (!state.isPaid) return { kind: "checkout", label: `Upgrade to ${name}`, confirm: null };
  return { kind: "checkout", label: `Switch to ${name}`, confirm: live ? "switch" : "restart" };
}

export interface PlanChooserProps {
  state: BillingState;
  interval: BillingInterval;
  currency: Currency;
  onIntervalChange: (v: BillingInterval) => void;
  onCurrencyChange: (v: Currency) => void;
  /** The plan preselected from ?plan=, given a quiet highlight. */
  selected: PaidPlanId | null;
  pendingPlan: PaidPlanId | null;
  disabled: boolean;
  disabledReason: string | null;
  onChoose: (plan: PaidPlanId, action: PlanAction) => void;
}

/** Pro and Team side by side in one container, with interval and currency controls. */
export const PlanChooser = React.forwardRef<HTMLElement, PlanChooserProps>(function PlanChooser(
  {
    state,
    interval,
    currency,
    onIntervalChange,
    onCurrencyChange,
    selected,
    pendingPlan,
    disabled,
    disabledReason,
    onChoose,
  },
  ref,
) {
  return (
    <section ref={ref} id="plans" aria-labelledby="plans-title" className="scroll-mt-24 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h2 id="plans-title" tabIndex={-1} className="font-display text-xl font-semibold text-ink outline-none">
            {state.isPaid ? "Change plan" : "Choose a plan"}
          </h2>
          <p className="max-w-[60ch] text-sm text-ink-secondary">
            Paid plans check your sources every day, alert you the same day and file issues to Linear or GitHub.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <SegmentedControl
              aria-label="Billing interval"
              value={interval}
              onChange={onIntervalChange}
              options={INTERVAL_OPTIONS}
              size="sm"
            />
            <span className="text-xs text-ink-muted">Yearly: 2 months free</span>
          </div>
          <SegmentedControl
            aria-label="Currency"
            value={currency}
            onChange={onCurrencyChange}
            options={CURRENCY_OPTIONS}
            size="sm"
          />
        </div>
      </div>

      <div className="grid overflow-hidden rounded-lg border border-line bg-surface shadow-xs md:grid-cols-2">
        {PAID_PLANS.map((id, index) => {
          const plan = PLANS[id];
          const amount = plan.prices[currency][interval];
          const action = planAction(state, id, interval);
          const isSelected = selected === id;
          const isPending = pendingPlan === id;
          const isCurrent = state.plan === id && state.isPaid;
          const headingId = `plan-${id}-name`;
          return (
            <article
              key={id}
              aria-labelledby={headingId}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "relative flex flex-col gap-5 p-5 sm:p-6",
                index > 0 && "border-t border-line md:border-l md:border-t-0",
                isSelected && "bg-brand-soft/40",
              )}
            >
              {id === "pro" ? <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-brand" /> : null}

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={headingId} className="font-display text-xl font-semibold text-ink">
                    {plan.name}
                  </h3>
                  {isCurrent ? (
                    <Badge tone="success" size="sm" dot>
                      Your plan
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-ink-secondary">{plan.tagline}</p>
              </div>

              <div>
                <p className="flex items-baseline gap-1.5">
                  <span className="font-display text-3xl font-semibold tabular-nums text-ink">
                    {formatPrice(amount, currency)}
                  </span>
                  <span className="text-sm text-ink-muted">/ {interval}</span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {interval === "year"
                    ? `Billed yearly, about ${perMonthOfYearly(id, currency)} a month.`
                    : `Billed monthly, or ${formatPrice(plan.prices[currency].year, currency)} a year.`}
                </p>
              </div>

              <Button
                variant={id === "pro" ? "primary" : "secondary"}
                className="w-full"
                loading={isPending}
                disabled={disabled || action.kind === "current" || (pendingPlan !== null && !isPending)}
                aria-describedby={disabled && disabledReason ? "plans-disabled-reason" : undefined}
                onClick={() => onChoose(id, action)}
              >
                {isPending ? "Opening checkout" : action.label}
              </Button>

              <ul className="space-y-2.5 text-sm text-ink-secondary">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      {disabled && disabledReason ? (
        <p id="plans-disabled-reason" className="text-sm text-ink-muted">
          {disabledReason}
        </p>
      ) : null}
    </section>
  );
});
