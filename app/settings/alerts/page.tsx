import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { AlertsSettings } from "@/components/settings/AlertsSettings";
import { db } from "@/lib/db";
import { toProductDTO } from "@/lib/db/dto";
import { integrations, workspaceMembers } from "@/lib/db/schema";
import { loadSettingsContext } from "../_lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Alerts and filing" };

export default async function AlertsSettingsPage() {
  const { ctx, product, plan, isAdmin } = await loadSettingsContext();

  const [[member], connectedRows] = await Promise.all([
    db
      .select({ notifyDigest: workspaceMembers.notifyDigest, alertMode: workspaceMembers.alertMode })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspace.id), eq(workspaceMembers.userId, ctx.user.id)))
      .limit(1),
    db
      .select({ kind: integrations.kind })
      .from(integrations)
      .where(eq(integrations.workspaceId, ctx.workspace.id)),
  ]);
  const kinds = new Set(connectedRows.map((r) => r.kind));

  return (
    <AlertsSettings
      product={product ? toProductDTO(product) : null}
      plan={plan}
      canEdit={isAdmin}
      me={{ notifyDigest: member?.notifyDigest ?? true, alertMode: member?.alertMode ?? "serious" }}
      connected={{ linear: kinds.has("linear"), github: kinds.has("github") }}
      slackConnected={kinds.has("slack")}
    />
  );
}
