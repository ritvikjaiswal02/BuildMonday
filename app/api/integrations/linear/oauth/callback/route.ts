import { listLinearTeams } from "@/lib/integrations";
import { exchangeLinearCode, serializeLinearToken } from "@/lib/oauth/providers";
import { finishOAuth } from "../../../_lib/oauth";
import { getIntegration, saveIntegration } from "../../../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Linear sends the browser here with `code`. The token is stored encrypted
 * and the integration starts on the team picked before (when reconnecting) or
 * the first team alphabetically; Settings lets people change it.
 */
export function GET(req: Request) {
  return finishOAuth(req, "linear", async (ctx, params) => {
    const code = params.get("code");
    if (!code) throw new Error("Linear did not send a code back. Try connecting again.");
    const token = await exchangeLinearCode(code);
    const teams = await listLinearTeams(`Bearer ${token.access}`);
    if (teams.length === 0) throw new Error("This Linear workspace has no teams BuildMonday can file to.");
    const previous = await getIntegration(ctx.workspace.id, "linear");
    const prevConfig = previous?.config.kind === "linear" ? previous.config : null;
    const team = teams.find((t) => t.id === prevConfig?.teamId) ?? teams[0];
    await saveIntegration(
      ctx.workspace.id,
      "linear",
      {
        kind: "linear",
        teamId: team.id,
        teamName: team.name,
        teamKey: team.key,
        labelName: prevConfig?.labelName ?? null,
        auth: "oauth",
      },
      serializeLinearToken(token),
    );
  });
}
