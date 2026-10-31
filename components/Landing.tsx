import type { Currency } from "@/lib/plans";
import { Automations } from "@/components/landing/Automations";
import { CollectSection } from "@/components/landing/CollectSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { LANDING_FAQ } from "@/components/landing/faq-content";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { PricingSummary } from "@/components/landing/PricingSummary";
import { SourcesSection } from "@/components/landing/SourcesSection";
import { TryBand } from "@/components/landing/TryBand";

export interface LandingProps {
  /** INR for visitors from India, USD for everyone else. */
  currency: Currency;
  /** True when the request carried an Auth.js session cookie. */
  signedIn: boolean;
  /** Public app URL used in the widget snippet. */
  appUrl: string;
}

/** The marketing home page. Server component; only the header, hero list and copy field hydrate. */
export function Landing({ currency, signedIn, appUrl }: LandingProps) {
  return (
    <MarketingShell signedIn={signedIn}>
      <Hero signedIn={signedIn} />
      <SourcesSection />
      <HowItWorks />
      <Automations />
      <CollectSection appUrl={appUrl} />
      <TryBand />
      <PricingSummary currency={currency} signedIn={signedIn} />
      <FaqSection items={LANDING_FAQ} />
    </MarketingShell>
  );
}
