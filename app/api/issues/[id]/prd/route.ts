import { eq } from "drizzle-orm";
import { json, withRoute } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { PlanError, assertAndConsume, getUsage, getWorkspacePlan, limitMessage } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { toIssueDTO } from "@/lib/db/dto";
import { issues, products } from "@/lib/db/schema";
import { callGeminiJson } from "@/lib/gemini";
import { normalizePrd } from "@/lib/monitor/prd";
import { minimumPlanFor } from "@/lib/plans";
import { PRD_PROMPT } from "@/lib/prompts";
import { loadIssue } from "../../_lib/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Generates (or regenerates) the PRD stub for a stored issue and saves it.
 * Counts against prds_per_month; the quota is checked before calling the
 * model and consumed once the PRD exists.
 */
export const POST = withRoute<{ params: { id: string } }>(async (_req, { params }) => {
  const ctx = await requireUser();
  const issue = await loadIssue(ctx, params.id);

  const state = await getWorkspacePlan(ctx.workspace.id);
  const max = state.plan.limits.prds_per_month;
  if (max !== -1) {
    const used = await getUsage(ctx.workspace.id, "prds_per_month");
    if (used >= max) {
      throw new PlanError("limit_reached", limitMessage("prds_per_month", max), {
        limit: "prds_per_month",
        used,
        max,
        requiredPlan: minimumPlanFor("prds_per_month", used + 1),
      });
    }
  }

  const [product] = await db.select({ name: products.name }).from(products).where(eq(products.id, issue.productId)).limit(1);
  const raw = await callGeminiJson<unknown>(
    PRD_PROMPT({
      title: issue.title,
      evidence: issue.evidence ?? [],
      affected_segment: issue.affectedSegment || "Unknown",
      severity: issue.severity,
      ranking_reason: issue.rankingReason,
      productName: product?.name ?? null,
    }),
  );
  const prd = normalizePrd(raw);

  await assertAndConsume(ctx.workspace.id, "prds_per_month", 1);
  const [updated] = await db
    .update(issues)
    .set({ prd, prdGeneratedAt: new Date() })
    .where(eq(issues.id, issue.id))
    .returning();
  return json({ issue: toIssueDTO(updated ?? issue) });
});
