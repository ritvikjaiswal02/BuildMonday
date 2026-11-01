import "server-only";

import { and, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { SessionContext } from "@/lib/auth/session";
import { requireProduct } from "@/lib/auth/session";
import { FEEDBACK_SOURCE_KINDS, FEEDBACK_STATUSES, SOURCE_ROLES, feedback } from "@/lib/db/schema";

const listParam = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v !== "all" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(values)));

export const feedbackFilterSchema = z.object({
  productId: z.string().max(64).optional(),
  status: listParam(FEEDBACK_STATUSES),
  sourceKind: listParam(FEEDBACK_SOURCE_KINDS),
  role: z.enum(SOURCE_ROLES).optional(),
  /** An issue id, or "none" for feedback not linked to any issue. */
  issueId: z.string().max(64).optional(),
  q: z.string().trim().max(200).optional(),
});

export type FeedbackFilter = z.infer<typeof feedbackFilterSchema>;

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/**
 * WHERE conditions for a feedback list, always scoped to the workspace.
 * `includeStatus: false` leaves out the status filter (for per-status counts).
 */
export async function feedbackConditions(
  ctx: SessionContext,
  f: FeedbackFilter,
  opts: { includeStatus: boolean } = { includeStatus: true },
): Promise<SQL[]> {
  const conditions: SQL[] = [eq(feedback.workspaceId, ctx.workspace.id)];
  if (f.productId) {
    const product = await requireProduct(ctx, f.productId);
    conditions.push(eq(feedback.productId, product.id));
  }
  if (opts.includeStatus && f.status.length > 0) conditions.push(inArray(feedback.status, f.status));
  if (f.sourceKind.length > 0) conditions.push(inArray(feedback.sourceKind, f.sourceKind));
  if (f.role) conditions.push(eq(feedback.role, f.role));
  if (f.issueId === "none") conditions.push(isNull(feedback.issueId));
  else if (f.issueId) conditions.push(eq(feedback.issueId, f.issueId));
  if (f.q) {
    const pattern = likePattern(f.q);
    const match = or(ilike(feedback.text, pattern), ilike(feedback.author, pattern), ilike(feedback.title, pattern));
    if (match) conditions.push(match);
  }
  return conditions;
}

export function andAll(conditions: SQL[]): SQL | undefined {
  return and(...conditions);
}
