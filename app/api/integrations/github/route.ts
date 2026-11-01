import { HttpError, json, withRoute } from "@/lib/auth/http";
import { requireRole, requireUser } from "@/lib/auth/session";
import { toIntegrationDTO } from "@/lib/db/dto";
import { verifyGitHubRepo } from "@/lib/integrations";
import { makeDeleteHandler } from "../_lib/handlers";
import { githubSchema, githubUpdateSchema, parseRepoInput } from "../_lib/rules";
import { assertIntegrationFeature, getIntegration, saveIntegration, upstreamError } from "../_lib/service";
import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { trackerCredential } from "@/lib/oauth/credentials";
import { githubInstallationRepos } from "@/lib/oauth/providers";
import { eq } from "drizzle-orm";
import { parseBody } from "@/app/api/products/_lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = withRoute(async (req) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  await assertIntegrationFeature(ctx, "github");
  const body = await parseBody(req, githubSchema);

  const parsed = parseRepoInput(body.repo);
  if (!parsed) {
    throw new HttpError(400, "invalid_request", "Enter the repository as owner/name, like acme/notes.");
  }

  try {
    await verifyGitHubRepo(body.token, parsed.owner, parsed.repo);
  } catch (err) {
    throw upstreamError(
      err,
      "GitHub did not let this token open that repository. Check the token has Issues read and write access to it.",
    );
  }

  const row = await saveIntegration(
    ctx.workspace.id,
    "github",
    { kind: "github", owner: parsed.owner, repo: parsed.repo, labels: body.labels, auth: "token" },
    body.token,
  );
  return json({ integration: toIntegrationDTO(row) });
});

/** Changes the repository or labels of the saved connection without asking for the token again. */
export const PATCH = withRoute(async (req) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  await assertIntegrationFeature(ctx, "github");
  const body = await parseBody(req, githubUpdateSchema);
  const row = await getIntegration(ctx.workspace.id, "github");
  if (!row || row.config.kind !== "github") throw new HttpError(404, "not_found", "GitHub is not connected.");

  let owner = row.config.owner;
  let repo = row.config.repo;
  if (body.repo) {
    const parsed = parseRepoInput(body.repo);
    if (!parsed) throw new HttpError(400, "invalid_request", "Enter the repository as owner/name, like acme/notes.");
    try {
      if (row.config.auth === "app" && row.config.installationId) {
        const repos = await githubInstallationRepos(row.config.installationId);
        if (!repos.some((r) => r.owner === parsed.owner && r.repo === parsed.repo)) {
          throw new HttpError(
            400,
            "invalid_request",
            "The BuildMonday app cannot see that repository. Give it access in GitHub, then pick it here.",
          );
        }
      } else {
        await verifyGitHubRepo(await trackerCredential(row), parsed.owner, parsed.repo);
      }
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) throw err;
      throw upstreamError(err, "GitHub did not let this connection open that repository.");
    }
    owner = parsed.owner;
    repo = parsed.repo;
  }

  const [updated] = await db
    .update(integrations)
    .set({
      config: { ...row.config, owner, repo, labels: body.labels ?? row.config.labels },
      status: "connected",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(integrations.id, row.id))
    .returning();
  return json({ integration: toIntegrationDTO(updated) });
});

export const DELETE = makeDeleteHandler("github");
