import "server-only";

import { and, eq } from "drizzle-orm";
import { HttpError } from "@/lib/auth/http";
import type { SessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { issues, type Issue as IssueRow } from "@/lib/db/schema";

/** The issue if it belongs to the active workspace; 404 otherwise. */
export async function loadIssue(ctx: SessionContext, id: string): Promise<IssueRow> {
  if (!id || id.length > 64) throw new HttpError(404, "not_found", "Issue not found.");
  const [row] = await db
    .select()
    .from(issues)
    .where(and(eq(issues.id, id), eq(issues.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!row) throw new HttpError(404, "not_found", "Issue not found.");
  return row;
}
