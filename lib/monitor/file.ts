import "server-only";

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { HttpError } from "@/lib/auth/http";
import { assertFeature } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { integrations, issues, type IntegrationConfig, type TrackerTarget } from "@/lib/db/schema";
import { absoluteUrl } from "@/lib/env";
import { buildIssueMarkdown, createGitHubIssue, createLinearIssue } from "@/lib/integrations";
import { trackerCredential } from "@/lib/oauth/credentials";
import { rowPrd, rowToAnalysisIssue } from "./mappers";

const TARGET_NAME: Record<TrackerTarget, string> = { linear: "Linear", github: "GitHub" };

/** A filing claim older than this is treated as abandoned (the process died mid-call) and can be retried. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

/**
 * Files one stored issue to Linear or GitHub using the workspace's saved
 * integration. The same code path serves the manual "File to ..." button and
 * auto-filing during runs.
 *
 * The issue is claimed (filedAt set while externalId is still empty) before
 * the tracker is called, so a double click or a manual file during an
 * auto-file run cannot create the same issue twice. The claim is released if
 * the tracker call fails.
 *
 * Errors: 402 without `auto_file`; 400 when the integration is not connected;
 * 409 when the issue was already filed or is being filed; 502 when the
 * tracker rejects it.
 */
export async function fileIssue(
  issueId: string,
  target: TrackerTarget,
): Promise<{ externalId: string; externalUrl: string }> {
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) throw new HttpError(404, "not_found", "Issue not found.");

  await assertFeature(issue.workspaceId, "auto_file");

  if (issue.externalId) {
    throw new HttpError(409, "conflict", `This issue is already filed${issue.externalUrl ? ` at ${issue.externalUrl}` : ""}.`, {
      externalUrl: issue.externalUrl,
    });
  }

  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, issue.workspaceId), eq(integrations.kind, target)))
    .limit(1);
  if (!integration) {
    throw new HttpError(400, "invalid_request", `Connect ${TARGET_NAME[target]} in Settings first.`);
  }

  const now = new Date();
  const [claimed] = await db
    .update(issues)
    .set({ filedAt: now, externalTarget: target })
    .where(
      and(
        eq(issues.id, issue.id),
        isNull(issues.externalId),
        or(isNull(issues.filedAt), lt(issues.filedAt, new Date(now.getTime() - STALE_CLAIM_MS))),
      ),
    )
    .returning({ id: issues.id });
  if (!claimed) throw new HttpError(409, "conflict", "This issue is already being filed.");

  const release = () =>
    db
      .update(issues)
      .set({ filedAt: null, externalTarget: null })
      .where(and(eq(issues.id, issue.id), isNull(issues.externalId)))
      .catch((err) => console.error(`[file] could not release the filing claim on ${issue.id}`, err));

  const md = buildIssueMarkdown(rowToAnalysisIssue(issue), rowPrd(issue), issue.status, {
    link: absoluteUrl(`/issues/${issue.id}`),
  });

  let externalId: string;
  let externalUrl: string;
  try {
    const config = integration.config as IntegrationConfig;
    const credential = await trackerCredential(integration);
    if (target === "linear") {
      if (config.kind !== "linear") throw new Error("The Linear connection is incomplete. Reconnect Linear in Settings.");
      const created = await createLinearIssue({
        apiKey: credential,
        teamId: config.teamId,
        title: issue.title,
        description: md.body,
        labelName: config.labelName,
      });
      externalId = created.identifier || created.id;
      externalUrl = created.url;
    } else {
      if (config.kind !== "github") throw new Error("The GitHub connection is incomplete. Reconnect GitHub in Settings.");
      const created = await createGitHubIssue({
        token: credential,
        owner: config.owner,
        repo: config.repo,
        title: issue.title,
        body: md.body,
        labels: config.labels,
      });
      externalId = String(created.number);
      externalUrl = created.url;
    }
  } catch (err) {
    await release();
    const message = err instanceof Error && err.message ? err.message : `${TARGET_NAME[target]} rejected the issue.`;
    await db
      .update(integrations)
      .set({ status: "error", lastError: message })
      .where(eq(integrations.id, integration.id));
    throw new HttpError(502, "upstream_failed", message);
  }

  if (integration.status !== "connected" || integration.lastError) {
    await db.update(integrations).set({ status: "connected", lastError: null }).where(eq(integrations.id, integration.id));
  }
  await db
    .update(issues)
    .set({ externalTarget: target, externalId, externalUrl, filedAt: new Date() })
    .where(and(eq(issues.id, issue.id), isNull(issues.externalId)));

  return { externalId, externalUrl };
}
