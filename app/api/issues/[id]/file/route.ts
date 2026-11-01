import { eq } from "drizzle-orm";
import { z } from "zod";
import { json, parseJson, withRoute } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { toIssueDTO } from "@/lib/db/dto";
import { TRACKER_TARGETS, issues } from "@/lib/db/schema";
import { fileIssue } from "@/lib/monitor/file";
import { loadIssue } from "../../_lib/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({ target: z.enum(TRACKER_TARGETS) });

/** "File to Linear" / "File to GitHub" from the issue page. Same code path as auto-filing. */
export const POST = withRoute<{ params: { id: string } }>(async (req, { params }) => {
  const ctx = await requireUser();
  const issue = await loadIssue(ctx, params.id);
  const { target } = await parseJson(req, bodySchema, { maxBytes: 2 * 1024 });

  await fileIssue(issue.id, target);
  const [updated] = await db.select().from(issues).where(eq(issues.id, issue.id)).limit(1);
  return json({ issue: toIssueDTO(updated ?? issue) });
});
