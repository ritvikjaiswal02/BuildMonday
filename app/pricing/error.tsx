"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PLANS, formatPrice } from "@/lib/plans";

function both(id: "free" | "pro" | "team"): string {
  const p = PLANS[id].prices;
  return `${formatPrice(p.INR.month, "INR")} or ${formatPrice(p.USD.month, "USD")}`;
}

export default function PricingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="container-marketing max-w-[720px] py-20">
        <h1 className="text-3xl font-semibold sm:text-4xl">Pricing</h1>
        <Callout
          tone="danger"
          title="The pricing page did not load."
          className="mt-8"
          action={
            <Button size="sm" onClick={reset}>
              Try again
            </Button>
          }
        >
          Free is {both("free")}. Pro is {both("pro")} a month. Team is {both("team")} a month. Reload the page for the
          full comparison, or <Link href="/" className="text-brand underline underline-offset-2">go to the home page</Link>.
        </Callout>
      </div>
    </div>
  );
}
