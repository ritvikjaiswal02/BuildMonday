import "server-only";

import { errorResponse, json, withRoute } from "@/lib/auth/http";
import { requireRole, requireUser } from "@/lib/auth/session";
import type { IntegrationKind } from "@/lib/db/schema";
import { deleteIntegration, testIntegration } from "./service";

/** POST /api/integrations/<kind>/test: `{ ok: true }` or 502 `{ error }`; updates status and lastError. */
export function makeTestHandler(kind: IntegrationKind) {
  return withRoute(async () => {
    const ctx = await requireUser();
    requireRole(ctx, "admin");
    const result = await testIntegration(ctx, kind);
    if (!result.ok) return errorResponse(502, "upstream_failed", result.error);
    return json({ ok: true });
  });
}

/** DELETE /api/integrations/<kind>. */
export function makeDeleteHandler(kind: IntegrationKind) {
  return withRoute(async () => {
    const ctx = await requireUser();
    requireRole(ctx, "admin");
    await deleteIntegration(ctx, kind);
    return json({ ok: true });
  });
}
