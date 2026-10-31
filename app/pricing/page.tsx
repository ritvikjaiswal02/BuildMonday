import type { Metadata } from "next";
import { FaqSection } from "@/components/landing/FaqSection";
import { PRICING_FAQ } from "@/components/landing/faq-content";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { PricingTable } from "@/components/landing/PricingTable";
import { EVERY_PLAN_INCLUDES } from "@/components/landing/pricing";
import { requestCurrency, requestSignedIn } from "@/components/landing/request";

// Currency comes from the visitor's country header; CTAs depend on the session cookie.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free for one product with the Monday email. Pro adds daily checks, instant alerts and auto-filed issues. Team adds more products, sources and seats. Billed in INR or USD.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  const signedIn = requestSignedIn();
  return (
    <MarketingShell signedIn={signedIn}>
      <div className="container-marketing pb-20 pt-12 sm:pb-28 sm:pt-20">
        <header className="max-w-[720px]">
          <h1 className="text-3xl font-semibold sm:text-4xl">Pricing</h1>
          <p className="mt-4 max-w-prose text-lg text-ink-secondary">
            Start free on one product and get the Monday email. Upgrade for daily checks, alerts in Slack and
            email, and issues filed to Linear or GitHub for you.
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
            {EVERY_PLAN_INCLUDES.map((item) => (
              <li key={item} className="inline-flex items-center gap-2">
                <span aria-hidden className="size-1.5 rounded-full bg-brand" />
                {item}
              </li>
            ))}
          </ul>
        </header>

        <div className="mt-10">
          <PricingTable initialCurrency={requestCurrency()} signedIn={signedIn} />
        </div>
      </div>
      <div className="border-t border-line bg-surface">
        <FaqSection items={PRICING_FAQ} title="Billing questions" />
      </div>
    </MarketingShell>
  );
}
