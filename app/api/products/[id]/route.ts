import { and, asc, eq } from "drizzle-orm";
import { json, withRoute } from "@/lib/auth/http";
import { requireProduct, requireRole, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { toProductDTO, toSourceDTO } from "@/lib/db/dto";
import { sources } from "@/lib/db/schema";
import { productPatchSchema } from "../_lib/rules";
import { archiveProduct, productCounts, updateProduct } from "../_lib/service";
import { parseBody } from "../_lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = withRoute<Ctx>(async (_req, { params }) => {
  const ctx = await requireUser();
  const product = await requireProduct(ctx, params.id);
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(sources)
      .where(and(eq(sources.productId, product.id), eq(sources.workspaceId, ctx.workspace.id)))
      .orderBy(asc(sources.createdAt)),
    productCounts(product.id),
  ]);
  return json({ product: toProductDTO(product), sources: rows.map(toSourceDTO), counts });
});

export const PATCH = withRoute<Ctx>(async (req, { params }) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const product = await requireProduct(ctx, params.id);
  const patch = await parseBody(req, productPatchSchema);
  const updated = await updateProduct(ctx, product, patch);
  return json({ product: toProductDTO(updated) });
});

export const DELETE = withRoute<Ctx>(async (_req, { params }) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const product = await requireProduct(ctx, params.id);
  await archiveProduct(ctx, product);
  return json({ ok: true });
});
