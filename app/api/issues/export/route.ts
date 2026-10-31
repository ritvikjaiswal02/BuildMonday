import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { withRoute } from "@/lib/auth/http";
import { requireProduct, requireUser } from "@/lib/auth/session";
import { assertFeature } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { toIssueDTO } from "@/lib/db/dto";
import { ISSUE_STATUSES, issues } from "@/lib/db/schema";
import { exportFilename, issuesToCsv, issuesToJson } from "@/lib/monitor/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT = 2000;

const querySchema = z.object({
  productId: z.string().min(1, "Choose a product to export.").max(64),
  format: z.enum(["csv", "json"]).optional().default("csv"),
  scope: z.enum(["own", "competitor", "all"]).optional().default("all"),
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(ISSUE_STATUSES))),
});

/** Download a product's issues as CSV or JSON (Pro and Team). */
export const GET = withRoute(async (req) => {
  const ctx = await requireUser();
  const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  const product = await requireProduct(ctx, q.productId);
  await assertFeature(ctx.workspace.id, "export");

  const rows = await db
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.productId, product.id),
        eq(issues.workspaceId, ctx.workspace.id),
        q.scope !== "all" ? eq(issues.scope, q.scope) : undefined,
        q.status.length > 0 ? inArray(issues.status, q.status) : undefined,
      ),
    )
    .orderBy(desc(issues.priorityScore), desc(issues.frequency))
    .limit(MAX_EXPORT);

  const list = rows.map(toIssueDTO);
  const now = new Date();
  const filename = exportFilename(product.name, q.format, now);
  const body = q.format === "json" ? issuesToJson(product.name, list, now) : issuesToCsv(list);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": q.format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
