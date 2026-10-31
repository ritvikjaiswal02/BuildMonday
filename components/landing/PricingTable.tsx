"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented";
import { PLANS, PLAN_ORDER, type BillingInterval, type Currency } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { PlanColumns } from "./PlanColumns";
import { comparisonGroups, type ComparisonValue } from "./pricing";

const INTERVAL_OPTIONS: Array<{ value: BillingInterval; label: string }> = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

const CURRENCY_OPTIONS: Array<{ value: Currency; label: string }> = [
  { value: "INR", label: "INR" },
  { value: "USD", label: "USD" },
];

import { CURRENCY_COOKIE } from "@/lib/billing/currency";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export interface PricingTableProps {
  initialCurrency: Currency;
  signedIn: boolean;
}

/** /pricing body: interval and currency controls, the three plan columns, and the full comparison. */
export function PricingTable({ initialCurrency, signedIn }: PricingTableProps) {
  const [interval, setBillingInterval] = React.useState<BillingInterval>("month");
  const [currency, setCurrency] = React.useState<Currency>(initialCurrency);

  // A manual choice is remembered in a cookie, so the server renders the
  // right currency on / and /pricing next time (no flip after load).
  function chooseCurrency(next: Currency) {
    setCurrency(next);
    try {
      document.cookie = `${CURRENCY_COOKIE}=${next}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    } catch {
      // Cookies blocked: the choice still applies for this visit.
    }
  }

  const groups = React.useMemo(() => comparisonGroups(), []);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            aria-label="Billing interval"
            value={interval}
            onChange={setBillingInterval}
            options={INTERVAL_OPTIONS}
          />
          <span className="text-sm text-ink-muted">Yearly: 2 months free</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-muted">
            Currency
          </span>
          <SegmentedControl
            aria-label="Currency"
            value={currency}
            onChange={chooseCurrency}
            options={CURRENCY_OPTIONS}
          />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Showing {interval === "year" ? "yearly" : "monthly"} prices in {currency}.
      </p>

      <PlanColumns className="mt-6" currency={currency} interval={interval} signedIn={signedIn} />

      <section aria-labelledby="compare-title" className="mt-20 sm:mt-28">
        <h2 id="compare-title" className="text-2xl font-semibold sm:text-3xl">
          Compare plans
        </h2>
        <p className="mt-3 max-w-prose text-lg text-ink-secondary">
          Every limit and feature, side by side. Monthly allowances reset on the first day of each month.
        </p>

        {/* Wide screens: a real table. */}
        <div className="mt-8 hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Plan comparison</caption>
            <thead>
              <tr className="border-b border-line bg-sunken">
                <th scope="col" className="w-[40%] px-5 py-3 text-xs font-medium text-ink-muted">
                  <span className="sr-only">Feature</span>
                </th>
                {PLAN_ORDER.map((id) => (
                  <th
                    key={id}
                    scope="col"
                    className={cn(
                      "px-5 py-3 font-display text-base font-semibold text-ink",
                      id === "pro" && "text-brand",
                    )}
                  >
                    {PLANS[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.title}>
                <tr className="border-b border-line">
                  <th
                    scope="colgroup"
                    colSpan={PLAN_ORDER.length + 1}
                    className="bg-canvas px-5 pb-2 pt-5 text-xs font-medium text-ink-muted"
                  >
                    {group.title}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.key} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-5 py-3 align-top font-normal text-ink">
                      {row.label}
                      {row.hint ? <span className="mt-0.5 block text-xs text-ink-muted">{row.hint}</span> : null}
                    </th>
                    {PLAN_ORDER.map((id) => (
                      <td key={id} className="px-5 py-3 align-top text-ink-secondary">
                        <Value value={row.values[id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>

        {/* Narrow screens: stacked rows, no horizontal scroll. */}
        <div className="mt-8 space-y-8 md:hidden">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="font-sans text-xs font-medium text-ink-muted">{group.title}</h3>
              <dl className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
                {group.rows.map((row) => (
                  <div key={row.key} className="px-4 py-3">
                    <dt className="text-sm font-medium text-ink">{row.label}</dt>
                    <dd className="mt-2 grid grid-cols-3 gap-2">
                      {PLAN_ORDER.map((id) => (
                        <div key={id} className="min-w-0">
                          <p className={cn("text-xs", id === "pro" ? "text-brand" : "text-ink-muted")}>
                            {PLANS[id].name}
                          </p>
                          <div className="mt-0.5 text-sm text-ink-secondary">
                            <Value value={row.values[id]} />
                          </div>
                        </div>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Value({ value }: { value: ComparisonValue }) {
  if (value.kind === "text") return <span className="tabular-nums">{value.text}</span>;
  return value.included ? (
    <span className="inline-flex items-center text-brand">
      <Check aria-hidden className="size-4" />
      <span className="sr-only">Included</span>
    </span>
  ) : (
    <span className="inline-flex items-center text-ink-faint">
      <Minus aria-hidden className="size-4" />
      <span className="sr-only">Not included</span>
    </span>
  );
}
