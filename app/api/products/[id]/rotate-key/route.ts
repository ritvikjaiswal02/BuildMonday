import { json, withRoute } from "@/lib/auth/http";
import { requireProduct, requireRole, requireUser } from "@/lib/auth/session";
import { rotatePublicKey } from "../../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute<{ params: { id: string } }>(async (_req, { params }) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const product = await requireProduct(ctx, params.id);
  const publicKey = await rotatePublicKey(ctx, product);
  return json({ publicKey });
});
