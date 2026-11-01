import { json, withRoute } from "@/lib/auth/http";
import { requireRole, requireUser } from "@/lib/auth/session";
import { toSourceDTO } from "@/lib/db/dto";
import { updateSourceSchema } from "../_lib/schemas";
import { deleteSource, requireSource, updateSource } from "../_lib/service";
import { parseBody } from "@/app/api/products/_lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const PATCH = withRoute<Ctx>(async (req, { params }) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const { source } = await requireSource(ctx, params.id);
  const patch = await parseBody(req, updateSourceSchema);
  const updated = await updateSource(ctx, source, patch);
  return json({ source: toSourceDTO(updated) });
});

export const DELETE = withRoute<Ctx>(async (_req, { params }) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const { source } = await requireSource(ctx, params.id);
  await deleteSource(ctx, source);
  return json({ ok: true });
});
