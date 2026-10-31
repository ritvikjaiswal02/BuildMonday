import { eq } from "drizzle-orm";
import { json, withRoute } from "@/lib/auth/http";
import { listProducts } from "@/lib/auth/session";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { absoluteUrl } from "@/lib/env";
import { extensionPreflight, withExtensionCors } from "../_lib/cors";
import { clipUsage, enforceTokenRateLimit, requireExtensionAuth } from "../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "GET, OPTIONS";

const handler = withRoute(async (req: Request) => {
  const { token, workspace, userId } = await requireExtensionAuth(req);
  await enforceTokenRateLimit(token.id);

  const [[user], planState, productRows] = await Promise.all([
    db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
    getWorkspacePlan(workspace.id),
    listProducts(workspace.id),
  ]);
  const clips = await clipUsage(workspace.id, planState.plan.id);

  return json({
    user: { email: user?.email ?? "", name: user?.name ?? null },
    workspace: { id: workspace.id, name: workspace.name, plan: planState.plan.id },
    products: productRows.map((p) => ({ id: p.id, name: p.name })),
    clips,
    inboxUrl: absoluteUrl("/inbox"),
  });
});

export async function GET(req: Request, ctx: { params: Record<string, string> }) {
  return withExtensionCors(req, await handler(req, ctx), METHODS);
}

export function OPTIONS(req: Request) {
  return extensionPreflight(req, METHODS);
}
