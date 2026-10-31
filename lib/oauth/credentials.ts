import "server-only";

import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret, secretHint } from "@/lib/auth/crypto";
import { db } from "@/lib/db";
import { integrations, type Integration } from "@/lib/db/schema";
import {
  githubInstallationToken,
  parseLinearToken,
  refreshLinearToken,
  serializeLinearToken,
} from "./providers";

/** Refresh a Linear OAuth token when it expires within this window. */
const REFRESH_EARLY_MS = 5 * 60 * 1000;

/**
 * The value to authenticate a tracker call with, for any way the integration
 * was connected:
 *
 * - Linear, pasted key: the key (sent as-is in `Authorization`).
 * - Linear, OAuth: `Bearer <access token>`, refreshed and re-saved when it is
 *   about to expire.
 * - GitHub, pasted token: the token.
 * - GitHub App: a fresh one-hour installation token.
 *
 * lib/integrations passes Linear values straight into the `Authorization`
 * header and prefixes GitHub values with `Bearer`, so callers do not care
 * which kind they got.
 */
export async function trackerCredential(row: Integration): Promise<string> {
  const config = row.config;
  if (config.kind === "github" && config.auth === "app" && config.installationId) {
    return githubInstallationToken(config.installationId);
  }
  const secret = decryptSecret(row.secretEncrypted);
  if (config.kind === "linear" && config.auth === "oauth") {
    const token = parseLinearToken(secret);
    if (!token) throw new Error("The Linear connection is incomplete. Connect Linear again.");
    if (token.expiresAt && token.refresh && token.expiresAt - REFRESH_EARLY_MS < Date.now()) {
      const fresh = await refreshLinearToken(token.refresh);
      const next = { ...fresh, refresh: fresh.refresh ?? token.refresh };
      const serialized = serializeLinearToken(next);
      await db
        .update(integrations)
        .set({ secretEncrypted: encryptSecret(serialized), secretHint: secretHint(next.access), updatedAt: new Date() })
        .where(eq(integrations.id, row.id));
      return `Bearer ${next.access}`;
    }
    return `Bearer ${token.access}`;
  }
  return secret;
}

/** The Slack webhook URL (Slack integrations store it as the secret either way). */
export function slackWebhook(row: Integration): string {
  return decryptSecret(row.secretEncrypted);
}
