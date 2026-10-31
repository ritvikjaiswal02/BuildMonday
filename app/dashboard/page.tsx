import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ListChecks, Radar, Sparkles } from "lucide-react";
import { getActiveProduct, hasRole, requirePageContext } from "@/lib/auth/session";
import { getUsage, getWorkspacePlan, trialDaysLeft } from "@/lib/billing/entitlements";
import { toProductDTO } from "@/lib/db/dto";
import { PLANS } from "@/lib/plans";
import { formatNumber, formatRelativeTime, pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Stat, StatGroup } from "@/components/ui/stat";
import { WeekStrip } from "@/components/ui/week-strip";
import { ChatSheet } from "@/components/app/ChatSheet";
import { IssueList } from "@/components/app/IssueList";
import { NoProductState } from "@/components/app/NoProductState";
import { Panel, Section } from "@/components/app/Panel";
import { QuotaBanner } from "@/components/app/QuotaBanner";
import { ActiveRunPanel, RunNowButton, RunProvider, WhenNoActiveRun } from "@/components/app/RunController";
import { RunRow } from "@/components/app/RunRow";
import { SetupChecklist } from "@/components/app/SetupChecklist";
import { SourceHealthList } from "@/components/app/SourceHealthList";
import { scheduleMeta, weekDelta } from "@/components/app/format";
import { getDashboardData, getSetupChecklist } from "@/components/app/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requirePageContext();
  const product = await getActiveProduct(ctx);
  if (!product) return <NoProductState title="Dashboard" />;

  const now = new Date();
  const isAdmin = hasRole(ctx, "admin");
  const [data, planState, feedbackUsed, checklist] = await Promise.all([
    getDashboardData(product, ctx.workspace.timezone, now),
    getWorkspacePlan(ctx.workspace.id),
    getUsage(ctx.workspace.id, "feedback_items_per_month"),
    isAdmin ? getSetupChecklist(ctx.workspace, product) : Promise.resolve(null),
  ]);
  const productDto = toProductDTO(product);
  const quotaMax = planState.plan.limits.feedback_items_per_month;
  const isFirst = one(searchParams.first) === "1";
  const enabledSources = data.sources.filter((s) => s.enabled && s.role === "own").length;
  const hasIssues = data.topIssues.length > 0;
  // A run needs something to read: an enabled source or feedback already in the inbox.
  const canRun = enabledSources > 0 || data.feedbackTotal > 0;
  const autoStart = isFirst && !data.hasAnyRun && canRun;
  const waitingForFirstRun = !hasIssues && (data.activeRun !== null || autoStart);
  const lastNew = data.lastSucceededRun?.stats?.issuesNew ?? 0;

  // A visitor who picked a paid plan before signing up is offered to finish it, without interrupting the first run.
  const upgradeTo = one(searchParams.upgrade);
  const upgradePlan = upgradeTo === "team" || upgradeTo === "pro" ? upgradeTo : null;
  const upgradeInterval = one(searchParams.interval) === "month" ? "month" : "year";
  const showUpgrade = upgradePlan !== null && !planState.isPaid && isAdmin;
  const trialDays = planState.status === "trialing" ? trialDaysLeft(planState.trialEndsAt, now) : 0;

  const upgradeCallout = showUpgrade ? (
    <Callout
      tone="brand"
      icon={Sparkles}
      title={`Finish upgrading to ${PLANS[upgradePlan].name}`}
      action={
        <Button asChild variant="primary" size="sm">
          <Link href={`/billing?plan=${upgradePlan}&interval=${upgradeInterval}`}>
            Choose {upgradeInterval === "year" ? "yearly" : "monthly"} billing
          </Link>
        </Button>
      }
    >
      {trialDays > 0
        ? `You picked ${PLANS[upgradePlan].name} before signing up. Your Pro trial runs for ${pluralize(trialDays, "more day")}, so there is no rush; add a card whenever you are ready.`
        : `You picked ${PLANS[upgradePlan].name} before signing up. Pick a billing period to finish.`}
    </Callout>
  ) : null;

  const setupPanel = checklist ? <SetupChecklist checklist={checklist} canHide={isAdmin} /> : null;

  return (
    <RunProvider productId={product.id} initialRun={data.activeRun} autoStart={autoStart}>
      <div className="space-y-8">
        <PageHeader
          title={product.name}
          meta={scheduleMeta(productDto, now).map((part) => (
            <span key={part}>{part}</span>
          ))}
          actions={
            canRun ? (
              <>
                {hasIssues ? <ChatSheet productId={product.id} productName={product.name} /> : null}
                <RunNowButton productId={product.id} />
              </>
            ) : undefined
          }
        />

        {upgradeCallout}
        <QuotaBanner used={feedbackUsed} max={quotaMax} />
        <ActiveRunPanel />

        {waitingForFirstRun ? (
          <div className="grid gap-8 lg:grid-cols-12">
            <section className="rounded-lg border border-line bg-surface px-5 py-6 shadow-xs sm:px-6 lg:col-span-8">
              <h2 className="font-display text-xl font-semibold text-ink">Your first Monday list is on its way</h2>
              <p className="mt-1 max-w-[72ch] text-sm text-ink-secondary">
                BuildMonday is reading your {enabledSources > 0 ? "sources" : "feedback"} for the first time. When the
                run finishes, the ranked list appears here. After this it runs on its own, and the Monday email brings
                you the list.
              </p>
            </section>
            {setupPanel ? <aside className="min-w-0 lg:col-span-4">{setupPanel}</aside> : null}
          </div>
        ) : !canRun && !hasIssues ? (
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="rounded-lg border border-line bg-surface shadow-xs lg:col-span-8">
              <EmptyState
                icon={Radar}
                title="Add a source to start monitoring"
                description="Connect your App Store or Google Play app, subreddits, Hacker News keywords or Trustpilot page. BuildMonday checks them on a schedule and ranks what people complain about."
                action={
                  <Button asChild variant="primary">
                    <Link href="/settings/sources">Add a source</Link>
                  </Button>
                }
              />
            </div>
            {setupPanel ? <aside className="min-w-0 lg:col-span-4">{setupPanel}</aside> : null}
          </div>
        ) : !hasIssues && !data.hasAnyRun ? (
          <WhenNoActiveRun>
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="rounded-lg border border-line bg-surface shadow-xs lg:col-span-8">
                <EmptyState
                  icon={ListChecks}
                  title="Run your first check"
                  description="BuildMonday fetches your sources, groups the feedback into issues and ranks them. It takes about a minute."
                  action={<RunNowButton productId={product.id} />}
                />
              </div>
              {setupPanel ? <aside className="min-w-0 lg:col-span-4">{setupPanel}</aside> : null}
            </div>
          </WhenNoActiveRun>
        ) : (
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="min-w-0 space-y-8 lg:col-span-8">
              <StatGroup>
                <Stat
                  label="Feedback this week"
                  value={formatNumber(data.volume.thisWeek)}
                  delta={weekDelta(data.volume.thisWeek, data.volume.lastWeek)}
                />
                <Stat label="Open issues" value={formatNumber(data.openIssues)} />
                <Stat
                  label="New this run"
                  value={formatNumber(lastNew)}
                  hint={data.lastSucceededRun ? `Run ${formatRelativeTime(data.lastSucceededRun.createdAt, now)}` : "No finished run yet"}
                />
                <Stat label="Resolved in 30 days" value={formatNumber(data.resolved30d)} />
              </StatGroup>

              <Section
                id="weekly-list"
                title="This week's list"
                description={
                  data.pendingMatched > 0
                    ? `Your top issues by priority, from the latest run. ${pluralize(data.pendingMatched, "new report")} already matched to these issues will be counted on the next run.`
                    : "Your top issues by priority, from the latest run."
                }
                action={
                  hasIssues ? (
                    <Link href="/issues" className="focus-ring rounded-sm text-sm font-medium text-brand hover:underline">
                      All issues
                    </Link>
                  ) : undefined
                }
              >
                {hasIssues ? (
                  <IssueList items={data.topIssues} aria-label="This week's list" />
                ) : (
                  <div className="rounded-lg border border-line bg-surface shadow-xs">
                    <EmptyState
                      headingLevel={3}
                      icon={CheckCircle2}
                      title="No open issues"
                      description="The latest run found nothing new to fix. New feedback is checked on the next run."
                      action={canRun ? <RunNowButton productId={product.id} variant="secondary" /> : undefined}
                    />
                  </div>
                )}
              </Section>

              {data.competitorIssues.length > 0 ? (
                <Section
                  id="competitor-gaps"
                  title="Competitor gaps"
                  description="What people complain about in your competitors' reviews. Places you could win."
                  action={
                    <Link
                      href="/issues?scope=competitor"
                      className="focus-ring rounded-sm text-sm font-medium text-brand hover:underline"
                    >
                      All competitor issues
                    </Link>
                  }
                >
                  <IssueList
                    items={data.competitorIssues.map((issue) => ({ issue: { ...issue, rank: null }, history: [] }))}
                    showStatus={false}
                    showCompetitor
                    aria-label="Competitor gaps"
                  />
                </Section>
              ) : null}
            </div>

            <aside className="min-w-0 space-y-6 lg:col-span-4" aria-label="Activity">
              {setupPanel}

              <Panel
                title="Feedback per day"
                action={<span className="text-xs tabular-nums text-ink-muted">{pluralize(data.volume.thisWeek, "item")} in 7 days</span>}
                bodyClassName="px-4 py-4"
              >
                <WeekStrip days={data.volume.days} highlightIndex={data.volume.days.length - 1} unit="feedback items" />
              </Panel>

              <Panel title="Source health" bodyClassName="">
                {data.sources.length > 0 ? (
                  <SourceHealthList sources={data.sources} />
                ) : (
                  <EmptyState
                    headingLevel={3}
                    size="sm"
                    title="No sources yet"
                    description="Feedback still arrives from the widget and the extension."
                    action={
                      <Button asChild size="sm">
                        <Link href="/settings/sources">Add a source</Link>
                      </Button>
                    }
                  />
                )}
              </Panel>

              <Panel
                title="Recent runs"
                action={
                  data.recentRuns.length > 0 ? (
                    <Link href="/runs" className="focus-ring rounded-sm text-sm font-medium text-brand hover:underline">
                      All runs
                    </Link>
                  ) : undefined
                }
              >
                {data.recentRuns.length > 0 ? (
                  <ul className="divide-y divide-line">
                    {data.recentRuns.map((run) => (
                      <RunRow key={run.id} run={run} compact />
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-4 text-sm text-ink-muted">No runs yet.</p>
                )}
              </Panel>
            </aside>
          </div>
        )}
      </div>
    </RunProvider>
  );
}
