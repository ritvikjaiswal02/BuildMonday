"use client";

import { RotateCcw } from "lucide-react";
import { Button, Callout } from "@/components/ui";

export default function OnboardingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[560px]">
      <Callout
        tone="danger"
        title="Setup could not load"
        action={
          <Button variant="secondary" size="sm" leftIcon={<RotateCcw />} onClick={reset}>
            Try again
          </Button>
        }
      >
        Something went wrong while loading your workspace. Your answers in this tab are kept; try again in a moment.
      </Callout>
    </div>
  );
}
