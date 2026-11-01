import { githubInstallationRepos, verifyGitHubInstallationForUser } from "@/lib/oauth/providers";
import { finishOAuth } from "../../../_lib/oauth";
import { getIntegration, saveIntegration } from "../../../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GitHub sends the browser here after the app is installed, with
 * `installation_id` and (because the app requests user authorization during
 * installation) a `code` that proves which GitHub user installed it.
 */
export function GET(req: Request) {
  return finishOAuth(req, "github", async (ctx, params) => {
    const installationId = Number(params.get("installation_id"));
    if (!Number.isSafeInteger(installationId) || installationId <= 0) {
      throw new Error("GitHub did not say where the app was installed. Install it again.");
    }
    const code = params.get("code");
    if (!code) {
      throw new Error(
        "GitHub did not confirm who installed the app. In the GitHub App settings, turn on \"Request user authorization (OAuth) during installation\".",
      );
    }
    await verifyGitHubInstallationForUser(code, installationId);

    const repos = await githubInstallationRepos(installationId);
    if (repos.length === 0) {
      throw new Error("The app cannot see a repository with issues turned on. Give it access to one and try again.");
    }
    const previous = await getIntegration(ctx.workspace.id, "github");
    const prevConfig = previous?.config.kind === "github" ? previous.config : null;
    const repo = repos.find((r) => r.owner === prevConfig?.owner && r.repo === prevConfig?.repo) ?? repos[0];
    await saveIntegration(
      ctx.workspace.id,
      "github",
      {
        kind: "github",
        owner: repo.owner,
        repo: repo.repo,
        labels: prevConfig?.labels ?? ["from-users"],
        auth: "app",
        installationId,
      },
      String(installationId),
    );
  });
}
