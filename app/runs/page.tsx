import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { getActiveProduct, requirePageContext } from "@/lib/auth/session";
import { toProductDTO } from "@/lib/db/dto";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { NoProductState } from "@/components/app/NoProductState";
import { ActiveRunPanel, RunNowButton, RunProvider } from "@/components/app/RunController";
import { RunRow } from "@/components/app/RunRow";
import { scheduleMeta } from "@/components/app/format";
import { isRunActive } from "@/components/app/labels";
import { listRuns } from "@/components/app/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Runs" };

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requirePageContext();
  const product = await getActiveProduct(ctx);
  if (!product) return <NoProductState title="Runs" />;

  const beforeRaw = typeof searchParams.before === "string" ? searchParams.before : null;
  const before = beforeRaw ? new Date(beforeRaw) : null;
  const validBefore = before && !Number.isNaN(before.getTime()) ? before : null;
  const { runs, nextBefore } = await listRuns(product.id, { before: validBefore, limit: 25 });
  const active = !validBefore && runs[0] && isRunActive(runs[0].status) ? runs[0] : null;

  return (
    <RunProvider productId={product.id} initialRun={active}>
      <div className="space-y-6">
        <PageHeader
          title="Runs"
          description="Every time BuildMonday checked your sources: what it fetched, what was new and what changed."
          meta={scheduleMeta(toProductDTO(product)).map((part) => (
            <span key={part}>{part}</span>
          ))}
          actions={<RunNowButton productId={product.id} />}
        />

        <ActiveRunPanel />

        {runs.length > 0 ? (
          <div className="space-y-4">
            {validBefore ? (
              <p className="text-sm text-ink-muted">
                Showing older runs.{" "}
                <Link href="/runs" className="focus-ring rounded-sm font-medium text-brand hover:underline">
                  Back to the latest
                </Link>
              </p>
            ) : null}
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </ul>
            {nextBefore ? (
              <div className="flex justify-center">
                <Button asChild variant="secondary">
                  <Link href={`/runs?before=${encodeURIComponent(nextBefore)}`}>Show older runs</Link>
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-surface shadow-xs">
            <EmptyState
              icon={History}
              title={validBefore ? "No older runs" : "No runs yet"}
              description={
                validBefore
                  ? "That is the whole history for this product."
                  : "A run fetches your sources, saves new feedback, groups it into issues and compares with the last run."
              }
              action={
                validBefore ? (
                  <Button asChild>
                    <Link href="/runs">Back to the latest</Link>
                  </Button>
                ) : (
                  <RunNowButton productId={product.id} />
                )
              }
            />
          </div>
        )}
      </div>
    </RunProvider>
  );
}
