"use client";

import { RouteError } from "@/components/app/RouteStates";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="Run" />;
}
