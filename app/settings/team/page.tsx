import type { Metadata } from "next";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { TeamManager } from "@/components/settings/TeamManager";
import { countSeats, getMembers } from "@/lib/auth/workspace";
import { db } from "@/lib/db";
import { iso } from "@/lib/db/dto";
import { workspaceInvites } from "@/lib/db/schema";
import { limitFor } from "@/lib/plans";
import { loadSettingsContext } from "../_lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Team" };

export default async function TeamSettingsPage() {
  const { ctx, plan, isAdmin } = await loadSettingsContext();
  const [members, seatsUsed, inviteRows] = await Promise.all([
    getMembers(ctx.workspace.id),
    countSeats(ctx.workspace.id),
    isAdmin
      ? db
          .select()
          .from(workspaceInvites)
          .where(
            and(
              eq(workspaceInvites.workspaceId, ctx.workspace.id),
              isNull(workspaceInvites.acceptedAt),
              isNull(workspaceInvites.revokedAt),
              gt(workspaceInvites.expiresAt, new Date()),
            ),
          )
          .orderBy(desc(workspaceInvites.createdAt))
      : Promise.resolve([]),
  ]);

  return (
    <TeamManager
      members={members}
      invites={inviteRows.map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        expiresAt: iso(r.expiresAt),
        createdAt: iso(r.createdAt),
      }))}
      meId={ctx.user.id}
      myRole={ctx.role}
      plan={plan}
      seats={{ used: seatsUsed, max: limitFor(plan, "seats") }}
      workspaceName={ctx.workspace.name}
    />
  );
}
