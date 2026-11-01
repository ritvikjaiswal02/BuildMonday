import "server-only";

import { eq } from "drizzle-orm";
import { sha256Hex } from "@/lib/auth/crypto";
import { db } from "@/lib/db";
import { users, workspaceInvites, workspaces, type MemberRole } from "@/lib/db/schema";

export type InviteState =
  | { status: "invalid" }
  | { status: "revoked" }
  | { status: "expired"; workspaceName: string }
  | { status: "accepted"; workspaceId: string; workspaceName: string }
  | {
      status: "valid";
      inviteId: string;
      workspaceId: string;
      workspaceName: string;
      inviterName: string;
      email: string;
      role: MemberRole;
      expiresAt: Date;
    };

const TOKEN_RE = /^[A-Za-z0-9]{16,128}$/;

/** Resolves an invite link token (only its sha256 is stored). */
export async function lookupInvite(token: string, now: Date = new Date()): Promise<InviteState> {
  if (!TOKEN_RE.test(token)) return { status: "invalid" };
  const [row] = await db
    .select({
      invite: workspaceInvites,
      workspaceName: workspaces.name,
      inviterName: users.name,
      inviterEmail: users.email,
    })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
    .innerJoin(users, eq(users.id, workspaceInvites.invitedBy))
    .where(eq(workspaceInvites.tokenHash, sha256Hex(token)))
    .limit(1);

  if (!row) return { status: "invalid" };
  const { invite } = row;
  if (invite.acceptedAt) {
    return { status: "accepted", workspaceId: invite.workspaceId, workspaceName: row.workspaceName };
  }
  if (invite.revokedAt) return { status: "revoked" };
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) {
    return { status: "expired", workspaceName: row.workspaceName };
  }
  return {
    status: "valid",
    inviteId: invite.id,
    workspaceId: invite.workspaceId,
    workspaceName: row.workspaceName,
    inviterName: row.inviterName?.trim() || row.inviterEmail,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  };
}

/** "ritvik@acme.com" -> "r•••••@acme.com", so a forwarded link does not reveal the full address. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const first = local.charAt(0);
  return `${first}${"•".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}
