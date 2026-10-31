import "server-only";

import { getActiveProduct, hasRole, requirePageContext, type SessionContext } from "@/lib/auth/session";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import type { Product } from "@/lib/db/schema";
import type { PlanId } from "@/lib/plans";

export interface SettingsContext {
  ctx: SessionContext;
  product: Product | null;
  plan: PlanId;
  isAdmin: boolean;
}

/** Session, active product, effective plan and admin flag for a settings page. */
export async function loadSettingsContext(): Promise<SettingsContext> {
  const ctx = await requirePageContext();
  const [product, planState] = await Promise.all([getActiveProduct(ctx), getWorkspacePlan(ctx.workspace.id)]);
  return { ctx, product, plan: planState.plan.id, isAdmin: hasRole(ctx, "admin") };
}
