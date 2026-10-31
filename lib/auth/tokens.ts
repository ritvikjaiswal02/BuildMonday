import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { toApiTokenDTO, type ApiTokenDTO } from "@/lib/db/dto";
import { apiTokens, workspaceMembers, workspaces, type ApiToken, type Workspace } from "@/lib/db/schema";
import { randomToken, sha256Hex } from "./crypto";

export const EXTENSION_TOKEN_PREFIX = "bm_ext_";
export const PUBLIC_KEY_PREFIX = "pk_";

const LAST_USED_RESOLUTION_MS = 60 * 1000;

/** Creates an extension token. The plaintext is returned once and never stored. */
export async function createApiToken(args: {
  workspaceId: string;
  userId: string;
  name: string;
}): Promise<{ token: string; record: ApiTokenDTO }> {
  const token = `${EXTENSION_TOKEN_PREFIX}${randomToken(24)}`;
  const [row] = await db
    .insert(apiTokens)
    .values({
      workspaceId: args.workspaceId,
      userId: args.userId,
      name: args.name.trim().slice(0, 60) || "Chrome extension",
      tokenHash: sha256Hex(token),
      prefix: token.slice(0, 12),
    })
    .returning();
  return { token, record: toApiTokenDTO(row) };
}

/** Active (not revoked) tokens for the workspace, newest first. */
export async function listApiTokens(workspaceId: string): Promise<ApiTokenDTO[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.workspaceId, workspaceId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map(toApiTokenDTO);
}

/** Returns false when the token does not exist in this workspace or is already revoked. */
export async function revokeApiToken(workspaceId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.workspaceId, workspaceId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}

/** Extracts a well-formed extension token from an Authorization header value. */
export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (!token.startsWith(EXTENSION_TOKEN_PREFIX)) return null;
  if (token.length < EXTENSION_TOKEN_PREFIX.length + 16 || token.length > 128) return null;
  if (!/^[A-Za-z0-9_]+$/.test(token)) return null;
  return token;
}

/**
 * Authenticates "Authorization: Bearer bm_ext_...". Returns null for missing,
 * unknown or revoked tokens, and for tokens whose owner has left the workspace.
 * Updates lastUsedAt at most once per minute.
 */
export async function authenticateBearer(
  req: Request,
): Promise<{ token: ApiToken; workspace: Workspace; userId: string } | null> {
  const token = parseBearerToken(req.headers.get("authorization"));
  if (!token) return null;

  const rows = await db
    .select({ token: apiTokens, workspace: workspaces, memberRole: workspaceMembers.role })
    .from(apiTokens)
    .innerJoin(workspaces, eq(workspaces.id, apiTokens.workspaceId))
    .innerJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, apiTokens.workspaceId), eq(workspaceMembers.userId, apiTokens.userId)),
    )
    .where(and(eq(apiTokens.tokenHash, sha256Hex(token)), isNull(apiTokens.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const now = new Date();
  const lastUsed = row.token.lastUsedAt ? new Date(row.token.lastUsedAt).getTime() : 0;
  if (now.getTime() - lastUsed >= LAST_USED_RESOLUTION_MS) {
    try {
      await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.token.id));
      row.token.lastUsedAt = now;
    } catch (err) {
      // Never fail authentication because of a bookkeeping write.
      console.warn("[tokens] could not update lastUsedAt", err);
    }
  }

  return { token: row.token, workspace: row.workspace, userId: row.token.userId };
}

/** Widget public key: "pk_" + 24 base62 characters. */
export function generatePublicKey(): string {
  return `${PUBLIC_KEY_PREFIX}${randomToken(24)}`;
}

/** Invite token for the link in the email; only the hash is stored. */
export function generateInviteToken(): { token: string; hash: string } {
  const token = randomToken(32);
  return { token, hash: sha256Hex(token) };
}
