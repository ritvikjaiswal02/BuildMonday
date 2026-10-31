import { HttpError, json, withRoute } from "@/lib/auth/http";
import { requireProduct, requireRole, requireUser } from "@/lib/auth/session";
import { toSourceDTO } from "@/lib/db/dto";
import { createSourceSchema } from "./_lib/schemas";
import { createSource, listProductSources, resolveSourceLocator } from "./_lib/service";
import { parseBody } from "@/app/api/products/_lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req) => {
  const ctx = await requireUser();
  const productId = new URL(req.url).searchParams.get("productId");
  if (!productId) throw new HttpError(400, "invalid_request", "productId is required.");
  const product = await requireProduct(ctx, productId);
  const rows = await listProductSources(ctx.workspace.id, product.id);
  return json({ sources: rows.map(toSourceDTO) });
});

export const POST = withRoute(async (req) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const body = await parseBody(req, createSourceSchema);
  const product = await requireProduct(ctx, body.productId);
  const { kind, config } = resolveSourceLocator("url" in body ? { url: body.url } : { kind: body.kind, config: body.config });
  const source = await createSource(ctx, product, {
    kind,
    config,
    role: body.role ?? "own",
    competitorName: body.competitorName ?? null,
  });
  return json({ source: toSourceDTO(source) }, 201);
});
