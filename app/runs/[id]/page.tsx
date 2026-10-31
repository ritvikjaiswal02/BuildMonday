import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, CircleSlash } from "lucide-react";
import { requirePageContext, requireProduct } from "@/lib/auth/session";
import type { IssueDTO, RunDTO } from "@/lib/db/dto";
import type { RunSourceResult } from "@/lib/db/schema";
import { cn, formatDate, formatDuration, formatNumber, formatRelativeTime, pluralize } from "@/lib/utils";
import { SourceGlyph } from "@/components/brand/logos";
import { RunStatusBadge } from "@/components/Badges";
import { Callout } from "@/components/ui/callout";
import { Stat, StatGroup } from "@/components/ui/stat";
import { IssueList } from "@/components/app/IssueList";
import { Section } from "@/components/app/Panel";
import { ActiveRunPanel, RunProvider } from "@/components/app/RunController";
import { StageList } from "@/components/app/StageList";
import { isRunActive, RUN_TRIGGER_LABEL } from "@/components/app/labels";
import { RUN_STEPS, runStepStates } from "@/components/app/run-stages";
import { getRunDetail } from "@/components/app/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Run" };

export default async function RunPage({ params }: { params: { id: string } }) {
  const ctx = await requirePageContext();
  const detail = await getRunDetail(ctx.workspace.id, params.id);
  if (!detail) notFound();
  const { run, issuesById } = detail;

  let productName: string | null = null;
  try {
    productName = (await requireProduct(ctx, detail.productId)).name;
  } catch {
    productName = null;
  }

  const active = isRunActive(run.status);
  const s = run.stats;
  const when = run.startedAt ?? run.createdAt;
  const pick = (ids: string[] | undefined): IssueDTO[] =>
    (ids ?? []).map((id) => issuesById[id]).filter((x): x is IssueDTO => Boolean(x));
  const diff = {
    new: pick(s?.newIssueIds),
    worsened: pick(s?.worsenedIssueIds),
    improved: pick(s?.improvedIssueIds),
    resolved: pick(s?.resolvedIssueIds),
  };
  const anyDiff = diff.new.length + diff.worsened.length + diff.improved.length + diff.resolved.length > 0;

  return (
    <RunProvider productId={detail.productId} initialRun={active ? run : null}>
      <div className="space-y-8">
        <header className="space-y-3">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
              <li>
                <Link href="/runs" className="focus-ring rounded-sm hover:text-ink">
                  Runs
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="size-3.5 text-ink-faint" />
              </li>
              <li aria-current="page">{formatDate(when)}</li>
            </ol>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-ink">
              {RUN_TRIGGER_LABEL[run.trigger]} on {formatDate(when)}
            </h1>
            <RunStatusBadge status={run.status} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            {productName ? <span>{productName}</span> : null}
            <span>
              Started <time dateTime={when}>{formatRelativeTime(when)}</time>
            </span>
            {run.durationMs != null ? <span>Took {formatDuration(run.durationMs)}</span> : null}
            {run.finishedAt ? <span>Finished {formatRelativeTime(run.finishedAt)}</span> : null}
          </div>
        </header>

        {active ? <ActiveRunPanel hideWhenDone /> : null}

        {!active && run.status === "failed" ? (
          <Callout tone="danger" title="This run stopped with an error">
            {run.error ?? "No error message was recorded."} The next scheduled run tries again automatically.
          </Callout>
        ) : null}
        {!active && run.status === "skipped" ? (
          <Callout tone="neutral" icon={CircleSlash} title="Nothing new to analyze">
            {s?.skippedReason ?? "No new feedback arrived since the last run, so the list did not change."}
          </Callout>
        ) : null}
        {s?.quotaReached ? (
          <Callout tone="warning" title="The monthly feedback limit was reached during this run">
            New items beyond the limit were not saved. The run analyzed the feedback already stored.{" "}
            <Link href="/billing" className="font-medium text-brand hover:underline">
              See plans
            </Link>
          </Callout>
        ) : null}

        {!active ? (
          <StatGroup>
            <Stat label="Fetched" value={formatNumber(s?.fetched ?? 0)} />
            <Stat label="New feedback" value={formatNumber(s?.inserted ?? 0)} hint={`${formatNumber(s?.duplicates ?? 0)} already seen`} />
            <Stat label="Analyzed" value={formatNumber(s?.analyzed ?? 0)} />
            <Stat
              label="Alerts and filing"
              value={formatNumber((s?.alertsSent ?? 0) + (s?.filed ?? 0))}
              hint={`${pluralize(s?.alertsSent ?? 0, "alert")}, ${formatNumber(s?.filed ?? 0)} filed`}
            />
          </StatGroup>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-12">
          <div className="min-w-0 space-y-8 lg:col-span-8">
            {!active ? (
              <Section id="changes" title="What changed" description="Compared with the previous successful run.">
                {anyDiff ? (
                  <div className="space-y-6">
                    <DiffGroup title="New" items={diff.new} />
                    <DiffGroup title="Getting worse" items={diff.worsened} />
                    <DiffGroup title="Improving" items={diff.improved} />
                    <DiffGroup title="Resolved" items={diff.resolved} />
                  </div>
                ) : (
                  <p className="rounded-lg border border-line bg-surface px-4 py-4 text-sm text-ink-muted">
                    {run.status === "succeeded"
                      ? "No issue changed enough to call out. Existing issues stayed about the same."
                      : "This run did not get as far as comparing issues."}
                  </p>
                )}
              </Section>
            ) : null}

            <Section id="sources" title="Sources" description="What each source returned in this run.">
              <SourceResults results={s?.perSource ?? []} />
            </Section>
          </div>

          {!active ? (
            <aside className="min-w-0 lg:col-span-4" aria-label="Run steps">
              <section className="rounded-lg border border-line bg-surface p-4 shadow-xs">
                <h2 className="mb-4 text-sm font-medium text-ink">Steps</h2>
                <RunSteps run={run} />
              </section>
            </aside>
          ) : null}
        </div>
      </div>
    </RunProvider>
  );
}

function RunSteps({ run }: { run: RunDTO }) {
  const states = runStepStates(run.stats?.stage ?? "queued", run.status);
  return <StageList steps={RUN_STEPS.map((step, i) => ({ label: step.label, state: states[i] }))} />;
}

function DiffGroup({ title, items }: { title: string; items: IssueDTO[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-ink">
        {title} <span className="font-normal tabular-nums text-ink-muted">{items.length}</span>
      </h3>
      <IssueList
        items={items.map((issue) => ({ issue, history: [] }))}
        showStatus={false}
        showCompetitor
        rankFallback="none"
        aria-label={title}
      />
    </div>
  );
}

function SourceResults({ results }: { results: RunSourceResult[] }) {
  if (results.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-4 text-sm text-ink-muted">
        No sources were fetched in this run. Feedback from the widget, the extension and the inbox was still analyzed.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
      <div
        aria-hidden
        className="hidden grid-cols-[minmax(0,1fr)_80px_80px_90px] gap-4 border-b border-line bg-sunken px-4 py-2 text-xs font-medium text-ink-muted md:grid"
      >
        <span>Source</span>
        <span className="text-right">Fetched</span>
        <span className="text-right">New</span>
        <span className="text-right">Duplicates</span>
      </div>
      <ul className="divide-y divide-line">
        {results.map((r) => (
          <li key={r.sourceId} className="px-4 py-3">
            <div className="md:grid md:grid-cols-[minmax(0,1fr)_80px_80px_90px] md:items-center md:gap-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <SourceGlyph kind={r.kind} className="size-4 text-ink-muted" />
                <span className="truncate text-sm text-ink" title={r.label}>
                  {r.label}
                </span>
                {r.role === "competitor" ? <span className="shrink-0 text-xs text-ink-muted">Competitor</span> : null}
              </div>
              <dl className="mt-1.5 flex gap-4 text-sm md:contents">
                <Num label="Fetched" value={r.fetched} />
                <Num label="New" value={r.inserted} />
                <Num label="Duplicates" value={r.duplicates} />
              </dl>
            </div>
            {r.pausedByPlan ? (
              <p className="mt-1.5 text-xs text-ink-muted">
                Skipped: over your plan&apos;s source limit.{" "}
                <Link href="/billing" className="font-medium text-brand hover:underline">
                  See plans
                </Link>
              </p>
            ) : r.error ? (
              <p className="mt-1.5 text-xs text-danger">{r.error}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Num({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1 md:block md:text-right">
      <dt className="text-xs text-ink-muted md:sr-only">{label}</dt>
      <dd className={cn("tabular-nums", value > 0 ? "text-ink" : "text-ink-muted")}>{formatNumber(value)}</dd>
    </div>
  );
}
