import { json, withRoute } from "@/lib/auth/http";
import { requireRole, requireUser } from "@/lib/auth/session";
import { listLinearTeams } from "@/lib/integrations";
import { linearTeamsSchema } from "../../_lib/rules";
import { getIntegration, upstreamError } from "../../_lib/service";
import { HttpError } from "@/lib/auth/http";
import { trackerCredential } from "@/lib/oauth/credentials";
import { parseBody } from "@/app/api/products/_lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lists the teams a Linear API key can see, so the user can pick one before connecting. */
export const POST = withRoute(async (req) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const body = await parseBody(req, linearTeamsSchema);
  try {
    const teams = await listLinearTeams(body.apiKey);
    return json({ teams: teams.map((t) => ({ id: t.id, name: t.name, key: t.key })) });
  } catch (err) {
    throw upstreamError(
      err,
      "Linear did not accept that API key. Create a personal API key in Linear settings and try again.",
    );
  }
});

/** Lists the teams the saved Linear connection can see (for changing the team after connecting). */
export const GET = withRoute(async () => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const row = await getIntegration(ctx.workspace.id, "linear");
  if (!row) throw new HttpError(404, "not_found", "Linear is not connected.");
  try {
    const teams = await listLinearTeams(await trackerCredential(row));
    return json({ teams: teams.map((t) => ({ id: t.id, name: t.name, key: t.key })) });
  } catch (err) {
    throw upstreamError(err, "Linear did not respond. Try again, or reconnect Linear.");
  }
});
