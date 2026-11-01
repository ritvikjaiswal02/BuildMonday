"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";

export default function BillingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-8">
      <PageHeader title="Billing" />
      <Callout
        tone="danger"
        title="Billing could not load"
        action={
          <Button variant="secondary" size="sm" leftIcon={<RotateCcw />} onClick={reset}>
            Try again
          </Button>
        }
      >
        We could not read your plan and usage just now. Nothing about your subscription has changed; try again in a moment.
      </Callout>
    </div>
  );
}
