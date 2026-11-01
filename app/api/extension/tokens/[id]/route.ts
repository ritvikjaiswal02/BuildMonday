import { json, withRoute } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { revokeTokenForContext } from "../../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute<{ params: { id: string } }>(async (_req, { params }) => {
  const ctx = await requireUser();
  await revokeTokenForContext(ctx, params.id);
  return json({ ok: true });
});
