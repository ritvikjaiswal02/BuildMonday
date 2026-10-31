"use client";

import { RotateCcw } from "lucide-react";
import { Button, Callout } from "@/components/ui";

export default function SettingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Callout
      tone="danger"
      title="These settings could not load"
      action={
        <Button variant="secondary" size="sm" leftIcon={<RotateCcw />} onClick={reset}>
          Try again
        </Button>
      }
    >
      Something went wrong while loading this page. Nothing was changed. Try again in a moment
      {error.digest ? ` (reference ${error.digest})` : ""}.
    </Callout>
  );
}
