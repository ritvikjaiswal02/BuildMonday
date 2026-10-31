"use server";

import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_PRODUCT_COOKIE } from "@/lib/auth/cookies";
import { HttpError } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users, workspaceInvites, workspaceMembers } from "@/lib/db/schema";
import { actionError, type ActionResult } from "@/app/settings/_lib/action-result";
import { lookupInvite } from "./lookup";

/**
 * Accepts an invite for the signed-in user: adds the membership, marks the
 * invite used, switches the user to that workspace and skips onboarding (the
 * workspace is already set up). Redirects to the dashboard on success.
 */
export async function acceptInviteAction(token: string): Promise<ActionResult> {
  try {
    const ctx = await requireUser();
    const invite = await lookupInvite(String(token));
    if (invite.status === "accepted") {
      const [member] = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, ctx.user.id)))
        .limit(1);
      if (!member) throw new HttpError(409, "conflict", "This invite was already used.");
    } else if (invite.status !== "valid") {
      throw new HttpError(404, "not_found", "This invite is no longer valid. Ask for a new one.");
    } else {
      if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase()) {
        throw new HttpError(403, "forbidden", "This invite was sent to a different email address.");
      }
      const now = new Date();
      await db.transaction(async (tx) => {
        const used = await tx
          .update(workspaceInvites)
          .set({ acceptedAt: now })
          .where(
            and(
              eq(workspaceInvites.id, invite.inviteId),
              isNull(workspaceInvites.acceptedAt),
              isNull(workspaceInvites.revokedAt),
            ),
          )
          .returning({ id: workspaceInvites.id });
        if (used.length === 0) throw new HttpError(409, "conflict", "This invite was already used.");
        await tx
          .insert(workspaceMembers)
          .values({ workspaceId: invite.workspaceId, userId: ctx.user.id, role: invite.role })
          .onConflictDoNothing();
        await tx
          .update(users)
          .set({ activeWorkspaceId: invite.workspaceId, ...(ctx.user.onboardedAt ? {} : { onboardedAt: now }) })
          .where(eq(users.id, ctx.user.id));
      });
    }
    cookies().delete(ACTIVE_PRODUCT_COOKIE);
  } catch (err) {
    return actionError(err);
  }
  redirect("/dashboard");
}
