import { json, withRoute } from "@/lib/auth/http";
import { ingestFeedback } from "@/lib/feedback/ingest";
import { absoluteUrl } from "@/lib/env";
import { MAX_CLIP_BYTES, clipBodySchema, toIngestItems } from "../_lib/clip";
import { parseBody } from "../_lib/parse";
import { extensionPreflight, withExtensionCors } from "../_lib/cors";
import {
  enforceTokenRateLimit,
  quotaError,
  requireExtensionAuth,
  requireWorkspaceProduct,
} from "../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "POST, OPTIONS";

const handler = withRoute(async (req: Request) => {
  const { token, workspace, userId } = await requireExtensionAuth(req);
  await enforceTokenRateLimit(token.id);

  const body = await parseBody(req, clipBodySchema, { maxBytes: MAX_CLIP_BYTES });
  const product = await requireWorkspaceProduct(workspace.id, body.productId);

  const result = await ingestFeedback({
    workspaceId: workspace.id,
    productId: product.id,
    channel: "extension",
    items: toIngestItems(body.items, { userId }),
    quotaMetric: "extension_clips_per_month",
  });

  if (result.quotaExceeded && result.inserted === 0) {
    throw await quotaError(workspace.id);
  }

  return json(
    {
      inserted: result.inserted,
      duplicates: result.duplicates,
      rejected: result.rejected,
      quotaExceeded: result.quotaExceeded,
      matched: result.matched ?? 0,
      product: { id: product.id, name: product.name },
      inboxUrl: absoluteUrl("/inbox"),
    },
    201,
  );
});

export async function POST(req: Request, ctx: { params: Record<string, string> }) {
  return withExtensionCors(req, await handler(req, ctx), METHODS);
}

export function OPTIONS(req: Request) {
  return extensionPreflight(req, METHODS);
}
