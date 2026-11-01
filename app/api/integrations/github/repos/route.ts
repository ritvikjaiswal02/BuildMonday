import { HttpError, json, withRoute } from "@/lib/auth/http";
import { requireRole, requireUser } from "@/lib/auth/session";
import { githubInstallationRepos } from "@/lib/oauth/providers";
import { getIntegration, upstreamError } from "../../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Repositories the installed BuildMonday GitHub App can file to. */
export const GET = withRoute(async () => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const row = await getIntegration(ctx.workspace.id, "github");
  if (!row || row.config.kind !== "github") throw new HttpError(404, "not_found", "GitHub is not connected.");
  if (row.config.auth !== "app" || !row.config.installationId) {
    throw new HttpError(400, "invalid_request", "This GitHub connection uses a token. Type the repository instead.");
  }
  try {
    const repos = await githubInstallationRepos(row.config.installationId);
    return json({ repos: repos.map((r) => ({ fullName: r.fullName, private: r.private })) });
  } catch (err) {
    throw upstreamError(err, "GitHub did not list the repositories. Try again.");
  }
});
