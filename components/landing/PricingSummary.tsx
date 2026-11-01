import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Currency } from "@/lib/plans";
import { PlanColumns } from "./PlanColumns";
import { Section, SectionHeading } from "./Section";

export function PricingSummary({ currency, signedIn }: { currency: Currency; signedIn: boolean }) {
  return (
    <Section id="pricing" aria-labelledby="pricing-summary-title" tone="raised">
      <SectionHeading
        id="pricing-summary-title"
        title="Priced for a five-person team"
        lead={
          <>
            Start free on one product. Upgrade when you want daily checks, alerts and auto-filed issues. Prices
            are in {currency === "INR" ? "Indian rupees" : "US dollars"}; yearly plans get two months free.
          </>
        }
        action={
          <Button asChild variant="secondary">
            <Link href="/pricing">Compare every plan</Link>
          </Button>
        }
      />
      <PlanColumns className="mt-12" currency={currency} interval="month" signedIn={signedIn} compact />
    </Section>
  );
}
