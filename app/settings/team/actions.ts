"use server";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HttpError } from "@/lib/auth/http";
import { sendEmail } from "@/lib/auth/mailer";
import { requireRole, requireUser } from "@/lib/auth/session";
import { generateInviteToken } from "@/lib/auth/tokens";
import { countSeats } from "@/lib/auth/workspace";
import {
  assertFeature,
  assertWithinPlanLimit,
  getWorkspacePlan,
  withWorkspaceLimitLock,
} from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { iso, type InviteDTO } from "@/lib/db/dto";
import { ALERT_MODES, users, workspaceInvites, workspaceMembers, type AlertMode, type MemberRole } from "@/lib/db/schema";
import { absoluteUrl } from "@/lib/env";
import { actionError, type ActionResult } from "../_lib/action-result";
import { renderInviteEmail } from "./invite-email";

const INVITE_DAYS = 7;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254, "That email address is too long.");

const assignableRole = z.enum(["admin", "member"], {
  errorMap: () => ({ message: "Choose admin or member." }),
});

function revalidateTeam() {
  revalidatePath("/settings/team");
}

/**
 * Invites someone by email. Seats count members plus pending invites; the
 * admin role needs the team_members feature. Inviting an address that already
 * has a pending invite replaces it (and sends a fresh link).
 */
export async function inviteMemberAction(
  email: string,
  role: MemberRole,
): Promise<ActionResult<{ invite: InviteDTO; inviteUrl: string; emailSent: boolean }>> {
  try {
    const ctx = await requireUser();
    requireRole(ctx, "admin");
    const address = emailSchema.parse(email);
    const memberRole = assignableRole.parse(role);
    if (memberRole === "admin") await assertFeature(ctx.workspace.id, "team_members");

    const [existingMember] = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspace.id), sql`lower(${users.email}) = ${address}`))
      .limit(1);
    if (existingMember) throw new HttpError(409, "conflict", `${address} is already in this workspace.`);

    const now = new Date();
    // Replace a pending invite for the same address instead of using another seat.
    const pending = await db
      .select({ id: workspaceInvites.id })
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.workspaceId, ctx.workspace.id),
          sql`lower(${workspaceInvites.email}) = ${address}`,
          isNull(workspaceInvites.acceptedAt),
          isNull(workspaceInvites.revokedAt),
          gt(workspaceInvites.expiresAt, now),
        ),
      );

    const { token, hash } = generateInviteToken();
    const expiresAt = new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
    const planState = await getWorkspacePlan(ctx.workspace.id);

    const invite = await withWorkspaceLimitLock(ctx.workspace.id, async (tx) => {
      const seats = await countSeats(ctx.workspace.id, tx);
      assertWithinPlanLimit(planState.plan.id, "seats", seats - pending.length);
      for (const p of pending) {
        await tx.update(workspaceInvites).set({ revokedAt: now }).where(eq(workspaceInvites.id, p.id));
      }
      const [row] = await tx
        .insert(workspaceInvites)
        .values({
          workspaceId: ctx.workspace.id,
          email: address,
          role: memberRole,
          tokenHash: hash,
          invitedBy: ctx.user.id,
          expiresAt,
        })
        .returning();
      return row;
    });

    const inviteUrl = absoluteUrl(`/onboarding/invite/${token}`);
    const mail = renderInviteEmail({
      inviterName: ctx.user.name?.trim() || ctx.user.email,
      workspaceName: ctx.workspace.name,
      url: inviteUrl,
      role: memberRole,
      expiresInDays: INVITE_DAYS,
    });
    let emailSent = false;
    try {
      const sent = await sendEmail({
        to: address,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: ctx.user.email,
        tags: [{ name: "category", value: "team_invite" }],
      });
      emailSent = !sent.skipped;
    } catch (err) {
      console.warn("[team] invite email failed; the link can still be shared", err);
    }

    revalidateTeam();
    return {
      ok: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: iso(invite.expiresAt),
        createdAt: iso(invite.createdAt),
      },
      inviteUrl,
      emailSent,
    };
  } catch (err) {
    return actionError(err);
  }
}

export async function revokeInviteAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireUser();
    requireRole(ctx, "admin");
    const rows = await db
      .update(workspaceInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(workspaceInvites.id, String(id)),
          eq(workspaceInvites.workspaceId, ctx.workspace.id),
          isNull(workspaceInvites.acceptedAt),
          isNull(workspaceInvites.revokedAt),
        ),
      )
      .returning({ id: workspaceInvites.id });
    if (rows.length === 0) throw new HttpError(404, "not_found", "That invite was already used or revoked.");
    revalidateTeam();
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

async function memberRole(workspaceId: string, userId: string): Promise<MemberRole | null> {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

/** Admins remove members; anyone except the owner can remove themselves (leave). The owner cannot be removed. */
export async function removeMemberAction(userId: string): Promise<ActionResult<{ left: boolean }>> {
  try {
    const ctx = await requireUser();
    const target = String(userId);
    const leaving = target === ctx.user.id;
    if (!leaving) requireRole(ctx, "admin");
    const role = await memberRole(ctx.workspace.id, target);
    if (!role) throw new HttpError(404, "not_found", "That person is not in this workspace.");
    if (role === "owner") {
      throw new HttpError(403, "forbidden", "The workspace owner cannot be removed.");
    }
    if (role === "admin" && ctx.role !== "owner" && !leaving) {
      throw new HttpError(403, "forbidden", "Only the owner can remove an admin.");
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, ctx.workspace.id), eq(workspaceMembers.userId, target)));
      // Point the removed user back at a workspace they still belong to on their next request.
      await tx
        .update(users)
        .set({ activeWorkspaceId: null })
        .where(and(eq(users.id, target), eq(users.activeWorkspaceId, ctx.workspace.id)));
    });

    revalidateTeam();
    return { ok: true, left: leaving };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateMemberRoleAction(userId: string, role: MemberRole): Promise<ActionResult> {
  try {
    const ctx = await requireUser();
    requireRole(ctx, "admin");
    const next = assignableRole.parse(role);
    const target = String(userId);
    if (target === ctx.user.id) throw new HttpError(403, "forbidden", "You cannot change your own role.");
    const current = await memberRole(ctx.workspace.id, target);
    if (!current) throw new HttpError(404, "not_found", "That person is not in this workspace.");
    if (current === "owner") throw new HttpError(403, "forbidden", "The owner's role cannot be changed.");
    if (current === next) return { ok: true };
    if (next === "admin") await assertFeature(ctx.workspace.id, "team_members");
    if (current === "admin" && ctx.role !== "owner") {
      throw new HttpError(403, "forbidden", "Only the owner can change an admin's role.");
    }
    await db
      .update(workspaceMembers)
      .set({ role: next })
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspace.id), eq(workspaceMembers.userId, target)));
    revalidateTeam();
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

const notificationsSchema = z.object({
  notifyDigest: z.boolean(),
  alertMode: z.enum(ALERT_MODES),
});

/** The signed-in member's own Monday email and alert preferences. */
export async function updateMyNotificationsAction(input: {
  notifyDigest: boolean;
  alertMode: AlertMode;
}): Promise<ActionResult<{ notifyDigest: boolean; alertMode: AlertMode }>> {
  try {
    const ctx = await requireUser();
    const prefs = notificationsSchema.parse(input);
    await db
      .update(workspaceMembers)
      .set({ notifyDigest: prefs.notifyDigest, alertMode: prefs.alertMode })
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspace.id), eq(workspaceMembers.userId, ctx.user.id)));
    revalidatePath("/settings/alerts");
    return { ok: true, ...prefs };
  } catch (err) {
    return actionError(err);
  }
}
