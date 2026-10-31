"use client";

import { RotateCcw } from "lucide-react";
import { Button, Callout, PageHeader } from "@/components/ui";

export default function ExtensionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-8">
      <PageHeader title="Extension and widget" />
      <Callout
        tone="danger"
        title="This page could not load"
        action={
          <Button variant="secondary" size="sm" leftIcon={<RotateCcw />} onClick={reset}>
            Try again
          </Button>
        }
      >
        Your tokens and widget settings are safe; nothing was changed. Try again in a moment
        {error.digest ? ` (reference ${error.digest})` : ""}.
      </Callout>
    </div>
  );
}
