import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ListOrdered, SearchX, Swords } from "lucide-react";
import { getActiveProduct, requirePageContext } from "@/lib/auth/session";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import { hasFeature } from "@/lib/plans";
import { pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ExportIssuesButton } from "@/components/app/ExportIssuesButton";
import { IssueFilters } from "@/components/app/IssueFilters";
import { isDefaultIssueFilters, parseIssueFilters } from "@/components/app/issue-filters";
import { IssueList } from "@/components/app/IssueList";
import { NoProductState } from "@/components/app/NoProductState";
import { RunNowButton } from "@/components/app/RunController";
import { listIssues } from "@/components/app/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Issues" };

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requirePageContext();
  const product = await getActiveProduct(ctx);
  if (!product) return <NoProductState title="Issues" />;

  const filters = parseIssueFilters(searchParams);
  const [result, planState] = await Promise.all([
    listIssues(product.id, filters),
    getWorkspacePlan(ctx.workspace.id),
  ]);
  const plan = planState.plan.id;
  const competitorView = filters.scope === "competitor";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Issues"
        description={
          competitorView
            ? "Problems people report in your competitors' reviews, ranked the same way as yours."
            : "Every issue BuildMonday has grouped from your feedback, with its trend across runs."
        }
        actions={<ExportIssuesButton productId={product.id} plan={plan} />}
      />

      <IssueFilters value={filters} counts={result.counts} />

      {result.issues.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted" aria-live="polite">
            {pluralize(result.issues.length, "issue")}
            {result.issues.length === 200 ? ", showing the first 200" : ""}
          </p>
          <IssueList
            items={result.issues}
            showFiled
            showCompetitor={competitorView}
            rankFallback={competitorView ? "index" : "none"}
            aria-label={competitorView ? "Competitor issues" : "Issues"}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface shadow-xs">
          {!isDefaultIssueFilters(filters) ? (
            <EmptyState
              icon={SearchX}
              title="No issues match these filters"
              description="Try another status or trend, or clear the search."
              action={
                <Button asChild>
                  <Link href={competitorView ? "/issues?scope=competitor" : "/issues"}>Clear filters</Link>
                </Button>
              }
            />
          ) : competitorView ? (
            <EmptyState
              icon={Swords}
              title="No competitor issues yet"
              description={
                hasFeature(plan, "competitor_tracking")
                  ? "Add a competitor's App Store, Google Play or Trustpilot page in Settings. Their complaints show up here after the next run."
                  : "Competitor tracking is on Pro and Team. Watch up to two competitors on Pro and see the complaints you could win on."
              }
              action={
                <Button asChild variant="primary">
                  <Link href={hasFeature(plan, "competitor_tracking") ? "/settings/sources" : "/billing?plan=pro&interval=month"}>
                    {hasFeature(plan, "competitor_tracking") ? "Add a competitor" : "See Pro"}
                  </Link>
                </Button>
              }
            />
          ) : result.total === 0 ? (
            <EmptyState
              icon={ListOrdered}
              title="No issues yet"
              description="Issues appear after a run groups your feedback. Run a check now or wait for the next scheduled run."
              action={<RunNowButton productId={product.id} />}
              secondaryAction={
                <Button asChild variant="ghost">
                  <Link href="/inbox">Open the inbox</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ListOrdered}
              title="Nothing open right now"
              description="Every issue is shipped, ignored or resolved. Switch the status filter to see them."
              action={
                <Button asChild>
                  <Link href="/issues?status=all">Show all statuses</Link>
                </Button>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
