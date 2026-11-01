import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, Inbox } from "lucide-react";
import { requirePageContext } from "@/lib/auth/session";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import type { FeedbackDTO } from "@/lib/db/dto";
import { formatDate, formatRelativeTime, pluralize, truncate } from "@/lib/utils";
import { SourceGlyph, sourceKindLabel } from "@/components/brand/logos";
import { ActionBadge, TrendBadge } from "@/components/Badges";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PriorityMeter } from "@/components/ui/meter";
import { RankNumber } from "@/components/ui/week-strip";
import { matchEvidenceSources } from "@/components/app/adapters";
import { IssueHeaderActions, IssuePrdPanel } from "@/components/app/IssueDetailClient";
import { EFFORT_META, formatRating } from "@/components/app/labels";
import { Panel, Section } from "@/components/app/Panel";
import { SourceMixBar } from "@/components/app/SourceMixBar";
import { TrendHistoryChart } from "@/components/app/TrendHistoryChart";
import { getIssueDetail, getTrackerStatus } from "@/components/app/server/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const ctx = await requirePageContext();
    const detail = await getIssueDetail(ctx.workspace.id, params.id);
    return { title: detail ? truncate(detail.issue.title, 60) : "Issue" };
  } catch {
    return { title: "Issue" };
  }
}

export default async function IssuePage({ params }: { params: { id: string } }) {
  const ctx = await requirePageContext();
  const detail = await getIssueDetail(ctx.workspace.id, params.id);
  if (!detail) notFound();

  const { issue, snapshots, feedback, feedbackCount } = detail;
  const [trackers, planState] = await Promise.all([
    getTrackerStatus(ctx.workspace.id),
    getWorkspacePlan(ctx.workspace.id),
  ]);
  const evidenceSources = matchEvidenceSources(issue.evidence, feedback);
  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const delta = previous ? issue.frequency - previous.frequency : null;
  const competitor = issue.scope === "competitor";

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
            <li>
              <Link
                href={competitor ? "/issues?scope=competitor" : "/issues"}
                className="focus-ring rounded-sm hover:text-ink"
              >
                {competitor ? "Competitor issues" : "Issues"}
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5 text-ink-faint" />
            </li>
            <li aria-current="page" className="max-w-[40ch] truncate">
              {issue.title}
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            {issue.rank != null ? <RankNumber rank={issue.rank} className="pt-0.5 text-3xl" /> : null}
            <div className="min-w-0 space-y-3">
              <h1 className="break-words font-display text-2xl font-semibold text-ink">{issue.title}</h1>
              <div className="flex flex-wrap items-center gap-1.5">
                <ActionBadge value={issue.recommendedAction} />
                <TrendBadge trend={issue.trend} delta={issue.trend === "persistent" ? null : delta} />
                {competitor && issue.competitorName ? (
                  <Badge tone="neutral" variant="outline">
                    Competitor: {issue.competitorName}
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
                <span className="tabular-nums">{pluralize(issue.frequency, "report")}</span>
                <span className="inline-flex items-center gap-2">
                  <PriorityMeter score={issue.priorityScore} />
                  <span className="tabular-nums">Priority {issue.priorityScore}</span>
                </span>
                <span>Last seen {formatRelativeTime(issue.lastSeenAt)}</span>
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <IssueHeaderActions
              issue={issue}
              trackers={trackers}
              plan={planState.plan.id}
              canFile={!competitor}
            />
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="min-w-0 space-y-8 lg:col-span-8">
          <Section id="why" title="Why it ranks here">
            <p className="max-w-[72ch] text-base text-ink-secondary">
              {issue.rankingReason ?? "No ranking reason was recorded for this issue."}
            </p>
          </Section>

          <Section id="evidence" title="What people said">
            {issue.evidence.length > 0 ? (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {issue.evidence.map((quote, i) => {
                  const kind = evidenceSources[i];
                  return (
                    <li key={i} className="px-4 py-3">
                      <blockquote className="border-l-2 border-line-strong pl-3 text-base text-ink">{quote}</blockquote>
                      {kind ? (
                        <p className="mt-2 inline-flex items-center gap-1.5 pl-3.5 text-xs text-ink-muted">
                          <SourceGlyph kind={kind} className="size-3.5" />
                          {sourceKindLabel(kind)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No quotes were kept for this issue.</p>
            )}
          </Section>

          <Section id="prd" title="PRD" description="A starting point for the spec, written from the evidence above.">
            <IssuePrdPanel issue={issue} />
          </Section>

          <Section
            id="linked-feedback"
            title="Linked feedback"
            description={
              feedbackCount > feedback.length
                ? `The ${feedback.length} most recent of ${pluralize(feedbackCount, "item")} grouped into this issue.`
                : `${pluralize(feedbackCount, "item")} grouped into this issue.`
            }
            action={
              feedbackCount > 0 ? (
                <Link
                  href={`/inbox?issueId=${encodeURIComponent(issue.id)}&status=all`}
                  className="focus-ring rounded-sm text-sm font-medium text-brand hover:underline"
                >
                  Open in inbox
                </Link>
              ) : undefined
            }
          >
            {feedback.length > 0 ? (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
                {feedback.map((f) => (
                  <LinkedFeedbackRow key={f.id} item={f} />
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-line bg-surface">
                <EmptyState headingLevel={3}
                  icon={Inbox}
                  title="No linked feedback"
                  description="Feedback links to issues when a run groups it. Older issues from before linking may have none."
                />
              </div>
            )}
          </Section>
        </div>

        <aside className="min-w-0 space-y-6 lg:col-span-4" aria-label="Issue details">
          <Panel title="Reports per run" bodyClassName="px-4 py-4">
            <TrendHistoryChart snapshots={snapshots} />
          </Panel>
          <Panel title="Where it came from" bodyClassName="px-4 py-4">
            <SourceMixBar mix={issue.sourceMix} />
          </Panel>
          <Panel title="Details" bodyClassName="px-4 py-2">
            <dl className="divide-y divide-line text-sm">
              <Fact label="Who is affected" value={issue.affectedSegment || "Not specified"} />
              {issue.category ? <Fact label="Category" value={issue.category} /> : null}
              <Fact label="Severity" value={issue.severity} />
              <Fact label="Churn risk" value={issue.churnRisk} />
              <Fact label="Effort" value={EFFORT_META[issue.effort].label} />
              <Fact label="First seen" value={formatDate(issue.firstSeenAt)} />
              <Fact label="Last seen" value={formatRelativeTime(issue.lastSeenAt)} />
              {issue.resolvedAt ? <Fact label="Resolved" value={formatDate(issue.resolvedAt)} /> : null}
              {issue.filedAt && issue.externalUrl ? (
                <Fact
                  label="Filed"
                  value={
                    issue.externalUrl ? (
                      <a
                        href={issue.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring inline-flex items-center gap-1 rounded-sm text-brand hover:underline"
                      >
                        {issue.externalTarget === "github" ? "GitHub" : "Linear"}, {formatDate(issue.filedAt)}
                        <ExternalLink aria-hidden className="size-3" />
                      </a>
                    ) : (
                      formatDate(issue.filedAt)
                    )
                  }
                />
              ) : null}
              {issue.prdGeneratedAt ? <Fact label="PRD written" value={formatRelativeTime(issue.prdGeneratedAt)} /> : null}
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{value}</dd>
    </div>
  );
}

function LinkedFeedbackRow({ item }: { item: FeedbackDTO }) {
  const when = item.postedAt ?? item.ingestedAt;
  const rating = formatRating(item.rating);
  return (
    <li className="flex gap-3 px-4 py-3">
      <SourceGlyph kind={item.site ?? item.sourceKind} className="mt-0.5 size-4 text-ink-muted" title={sourceKindLabel(item.site ?? item.sourceKind)} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-3 whitespace-pre-line text-sm text-ink-secondary">{item.text}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {item.author ? <span>{item.author}</span> : null}
          {rating ? <span>{rating}</span> : null}
          <time dateTime={when}>{formatRelativeTime(when)}</time>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-1 rounded-sm text-brand hover:underline"
            >
              Original
              <ExternalLink aria-hidden className="size-3" />
            </a>
          ) : null}
        </p>
      </div>
    </li>
  );
}
