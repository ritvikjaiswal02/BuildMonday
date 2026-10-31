"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  LIMIT_LABELS,
  PLANS,
  type FeatureKey,
  type LimitKey,
  type PlanId,
} from "@/lib/plans";
import { PlanBadge } from "./PlanBadge";
import {
  compareRows,
  featureGateMessage,
  limitCell,
  perMonthOfYearly,
  planRank,
  priceLabel,
  resolveRequiredPlan,
  type CompareRow,
  type PaidPlanId,
} from "./copy";
import { useBillingSnapshot } from "./use-billing-snapshot";

export interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: FeatureKey;
  limit?: LimitKey;
  requiredPlan?: Exclude<PlanId, "free">;
  /** The server's message (PlanErrorBody.error) or the caller's own sentence. */
  reason?: string;
}

function describe(feature?: FeatureKey, limit?: LimitKey, reason?: string): string {
  if (reason) return reason;
  if (feature) return featureGateMessage(feature);
  if (limit) return `You have reached the ${LIMIT_LABELS[limit].toLowerCase()} your plan includes.`;
  return "Paid plans check your sources every day, alert you the same day and file issues for you.";
}

function FeatureCell({ included, label }: { included: boolean; label: string }) {
  return included ? (
    <span className="inline-flex items-center gap-1.5 text-ink">
      <Check aria-hidden className="size-4 text-success" />
      <span className="sr-only">{label}: included</span>
      <span aria-hidden className="hidden sm:inline">
        Included
      </span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-ink-muted">
      <Minus aria-hidden className="size-4" />
      <span className="sr-only">{label}: not included</span>
      <span aria-hidden className="hidden sm:inline">
        No
      </span>
    </span>
  );
}

function cellFor(row: CompareRow, plan: PlanId): React.ReactNode {
  if (row.kind === "limit") {
    return <span className="tabular-nums">{limitCell(plan, row.key)}</span>;
  }
  if (row.key === "daily_runs") {
    return PLANS[plan].features.daily_runs ? "Daily" : "Weekly";
  }
  return <FeatureCell included={PLANS[plan].features[row.key]} label={row.label} />;
}

/**
 * Explains what is locked and compares the current plan with the plan that
 * unlocks it, priced in the visitor's currency. The primary action goes to
 * /billing with the plan preselected; nothing is charged from here.
 */
export function UpgradeDialog({ open, onOpenChange, feature, limit, requiredPlan, reason }: UpgradeDialogProps) {
  const snapshot = useBillingSnapshot(open);
  const current = snapshot.plan;
  const target: PaidPlanId = resolveRequiredPlan({ feature, limit, requiredPlan, current });
  const atTop = planRank(current) >= planRank(target);
  const rows = compareRows({ feature, limit });
  const targetPlan = PLANS[target];
  const currentPlan = PLANS[current];

  const title = atTop ? "You have reached your plan's limit" : `Upgrade to ${targetPlan.name}`;
  const description = describe(feature, limit, reason);
  const billingHref = `/billing?plan=${target}&interval=month`;
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        size="md"
        footer={
          atTop ? (
            <>
              <DialogClose asChild>
                <Button variant="secondary">Close</Button>
              </DialogClose>
              <Button variant="primary" asChild>
                <Link href="/billing" onClick={close}>
                  Open billing
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" asChild>
                <Link href="/pricing" onClick={close}>
                  Compare plans
                </Link>
              </Button>
              <Button variant="primary" asChild>
                <Link href={billingHref} onClick={close}>
                  Upgrade to {targetPlan.name}
                </Link>
              </Button>
            </>
          )
        }
      >
        {atTop ? (
          <p className="text-sm text-ink-secondary">
            You are on {currentPlan.name}, the largest plan. Archive something you no longer need, or wait for the
            monthly allowance to reset on the 1st.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full table-fixed border-collapse text-sm">
                <caption className="sr-only">
                  {currentPlan.name} compared with {targetPlan.name}
                </caption>
                <colgroup>
                  <col className="w-[44%]" />
                  <col className="w-[28%]" />
                  <col className="w-[28%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-sunken text-left align-bottom">
                    <th scope="col" className="px-3 py-2.5 font-medium text-ink-muted sm:px-4">
                      <span className="sr-only">What changes</span>
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium sm:px-4">
                      <span className="flex flex-col items-start gap-1">
                        <PlanBadge plan={current} size="sm" />
                        <span className="text-xs font-normal text-ink-muted">Your plan</span>
                      </span>
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium sm:px-4">
                      <span className="flex flex-col items-start gap-1">
                        <PlanBadge plan={target} size="sm" />
                        <span
                          className={cn(
                            "text-xs font-normal tabular-nums text-ink-secondary transition-opacity duration-120",
                            !snapshot.loaded && "opacity-60",
                          )}
                        >
                          {priceLabel(target, snapshot.currency, "month")}
                        </span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={`${row.kind}-${row.key}`} className={cn(row.highlight && "bg-brand-soft/60")}>
                      <th
                        scope="row"
                        className={cn(
                          "px-3 py-2.5 text-left font-normal sm:px-4",
                          row.highlight ? "font-medium text-brand-ink" : "text-ink-secondary",
                        )}
                      >
                        {row.label}
                      </th>
                      <td className="px-3 py-2.5 text-ink-secondary sm:px-4">{cellFor(row, current)}</td>
                      <td className="px-3 py-2.5 font-medium text-ink sm:px-4">{cellFor(row, target)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-muted">
              {targetPlan.name} is {priceLabel(target, snapshot.currency, "month")}, or{" "}
              {priceLabel(target, snapshot.currency, "year")} billed yearly (about{" "}
              {perMonthOfYearly(target, snapshot.currency)} a month). Cancel any time; you keep the plan until the end
              of the period you paid for.
            </p>
            {snapshot.loaded && !snapshot.canManage ? (
              <p className="text-sm text-ink-secondary">
                Only workspace owners and admins can change the plan. Share this with one of them.
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface UpgradeDialogOptions {
  feature?: FeatureKey;
  limit?: LimitKey;
  requiredPlan?: Exclude<PlanId, "free">;
  reason?: string;
}

/**
 * Render `dialog` once, call `open()` when an API answers 402 (pass the
 * fields from `parsePlanError(body)`). `open` is stable across renders.
 */
export function useUpgradeDialog(): { open: (opts: UpgradeDialogOptions) => void; dialog: JSX.Element } {
  const [isOpen, setIsOpen] = React.useState(false);
  const [opts, setOpts] = React.useState<UpgradeDialogOptions>({});

  const open = React.useCallback((next: UpgradeDialogOptions) => {
    setOpts({ ...next });
    setIsOpen(true);
  }, []);

  const dialog = (
    <UpgradeDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      feature={opts.feature}
      limit={opts.limit}
      requiredPlan={opts.requiredPlan}
      reason={opts.reason}
    />
  );

  return { open, dialog };
}
