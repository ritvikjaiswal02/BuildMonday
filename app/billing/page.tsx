import type { Metadata } from "next";
import { headers } from "next/headers";
import { BillingView } from "@/components/billing/BillingView";
import { parsePreselect } from "@/components/billing/preselect";
import type { BillingState } from "@/components/billing/types";
import { hasRole, requirePageContext } from "@/lib/auth/session";
import { detectCurrency } from "@/lib/billing/currency";
import { getUsageSummary, getWorkspacePlan } from "@/lib/billing/entitlements";
import { isBillingConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Billing" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageContext();
  const ws = ctx.workspace;

  const [planState, usage] = await Promise.all([getWorkspacePlan(ws.id), getUsageSummary(ws.id)]);

  const state: BillingState = {
    plan: planState.plan.id,
    storedPlan: ws.plan,
    status: planState.status,
    trialEndsAt: planState.trialEndsAt ? planState.trialEndsAt.toISOString() : null,
    interval: planState.interval,
    currency: planState.currency,
    currentPeriodEnd: planState.currentPeriodEnd ? planState.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: planState.cancelAtPeriodEnd,
    isPaid: planState.isPaid,
  };

  return (
    <BillingView
      workspaceName={ws.name}
      state={state}
      usage={usage}
      billingEnabled={isBillingConfigured()}
      canManage={hasRole(ctx, "admin")}
      suggestedCurrency={ws.planCurrency ?? detectCurrency(headers())}
      preselect={parsePreselect(searchParams)}
    />
  );
}
