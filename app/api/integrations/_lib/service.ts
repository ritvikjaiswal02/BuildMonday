import "server-only";

import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret, secretHint } from "@/lib/auth/crypto";
import { HttpError } from "@/lib/auth/http";
import type { SessionContext } from "@/lib/auth/session";
import { assertFeature } from "@/lib/billing/entitlements";
import { postSlackMessage } from "@/lib/alerts";
import { db } from "@/lib/db";
import { toIntegrationDTO, type IntegrationDTO } from "@/lib/db/dto";
import {
  integrations,
  products,
  type Integration,
  type IntegrationConfig,
  type IntegrationKind,
} from "@/lib/db/schema";
import { listLinearTeams, verifyGitHubRepo } from "@/lib/integrations";
import { trackerCredential } from "@/lib/oauth/credentials";
import { INTEGRATION_NAMES } from "./rules";

export const FEATURE_FOR: Record<IntegrationKind, "slack_alerts" | "auto_file"> = {
  slack: "slack_alerts",
  linear: "auto_file",
  github: "auto_file",
};

export async function getIntegration(workspaceId: string, kind: IntegrationKind): Promise<Integration | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, kind)))
    .limit(1);
  return row ?? null;
}

export async function listIntegrations(
  workspaceId: string,
): Promise<Record<IntegrationKind, IntegrationDTO | null>> {
  const rows = await db.select().from(integrations).where(eq(integrations.workspaceId, workspaceId));
  const out: Record<IntegrationKind, IntegrationDTO | null> = { slack: null, linear: null, github: null };
  for (const row of rows) out[row.kind] = toIntegrationDTO(row);
  return out;
}

/** Encrypts the secret and inserts or replaces the workspace's integration of that kind. */
export async function saveIntegration(
  workspaceId: string,
  kind: IntegrationKind,
  config: IntegrationConfig,
  secret: string,
): Promise<Integration> {
  const secretEncrypted = encryptSecret(secret);
  const hint = secretHint(secret);
  const [row] = await db
    .insert(integrations)
    .values({ workspaceId, kind, config, secretEncrypted, secretHint: hint, status: "connected", lastError: null })
    .onConflictDoUpdate({
      target: [integrations.workspaceId, integrations.kind],
      set: { config, secretEncrypted, secretHint: hint, status: "connected", lastError: null, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export function upstreamMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Turns any upstream failure into a 502 with a readable message. */
export function upstreamError(err: unknown, fallback: string): HttpError {
  if (err instanceof HttpError && err.status !== 500) {
    return err.status === 502 ? err : new HttpError(502, "upstream_failed", err.message);
  }
  return new HttpError(502, "upstream_failed", upstreamMessage(err, fallback));
}

/** Runs a live check against the provider and records the result on the row. */
export async function testIntegration(ctx: SessionContext, kind: IntegrationKind): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await getIntegration(ctx.workspace.id, kind);
  if (!row) {
    throw new HttpError(404, "not_found", `${INTEGRATION_NAMES[kind]} is not connected.`);
  }
  let error: string | null = null;
  try {
    const config = row.config;
    if (config.kind === "slack") {
      const secret = decryptSecret(row.secretEncrypted);
      await postSlackMessage(secret, {
        text: `Test message from BuildMonday. Alerts for ${ctx.workspace.name} will post here.`,
      });
    } else if (config.kind === "linear") {
      const teams = await listLinearTeams(await trackerCredential(row));
      if (!teams.some((t) => t.id === config.teamId)) {
        error = `The Linear team ${config.teamName} is no longer available to this API key. Reconnect Linear and choose a team.`;
      }
    } else if (config.kind === "github") {
      await verifyGitHubRepo(await trackerCredential(row), config.owner, config.repo);
    }
  } catch (err) {
    error =
      kind === "slack"
        ? `That Slack URL did not accept our test message. Check the webhook is still active in Slack. (${upstreamMessage(err, "No response")})`
        : upstreamMessage(err, `${INTEGRATION_NAMES[kind]} did not respond.`);
  }

  await db
    .update(integrations)
    .set({ status: error ? "error" : "connected", lastError: error, updatedAt: new Date() })
    .where(eq(integrations.id, row.id));

  return error ? { ok: false, error } : { ok: true };
}

/** Removes the integration; products that auto-file to it stop auto-filing. */
export async function deleteIntegration(ctx: SessionContext, kind: IntegrationKind): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(integrations)
      .where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.kind, kind)));
    if (kind === "linear" || kind === "github") {
      await tx
        .update(products)
        .set({ autofileEnabled: false })
        .where(and(eq(products.workspaceId, ctx.workspace.id), eq(products.autofileTarget, kind)));
    }
  });
}

export async function assertIntegrationFeature(ctx: SessionContext, kind: IntegrationKind): Promise<void> {
  await assertFeature(ctx.workspace.id, FEATURE_FOR[kind]);
}
