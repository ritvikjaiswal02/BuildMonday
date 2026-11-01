"use client";

import * as React from "react";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MonitorSourceKind, SourceConfig } from "./source-input";

export interface SourceSample {
  externalId: string | null;
  text: string;
  title?: string;
  author?: string;
  rating?: number | null;
  url?: string;
  postedAt?: string | null;
}

export type SourceTestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; count: number; label: string; sample: SourceSample[]; kind: MonitorSourceKind; config: SourceConfig }
  | { status: "error"; error: string };

export type SourceTestBody = { kind: MonitorSourceKind; config: SourceConfig } | { url: string };

/** Calls POST /api/sources/test. A newer test cancels the one in flight. */
export function useSourceTest() {
  const [state, setState] = React.useState<SourceTestState>({ status: "idle" });
  const controller = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => controller.current?.abort(), []);

  const run = React.useCallback(async (body: SourceTestBody) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/sources/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (ctrl.signal.aborted) return;
      if (!res.ok || !data || data.ok !== true) {
        const error =
          (data && typeof data.error === "string" && data.error) ||
          (res.status === 401 ? "Your session ended. Sign in again to test sources." : "We could not reach this source.");
        setState({ status: "error", error });
        return;
      }
      setState({
        status: "ok",
        count: typeof data.count === "number" ? data.count : 0,
        label: typeof data.label === "string" ? data.label : "",
        sample: Array.isArray(data.sample) ? (data.sample as SourceSample[]) : [],
        kind: data.kind as MonitorSourceKind,
        config: data.config as SourceConfig,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setState({ status: "error", error: "We could not reach BuildMonday. Check your connection and try again." });
    }
  }, []);

  const reset = React.useCallback(() => {
    controller.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, run, reset };
}

function clip(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Inline result under a source row, announced politely to screen readers. */
export function SourceTestResult({ state, className }: { state: SourceTestState; className?: string }) {
  return (
    <div aria-live="polite" className={cn(state.status === "idle" && "sr-only", className)}>
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner size="sm" />
          Checking…
        </p>
      ) : null}
      {state.status === "ok" ? (
        state.count > 0 ? (
          <p className="text-sm text-success-ink">
            Found {state.count} recent {state.count === 1 ? "item" : "items"}.
            {state.sample[0]?.text ? (
              <>
                {" "}
                Example: <span className="text-ink-secondary">&ldquo;{clip(state.sample[0].text)}&rdquo;</span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-ink-secondary">
            This source works but has no recent items yet. We will keep checking on every run.
          </p>
        )
      ) : null}
      {state.status === "error" ? (
        <p className="text-sm text-danger-ink">
          {state.error} <span className="text-ink-muted">You can still save it; we will retry on every run.</span>
        </p>
      ) : null}
    </div>
  );
}
