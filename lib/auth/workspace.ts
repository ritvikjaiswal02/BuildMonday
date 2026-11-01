import "server-only";

import { and, asc, count, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db, type DbExecutor } from "@/lib/db";
import { iso, type MemberDTO } from "@/lib/db/dto";
import {
  users,
  workspaceInvites,
  workspaceMembers,
  workspaces,
  type AlertMode,
  type Workspace,
} from "@/lib/db/schema";
import { randomToken } from "./crypto";
import { HttpError } from "./http";

/** "Ritvik Jaiswal" -> "Ritvik's workspace"; "ana@x.com" -> "Ana's workspace". */
export function personalWorkspaceName(user: { name: string | null; email: string | null }): string {
  const fromName = user.name?.trim().split(/\s+/)[0];
  let first = fromName && fromName.length > 0 ? fromName : null;
  if (!first && user.email) {
    const local = user.email.split("@")[0]?.split(/[._+-]/)[0] ?? "";
    if (local.length > 0) first = local.charAt(0).toUpperCase() + local.slice(1);
  }
  if (!first) return "My workspace";
  const trimmed = first.slice(0, 40);
  return /s$/i.test(trimmed) ? `${trimmed}' workspace` : `${trimmed}'s workspace`;
}

/** URL-safe slug with a random suffix, e.g. "ritvik-workspace-k3x9qa". */
export function workspaceSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "workspace"}-${randomToken(6).toLowerCase()}`;
}

/**
 * Idempotent: returns the workspace the user owns, creating it (with an owner
 * membership) on first call, and makes sure `users.activeWorkspaceId` points
 * at a workspace the user belongs to. Concurrent calls for the same user are
 * serialised with a transaction-scoped advisory lock.
 */
export async function ensurePersonalWorkspace(userId: string): Promise<Workspace> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bm:ws:${userId}`}))`);

    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new HttpError(404, "not_found", "User not found.");

    const owned = await tx
      .select({ workspace: workspaces })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, userId)),
      )
      .where(eq(workspaces.ownerId, userId))
      .orderBy(asc(workspaces.createdAt))
      .limit(1);

    let workspace = owned[0]?.workspace;

    if (!workspace) {
      const name = personalWorkspaceName(user);
      const [created] = await tx
        .insert(workspaces)
        .values({
          name,
          slug: workspaceSlug(name),
          ownerId: userId,
          plan: "free",
          planStatus: "none",
          // Reverse trial: 14 days of Pro, no card. Mirrors TRIAL_MS in lib/billing/entitlements.
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        })
        .returning();
      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: created.id, userId, role: "owner" })
        .onConflictDoNothing();
      workspace = created;
    }

    // Point the user at a workspace they belong to.
    let activeIsValid = false;
    if (user.activeWorkspaceId) {
      const [membership] = await tx
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, user.activeWorkspaceId), eq(workspaceMembers.userId, userId)))
        .limit(1);
      activeIsValid = Boolean(membership);
    }
    if (!activeIsValid) {
      await tx.update(users).set({ activeWorkspaceId: workspace.id }).where(eq(users.id, userId));
    }

    return workspace;
  });
}

/** Members of a workspace, owners first, then by join date. */
export async function getMembers(workspaceId: string): Promise<MemberDTO[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      role: workspaceMembers.role,
      notifyDigest: workspaceMembers.notifyDigest,
      alertMode: workspaceMembers.alertMode,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(
      sql`case ${workspaceMembers.role} when 'owner' then 0 when 'admin' then 1 else 2 end`,
      asc(workspaceMembers.createdAt),
    );
  return rows.map((r) => ({ ...r, joinedAt: iso(r.joinedAt) }));
}

/** Members plus pending invites (not accepted, revoked or expired). */
export async function countSeats(workspaceId: string, executor: DbExecutor = db): Promise<number> {
  const [members] = await executor
    .select({ n: count() })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  const [pending] = await executor
    .select({ n: count() })
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        isNull(workspaceInvites.acceptedAt),
        isNull(workspaceInvites.revokedAt),
        gt(workspaceInvites.expiresAt, new Date()),
      ),
    );
  return Number(members?.n ?? 0) + Number(pending?.n ?? 0);
}

/**
 * Email recipients for a workspace.
 * digest: members with notifyDigest = true. alerts: members whose alertMode is not "off".
 */
export async function getWorkspaceRecipients(
  workspaceId: string,
  kind: "digest" | "alerts",
): Promise<Array<{ email: string; name: string | null; alertMode: AlertMode }>> {
  const condition =
    kind === "digest"
      ? and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.notifyDigest, true))
      : and(eq(workspaceMembers.workspaceId, workspaceId), ne(workspaceMembers.alertMode, "off"));
  const rows = await db
    .select({ email: users.email, name: users.name, alertMode: workspaceMembers.alertMode })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(condition)
    .orderBy(asc(workspaceMembers.createdAt));
  return rows.filter((r) => Boolean(r.email));
}
