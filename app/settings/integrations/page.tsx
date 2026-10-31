import type { Metadata } from "next";
import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel";
import { listIntegrations } from "@/app/api/integrations/_lib/service";
import { oauthAvailability } from "@/lib/oauth/providers";
import { loadSettingsContext } from "../_lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsSettingsPage() {
  const { ctx, plan, isAdmin } = await loadSettingsContext();
  const integrations = await listIntegrations(ctx.workspace.id);
  return <IntegrationsPanel integrations={integrations} plan={plan} canEdit={isAdmin} oauth={oauthAvailability()} />;
}
