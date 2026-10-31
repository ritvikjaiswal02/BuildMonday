import { requireRole, requireUser, listProducts } from "@/lib/auth/session";
import { json, withRoute } from "@/lib/auth/http";
import { toProductDTO } from "@/lib/db/dto";
import { createProductSchema } from "./_lib/rules";
import { createProduct } from "./_lib/service";
import { parseBody } from "./_lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const ctx = await requireUser();
  const rows = await listProducts(ctx.workspace.id);
  return json({ products: rows.map(toProductDTO) });
});

export const POST = withRoute(async (req) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const body = await parseBody(req, createProductSchema);
  const product = await createProduct(ctx, {
    name: body.name,
    websiteUrl: body.websiteUrl ?? null,
    description: body.description ?? null,
  });
  return json({ product: toProductDTO(product) }, 201);
});
