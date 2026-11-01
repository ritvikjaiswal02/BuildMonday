import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, parseJson, withRoute } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { toFeedbackDTO, toIssueDTO, toIssueSnapshotDTO } from "@/lib/db/dto";
import { ISSUE_STATUSES, feedback, issueSnapshots, issues } from "@/lib/db/schema";
import { loadIssue } from "../_lib/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SNAPSHOTS = 26;
const MAX_FEEDBACK = 50;

/** One issue with its trend history (oldest first) and linked feedback (newest first). */
export const GET = withRoute<{ params: { id: string } }>(async (_req, { params }) => {
  const ctx = await requireUser();
  const issue = await loadIssue(ctx, params.id);

  const snaps = await db
    .select()
    .from(issueSnapshots)
    .where(eq(issueSnapshots.issueId, issue.id))
    .orderBy(desc(issueSnapshots.createdAt))
    .limit(MAX_SNAPSHOTS);

  const linked = await db
    .select()
    .from(feedback)
    .where(and(eq(feedback.issueId, issue.id), eq(feedback.workspaceId, ctx.workspace.id)))
    .orderBy(desc(feedback.ingestedAt))
    .limit(MAX_FEEDBACK);

  return json({
    issue: toIssueDTO(issue),
    snapshots: snaps.reverse().map(toIssueSnapshotDTO),
    feedback: linked.map((f) => toFeedbackDTO(f, issue.title)),
  });
});

const patchSchema = z
  .object({
    status: z.enum(ISSUE_STATUSES).optional(),
    title: z.string().trim().min(1, "The title cannot be empty.").max(200).optional(),
  })
  .refine((v) => v.status !== undefined || v.title !== undefined, { message: "Send a status or a title to change." });

/** Change an issue's workflow status or rename it. */
export const PATCH = withRoute<{ params: { id: string } }>(async (req, { params }) => {
  const ctx = await requireUser();
  const issue = await loadIssue(ctx, params.id);
  const body = await parseJson(req, patchSchema, { maxBytes: 4 * 1024 });

  const [updated] = await db
    .update(issues)
    .set({
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
    })
    .where(and(eq(issues.id, issue.id), eq(issues.workspaceId, ctx.workspace.id)))
    .returning();
  if (!updated) throw new HttpError(404, "not_found", "Issue not found.");
  return json({ issue: toIssueDTO(updated) });
});
