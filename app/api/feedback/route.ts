import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, parseJson, withRoute } from "@/lib/auth/http";
import { requireProduct, requireRole, requireUser } from "@/lib/auth/session";
import { getUsage, getWorkspacePlan } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { toFeedbackDTO } from "@/lib/db/dto";
import { FEEDBACK_STATUSES, feedback, issues, type FeedbackStatus } from "@/lib/db/schema";
import { ingestFeedback } from "@/lib/feedback/ingest";
import { MAX_FEEDBACK_TEXT } from "@/lib/feedback/prepare";
import { decodeCursor, encodeCursor, intParam } from "@/lib/monitor/cursor";
import { andAll, feedbackConditions, feedbackFilterSchema } from "./_lib/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MANUAL_ITEMS = 500;

/** The inbox: feedback newest first, with per-status counts and the monthly quota. */
export const GET = withRoute(async (req) => {
  const ctx = await requireUser();
  const params = new URL(req.url).searchParams;
  const filter = feedbackFilterSchema.parse(Object.fromEntries(params.entries()));
  const limit = intParam(params.get("limit"), 50, 1, 200);
  const cursor = decodeCursor(params.get("cursor"));

  const conditions = await feedbackConditions(ctx, filter);
  if (cursor) {
    const page = or(
      lt(feedback.ingestedAt, cursor.at),
      and(eq(feedback.ingestedAt, cursor.at), lt(feedback.id, cursor.id)),
    );
    if (page) conditions.push(page);
  }

  const rows = await db
    .select({ row: feedback, issueTitle: issues.title })
    .from(feedback)
    .leftJoin(issues, eq(issues.id, feedback.issueId))
    .where(andAll(conditions))
    .orderBy(desc(feedback.ingestedAt), desc(feedback.id))
    .limit(limit + 1);

  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor = rows.length > limit && last ? encodeCursor(last.row.ingestedAt, last.row.id) : null;

  const countConditions = await feedbackConditions(ctx, filter, { includeStatus: false });
  const countRows = await db
    .select({ status: feedback.status, n: sql<number>`count(*)::int` })
    .from(feedback)
    .where(andAll(countConditions))
    .groupBy(feedback.status);
  const counts = Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s, 0])) as Record<FeedbackStatus, number>;
  for (const r of countRows) counts[r.status] = Number(r.n);

  const state = await getWorkspacePlan(ctx.workspace.id);
  const quota = {
    used: await getUsage(ctx.workspace.id, "feedback_items_per_month"),
    max: state.plan.limits.feedback_items_per_month,
  };

  return json({
    items: pageRows.map((r) => toFeedbackDTO(r.row, r.issueTitle)),
    nextCursor,
    counts,
    quota,
  });
});

const patchSchema = z
  .object({
    ids: z.array(z.string().min(1).max(64)).min(1, "Select at least one item.").max(200),
    status: z.enum(FEEDBACK_STATUSES).optional(),
    issueId: z.string().min(1).max(64).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.issueId !== undefined, { message: "Send a status or an issue to change." });

/** Bulk triage: change status and/or link to an issue (null unlinks). */
export const PATCH = withRoute(async (req) => {
  const ctx = await requireUser();
  const body = await parseJson(req, patchSchema, { maxBytes: 32 * 1024 });
  const ids = Array.from(new Set(body.ids));

  const scope = [inArray(feedback.id, ids), eq(feedback.workspaceId, ctx.workspace.id)];
  const values: { status?: FeedbackStatus; issueId?: string | null } = {};

  if (body.issueId) {
    const [issue] = await db
      .select({ id: issues.id, productId: issues.productId })
      .from(issues)
      .where(and(eq(issues.id, body.issueId), eq(issues.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!issue) throw new HttpError(404, "not_found", "Issue not found.");
    // Feedback can only be linked to an issue of the same product.
    scope.push(eq(feedback.productId, issue.productId));
    values.issueId = issue.id;
    if (body.status === undefined) values.status = "triaged";
  } else if (body.issueId === null) {
    values.issueId = null;
  }
  if (body.status !== undefined) values.status = body.status;

  const updated = await db
    .update(feedback)
    .set(values)
    .where(and(...scope))
    .returning({ id: feedback.id });
  return json({ updated: updated.length });
});

const itemSchema = z.object({
  text: z.string().max(MAX_FEEDBACK_TEXT * 2),
  author: z.string().max(200).optional().nullable(),
  url: z.string().max(2000).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
});

const postSchema = z
  .object({
    productId: z.string().min(1).max(64),
    items: z.array(itemSchema).max(MAX_MANUAL_ITEMS).optional(),
    raw: z.string().max(512 * 1024).optional(),
  })
  .refine((v) => (v.items && v.items.length > 0) || (v.raw && v.raw.trim().length > 0), {
    message: "Add at least one piece of feedback.",
  });

/** Add feedback by hand: `items` (channel manual) or newline-separated `raw` (channel import). */
export const POST = withRoute(async (req) => {
  const ctx = await requireUser();
  const body = await parseJson(req, postSchema, { maxBytes: 640 * 1024 });
  const product = await requireProduct(ctx, body.productId);

  const meta = { addedBy: ctx.user.id };
  if (body.items && body.items.length > 0) {
    const result = await ingestFeedback({
      workspaceId: ctx.workspace.id,
      productId: product.id,
      channel: "manual",
      items: body.items.map((i) => ({
        text: i.text,
        author: i.author ?? null,
        url: i.url ?? null,
        rating: i.rating ?? null,
        sourceKind: "manual",
        meta,
      })),
    });
    return json(result, 201);
  }

  const lines = (body.raw ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length > MAX_MANUAL_ITEMS) {
    throw new HttpError(400, "invalid_request", `Add up to ${MAX_MANUAL_ITEMS} lines at a time. You pasted ${lines.length}.`);
  }
  const result = await ingestFeedback({
    workspaceId: ctx.workspace.id,
    productId: product.id,
    channel: "import",
    items: lines.map((text) => ({ text, sourceKind: "import", meta })),
  });
  return json(result, 201);
});

const deleteSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1, "Select at least one item.").max(200),
});

/**
 * Permanently deletes feedback from the active workspace (admins only). Issues
 * keep their counts until the next run recounts them.
 */
export const DELETE = withRoute(async (req) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  const body = await parseJson(req, deleteSchema, { maxBytes: 32 * 1024 });
  const ids = Array.from(new Set(body.ids));
  const deleted = await db
    .delete(feedback)
    .where(and(inArray(feedback.id, ids), eq(feedback.workspaceId, ctx.workspace.id)))
    .returning({ id: feedback.id });
  return json({ deleted: deleted.length });
});
