import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { json, withRoute } from "@/lib/auth/http";
import { requireProduct, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { toIssueDTO } from "@/lib/db/dto";
import { ISSUE_STATUSES, ISSUE_TRENDS, issues } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ISSUES = 200;

const listParam = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(values)));

const querySchema = z.object({
  productId: z.string().max(64).optional(),
  status: listParam(ISSUE_STATUSES),
  trend: listParam(ISSUE_TRENDS),
  scope: z.enum(["own", "competitor", "all"]).optional().default("own"),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(["priority", "frequency", "recent", "rank"]).optional().default("priority"),
});

/** Escapes LIKE wildcards in user search text. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/** Issues for a product (or the whole workspace), filtered and sorted. */
export const GET = withRoute(async (req) => {
  const ctx = await requireUser();
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const q = querySchema.parse(params);

  const conditions: SQL[] = [eq(issues.workspaceId, ctx.workspace.id)];
  if (q.productId) {
    const product = await requireProduct(ctx, q.productId);
    conditions.push(eq(issues.productId, product.id));
  }
  if (q.scope !== "all") conditions.push(eq(issues.scope, q.scope));
  if (q.status.length > 0) conditions.push(inArray(issues.status, q.status));
  if (q.trend.length > 0) conditions.push(inArray(issues.trend, q.trend));
  if (q.q) {
    const pattern = likePattern(q.q);
    const match = or(ilike(issues.title, pattern), ilike(issues.affectedSegment, pattern), ilike(issues.rankingReason, pattern));
    if (match) conditions.push(match);
  }

  const order =
    q.sort === "frequency"
      ? [desc(issues.frequency), desc(issues.priorityScore)]
      : q.sort === "recent"
        ? [desc(issues.lastSeenAt), desc(issues.priorityScore)]
        : q.sort === "rank"
          ? [sql`${issues.rank} asc nulls last`, desc(issues.priorityScore)]
          : [desc(issues.priorityScore), desc(issues.frequency)];

  const rows = await db
    .select()
    .from(issues)
    .where(and(...conditions))
    .orderBy(...order)
    .limit(MAX_ISSUES);

  return json({ issues: rows.map(toIssueDTO) });
});
