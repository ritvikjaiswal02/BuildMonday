import { z } from "zod";
import { json, withRoute } from "@/lib/auth/http";
import { absoluteUrl } from "@/lib/env";
import { startManualRun } from "@/app/api/runs/_lib/start";
import { parseBody } from "../_lib/parse";
import { extensionPreflight, withExtensionCors } from "../_lib/cors";
import { enforceTokenRateLimit, requireExtensionAuth, requireWorkspaceProduct } from "../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const METHODS = "POST, OPTIONS";
const bodySchema = z.object({ productId: z.string().min(1).max(64) });

/** "Group now" from the extension popup: starts a manual run and returns where to watch it. */
const handler = withRoute(async (req: Request) => {
  const { token, workspace } = await requireExtensionAuth(req);
  await enforceTokenRateLimit(token.id);
  const { productId } = await parseBody(req, bodySchema, { maxBytes: 4 * 1024 });
  const product = await requireWorkspaceProduct(workspace.id, productId);
  const run = await startManualRun(workspace.id, product.id);
  return json({ runId: run.id, runUrl: absoluteUrl(`/runs/${run.id}`) }, 202);
});

export async function POST(req: Request, ctx: { params: Record<string, string> }) {
  return withExtensionCors(req, await handler(req, ctx), METHODS);
}

export function OPTIONS(req: Request) {
  return extensionPreflight(req, METHODS);
}
