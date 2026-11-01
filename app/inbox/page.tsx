import * as React from "react";
import type { Metadata } from "next";
import { getActiveProduct, requirePageContext } from "@/lib/auth/session";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import { NoProductState } from "@/components/app/NoProductState";
import { InboxView } from "@/components/app/inbox/InboxView";
import { parseInboxFilters } from "@/components/app/inbox/inbox-utils";
import { listIssueOptions } from "@/components/app/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requirePageContext();
  const product = await getActiveProduct(ctx);
  if (!product) return <NoProductState title="Inbox" />;

  const [planState, issueOptions] = await Promise.all([
    getWorkspacePlan(ctx.workspace.id),
    listIssueOptions(product.id),
  ]);

  return (
    <InboxView
      key={product.id}
      productId={product.id}
      productName={product.name}
      plan={planState.plan.id}
      issues={issueOptions}
      initialFilters={parseInboxFilters(searchParams)}
    />
  );
}
