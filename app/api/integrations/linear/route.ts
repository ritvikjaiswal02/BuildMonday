import { HttpError, json, withRoute } from "@/lib/auth/http";
import { requireRole, requireUser } from "@/lib/auth/session";
import { toIntegrationDTO } from "@/lib/db/dto";
import { listLinearTeams } from "@/lib/integrations";
import { makeDeleteHandler } from "../_lib/handlers";
import { linearSchema, linearUpdateSchema } from "../_lib/rules";
import { assertIntegrationFeature, getIntegration, saveIntegration, upstreamError } from "../_lib/service";
import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { trackerCredential } from "@/lib/oauth/credentials";
import { eq } from "drizzle-orm";
import { parseBody } from "@/app/api/products/_lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = withRoute(async (req) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  await assertIntegrationFeature(ctx, "linear");
  const body = await parseBody(req, linearSchema);

  let teams: Array<{ id: string; name: string; key: string }>;
  try {
    teams = await listLinearTeams(body.apiKey);
  } catch (err) {
    throw upstreamError(err, "Linear did not accept that API key.");
  }
  const team = teams.find((t) => t.id === body.teamId);
  if (!team) {
    throw new HttpError(
      400,
      "invalid_request",
      "That team is not available to this API key. Load the teams again and pick one.",
    );
  }

  const row = await saveIntegration(
    ctx.workspace.id,
    "linear",
    { kind: "linear", teamId: team.id, teamName: team.name, teamKey: team.key, labelName: body.labelName ?? null, auth: "key" },
    body.apiKey,
  );
  return json({ integration: toIntegrationDTO(row) });
});

/** Changes the team or label of the saved connection without asking for the key again. */
export const PATCH = withRoute(async (req) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  await assertIntegrationFeature(ctx, "linear");
  const body = await parseBody(req, linearUpdateSchema);
  const row = await getIntegration(ctx.workspace.id, "linear");
  if (!row || row.config.kind !== "linear") throw new HttpError(404, "not_found", "Linear is not connected.");

  let teams: Array<{ id: string; name: string; key: string }>;
  try {
    teams = await listLinearTeams(await trackerCredential(row));
  } catch (err) {
    throw upstreamError(err, "Linear did not respond. Try again, or reconnect Linear.");
  }
  const team = teams.find((t) => t.id === body.teamId);
  if (!team) throw new HttpError(400, "invalid_request", "That team is not available to this connection.");

  const [updated] = await db
    .update(integrations)
    .set({
      config: {
        ...row.config,
        teamId: team.id,
        teamName: team.name,
        teamKey: team.key,
        labelName: body.labelName === undefined ? row.config.labelName : body.labelName,
      },
      status: "connected",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(integrations.id, row.id))
    .returning();
  return json({ integration: toIntegrationDTO(updated) });
});

export const DELETE = makeDeleteHandler("linear");
