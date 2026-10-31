"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Play, X } from "lucide-react";
import type { RunDTO } from "@/lib/db/dto";
import { cn, pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { toast } from "@/components/ui/toast";
import { RunStatusBadge } from "@/components/Badges";
import { apiFetch, ApiError } from "./api";
import { isRunActive } from "./labels";
import { describeRunProgress, RUN_STEPS, runStepStates } from "./run-stages";
import { StageList } from "./StageList";
import { useApiErrorHandler } from "./use-api-error";

/**
 * Starting a monitor run and following it to the end. A provider holds the
 * current run so the "Run now" button (page header) and the progress panel
 * (page body) stay in sync; the page refreshes its server data when the run
 * finishes, which lets the list reorder in place.
 */

const POLL_MS = 2000;

/** The run already in progress, from a 409 body of POST /api/runs (`{ runId, run }`). */
function activeRunFromConflict(err: unknown): RunDTO | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body as { run?: unknown } | null;
  const run = body && typeof body === "object" ? body.run : null;
  if (run && typeof run === "object" && typeof (run as RunDTO).id === "string" && typeof (run as RunDTO).status === "string") {
    return run as RunDTO;
  }
  return null;
}

interface RunContextValue {
  productId: string;
  run: RunDTO | null;
  starting: boolean;
  start: () => Promise<void>;
  dismiss: () => void;
}

const RunContext = React.createContext<RunContextValue | null>(null);

export function useRunContext(): RunContextValue | null {
  return React.useContext(RunContext);
}

export function summariseRun(run: RunDTO): string {
  const s = run.stats;
  if (run.status === "skipped") return s?.skippedReason ?? "No new feedback since the last run.";
  if (run.status === "failed") return run.error ?? "The run stopped with an error.";
  const parts: string[] = [];
  parts.push(pluralize(s?.inserted ?? 0, "new feedback item"));
  if ((s?.issuesNew ?? 0) > 0) parts.push(pluralize(s.issuesNew, "new issue"));
  if ((s?.issuesWorsened ?? 0) > 0) parts.push(`${s.issuesWorsened} getting worse`);
  if ((s?.issuesResolved ?? 0) > 0) parts.push(`${s.issuesResolved} resolved`);
  return `${parts.join(", ")}.`;
}

function toastFor(run: RunDTO) {
  if (run.status === "succeeded") {
    const n = run.stats?.issuesNew ?? 0;
    toast.success(`Run finished: ${pluralize(n, "new issue")}`);
  } else if (run.status === "skipped") {
    toast(`Run skipped: ${run.stats?.skippedReason ?? "no new feedback since the last run"}`);
  } else if (run.status === "failed") {
    toast.error(`Run failed: ${run.error ?? "see the run log for details"}`);
  }
}

/** Polls GET /api/runs/[id] every 2 s while `run` is active. */
function useRunPolling(run: RunDTO | null, onUpdate: (run: RunDTO) => void) {
  const onUpdateRef = React.useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const runId = run?.id ?? null;
  const active = run ? isRunActive(run.status) : false;

  React.useEffect(() => {
    if (!runId || !active) return;
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const data = await apiFetch<{ run: RunDTO }>(`/api/runs/${encodeURIComponent(runId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        failures = 0;
        if (!cancelled && data?.run) onUpdateRef.current(data.run);
        if (cancelled || !data?.run || !isRunActive(data.run.status)) return;
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        failures += 1;
        if (err instanceof ApiError && err.status === 404) return;
        if (failures >= 5) return;
      }
      timer = window.setTimeout(tick, POLL_MS * (failures > 0 ? 2 : 1));
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [runId, active]);
}

export function RunProvider({
  productId,
  initialRun,
  autoStart = false,
  children,
}: {
  productId: string;
  /** An active run the server already knows about. */
  initialRun: RunDTO | null;
  /** Start one run on mount when there is none (onboarding hand-off). */
  autoStart?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [run, setRun] = React.useState<RunDTO | null>(initialRun);
  const [starting, setStarting] = React.useState(false);
  const { handle, dialog } = useApiErrorHandler();
  const startedOnce = React.useRef(false);

  // Adopt an active run the server reports (another tab, the cron, a refresh).
  React.useEffect(() => {
    if (!initialRun) return;
    setRun((current) => {
      if (!current) return initialRun;
      if (current.id === initialRun.id) return current;
      return isRunActive(current.status) ? current : initialRun;
    });
  }, [initialRun]);

  const runRef = React.useRef(run);
  runRef.current = run;

  const onUpdate = React.useCallback(
    (next: RunDTO) => {
      const prev = runRef.current;
      if (prev && prev.id === next.id && isRunActive(prev.status) && !isRunActive(next.status)) {
        toastFor(next);
        // Let the server components re-read issues, stats and runs.
        window.setTimeout(() => router.refresh(), 0);
      }
      runRef.current = next;
      setRun(next);
    },
    [router],
  );

  useRunPolling(run, onUpdate);

  const start = React.useCallback(async () => {
    if (starting) return;
    setStarting(true);
    try {
      const data = await apiFetch<{ run: RunDTO }>("/api/runs", { method: "POST", json: { productId } });
      setRun(data.run);
      toast("Run started");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const active = activeRunFromConflict(err);
        toast("A run is already in progress for this product.");
        if (active) {
          // Follow the run that is already going instead of showing an error.
          runRef.current = active;
          setRun(active);
        } else {
          router.refresh();
        }
      } else {
        handle(err, "The run could not start. Try again.");
      }
    } finally {
      setStarting(false);
    }
  }, [productId, starting, handle, router]);

  React.useEffect(() => {
    if (!autoStart || startedOnce.current || initialRun) return;
    startedOnce.current = true;
    void start();
  }, [autoStart, initialRun, start]);

  const dismiss = React.useCallback(() => setRun((r) => (r && isRunActive(r.status) ? r : null)), []);

  const value = React.useMemo<RunContextValue>(
    () => ({ productId, run, starting, start, dismiss }),
    [productId, run, starting, start, dismiss],
  );

  return (
    <RunContext.Provider value={value}>
      {children}
      {dialog}
    </RunContext.Provider>
  );
}

/**
 * "Run now". Inside a RunProvider it starts the run in place; on its own it
 * starts the run and opens the run page.
 */
export function RunNowButton({
  productId,
  variant = "primary",
  size = "md",
  className,
  label = "Run now",
}: {
  productId: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  const ctx = useRunContext();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const { handle, dialog } = useApiErrorHandler();

  const busy = ctx ? ctx.starting || (ctx.run ? isRunActive(ctx.run.status) : false) : pending;

  const onClick = async () => {
    if (ctx) return ctx.start();
    setPending(true);
    try {
      const data = await apiFetch<{ run: RunDTO }>("/api/runs", { method: "POST", json: { productId } });
      toast("Run started");
      router.push(`/runs/${data.run.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const active = activeRunFromConflict(err);
        toast("A run is already in progress for this product.");
        if (active) router.push(`/runs/${active.id}`);
        else router.refresh();
      } else {
        handle(err, "The run could not start. Try again.");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        loading={busy}
        leftIcon={<Play aria-hidden />}
        onClick={() => void onClick()}
      >
        {busy && ctx?.run && isRunActive(ctx.run.status) ? "Running" : label}
      </Button>
      {ctx ? null : dialog}
    </>
  );
}

/** Live stage list for a run, then its result. Renders nothing when there is no run to show. */
export function ActiveRunPanel({
  className,
  compact = false,
  hideWhenDone = false,
}: {
  className?: string;
  compact?: boolean;
  /** On the run page the finished state is the page itself, so no result callout. */
  hideWhenDone?: boolean;
}) {
  const ctx = useRunContext();
  const run = ctx?.run ?? null;
  if (!ctx || !run) return null;

  if (!isRunActive(run.status)) {
    if (hideWhenDone) return null;
    const tone = run.status === "succeeded" ? "success" : run.status === "failed" ? "danger" : "neutral";
    const title =
      run.status === "succeeded" ? "Run finished" : run.status === "failed" ? "Run failed" : "Run skipped";
    return (
      <Callout
        tone={tone}
        icon={run.status === "succeeded" ? CheckCircle2 : undefined}
        title={title}
        className={className}
        action={
          <>
            <Button asChild size="sm" variant="secondary" leftIcon={<ExternalLink aria-hidden />}>
              <Link href={`/runs/${run.id}`}>View run</Link>
            </Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Dismiss" onClick={ctx.dismiss}>
              <X aria-hidden />
            </Button>
          </>
        }
      >
        {summariseRun(run)}
      </Callout>
    );
  }

  const states = runStepStates(run.stats?.stage ?? "queued", run.status);
  return (
    <section
      aria-labelledby="active-run-title"
      className={cn("rounded-lg border border-brand/30 bg-surface p-5 shadow-xs sm:p-6", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="active-run-title" className="font-display text-xl font-semibold text-ink">
            Checking your sources
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            This usually takes under a minute. You can leave this page; the run keeps going.
          </p>
        </div>
        <RunStatusBadge status={run.status} />
      </div>
      <div className={cn("mt-5 grid gap-6", !compact && "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
        <StageList steps={RUN_STEPS.map((s, i) => ({ label: s.label, hint: s.hint, state: states[i] }))} />
        {!compact ? (
          <dl className="grid h-fit grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line text-sm">
            <RunFigure label="Fetched" value={run.stats?.fetched ?? 0} />
            <RunFigure label="New feedback" value={run.stats?.inserted ?? 0} />
            <RunFigure label="Duplicates skipped" value={run.stats?.duplicates ?? 0} />
            <RunFigure label="Sources" value={run.stats?.perSource?.length ?? 0} />
          </dl>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {describeRunProgress(run.stats?.stage ?? "queued", run.status)}
      </p>
    </section>
  );
}

function RunFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-display text-xl font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/** Hides its children while the provider's run is in progress (e.g. a "Run your first check" empty state). */
export function WhenNoActiveRun({ children }: { children: React.ReactNode }) {
  const ctx = useRunContext();
  if (ctx?.run && isRunActive(ctx.run.status)) return null;
  return <>{children}</>;
}
