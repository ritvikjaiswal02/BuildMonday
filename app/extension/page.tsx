import type { Metadata } from "next";
import { getActiveProduct, hasRole, listProducts, requirePageContext } from "@/lib/auth/session";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import { toProductDTO } from "@/lib/db/dto";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui";
import { clipUsage, listTokensForContext } from "@/app/api/extension/_lib/service";
import { loadCollectionActivity } from "./_lib/data";
import { ExtensionTabs, type ExtensionTab } from "./_components/ExtensionTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Extension and widget" };

export default async function ExtensionPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const ctx = await requirePageContext();
  const [products, active, planState, tokens, activity] = await Promise.all([
    listProducts(ctx.workspace.id),
    getActiveProduct(ctx),
    getWorkspacePlan(ctx.workspace.id),
    listTokensForContext(ctx),
    loadCollectionActivity(ctx.workspace.id),
  ]);
  const plan = planState.plan.id;
  const clips = await clipUsage(ctx.workspace.id, plan);
  const initialTab: ExtensionTab = searchParams?.tab === "widget" ? "widget" : "extension";

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Extension and widget"
        description="Collect feedback where it shows up: clip it from any page with the Chrome extension, or let visitors send it from your website."
      />
      <ExtensionTabs
        initialTab={initialTab}
        appUrl={env.APP_URL}
        plan={plan}
        isAdmin={hasRole(ctx, "admin")}
        tokens={tokens}
        clips={clips}
        products={products.map(toProductDTO)}
        activeProductId={active?.id ?? null}
        activity={activity}
        extensionId={env.NEXT_PUBLIC_EXTENSION_ID ?? null}
      />
    </div>
  );
}
