import { json, withRoute } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { listIntegrations } from "./_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const ctx = await requireUser();
  return json(await listIntegrations(ctx.workspace.id));
});
