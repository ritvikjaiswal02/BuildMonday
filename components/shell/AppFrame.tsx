import "server-only";

import * as React from "react";
import {
  getActiveProduct,
  listProducts,
  listUserWorkspaces,
  requirePageContext,
} from "@/lib/auth/session";
import { getWorkspacePlan, trialDaysLeft } from "@/lib/billing/entitlements";
import { AppShell } from "./AppShell";

/**
 * Server wrapper for every authenticated route-group layout:
 * `export default function Layout({ children }) { return <AppFrame>{children}</AppFrame>; }`
 *
 * Redirects to /login (signed out or platform not configured) or /onboarding (not onboarded)
 * via requirePageContext, then loads the data the shell needs in parallel.
 */
export async function AppFrame({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageContext();

  const [products, activeProduct, planState, workspaces] = await Promise.all([
    listProducts(ctx.workspace.id),
    getActiveProduct(ctx),
    getWorkspacePlan(ctx.workspace.id),
    listUserWorkspaces(ctx.user.id),
  ]);

  return (
    <AppShell
      user={{
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        image: ctx.user.image,
      }}
      workspace={{ id: ctx.workspace.id, name: ctx.workspace.name }}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
      products={products.map((p) => ({ id: p.id, name: p.name }))}
      activeProductId={activeProduct?.id ?? null}
      plan={planState.plan.id}
      trialDaysLeft={planState.status === "trialing" ? trialDaysLeft(planState.trialEndsAt) : null}
    >
      {children}
    </AppShell>
  );
}
