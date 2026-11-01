import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS, PLAN_ORDER, type BillingInterval, type Currency, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { planCtaHref, planCtaLabel, priceDisplay } from "./pricing";

export interface PlanColumnsProps {
  currency: Currency;
  interval: BillingInterval;
  signedIn: boolean;
  /** Shorter columns for the landing page summary: price, tagline, three highlights. */
  compact?: boolean;
  className?: string;
}

const HIGHLIGHTED: PlanId = "pro";

/**
 * Three plan columns inside one bordered container. Pro is set apart only by a
 * brand top border and the primary button.
 */
export function PlanColumns({ currency, interval, signedIn, compact = false, className }: PlanColumnsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-3",
        className,
      )}
    >
      {PLAN_ORDER.map((id, index) => {
        const plan = PLANS[id];
        const price = priceDisplay(plan, currency, interval);
        const highlighted = id === HIGHLIGHTED;
        const highlights = compact ? plan.highlights.slice(0, 3) : plan.highlights;
        const headingId = `plan-${id}-${compact ? "summary" : "full"}`;
        return (
          <section
            key={id}
            aria-labelledby={headingId}
            className={cn(
              "flex flex-col p-5 sm:p-6",
              index > 0 && "border-t border-line lg:border-l lg:border-t-0",
              highlighted
                ? "border-t-2 border-t-brand lg:border-t-2 lg:border-t-brand"
                : "lg:border-t-2 lg:border-t-transparent",
            )}
          >
            <h3 id={headingId} className="text-xl font-semibold">
              {plan.name}
            </h3>
            <p className="mt-1 min-h-[40px] text-sm text-ink-muted">{plan.tagline}</p>

            <div className="mt-5">
              <p className="flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-semibold tabular-nums text-ink">{price.amount}</span>
                {price.suffix ? <span className="text-sm text-ink-muted">{price.suffix}</span> : null}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{price.note}</p>
            </div>

            <Button
              asChild
              variant={highlighted ? "primary" : "secondary"}
              size="md"
              className="mt-6 w-full"
            >
              <Link href={planCtaHref(id, interval, signedIn)}>{planCtaLabel(id, signedIn)}</Link>
            </Button>

            <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
              {highlights.map((h) => (
                <li key={h} className="flex items-start gap-2.5 text-sm text-ink-secondary">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                  {h}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
