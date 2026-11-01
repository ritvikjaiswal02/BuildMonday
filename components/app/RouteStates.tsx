"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

/**
 * Error boundary body for app routes (error.tsx). Says what happened and
 * offers to retry; the digest helps when reporting a problem.
 */
export function RouteError({
  error,
  reset,
  title,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  const notConfigured = /not configured|not set/i.test(error.message ?? "");

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
      <Callout
        tone="danger"
        title={notConfigured ? "This part of BuildMonday is not set up on this deployment" : "This page did not load"}
        action={
          <>
            <Button size="sm" variant="primary" leftIcon={<RotateCcw aria-hidden />} onClick={reset}>
              Try again
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </>
        }
      >
        {notConfigured
          ? "The database or another service is missing its configuration. The free analyzer still works."
          : "Something went wrong while loading your data. Try again; if it keeps happening, the error reference below helps us find it."}
        {error.digest ? <span className="mt-1 block font-mono text-xs text-ink-muted">Reference: {error.digest}</span> : null}
      </Callout>
    </div>
  );
}
