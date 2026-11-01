import { and, eq, inArray } from "drizzle-orm";
import { HttpError, json, withRoute } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { toIssueDTO, toRunDTO, type IssueDTO } from "@/lib/db/dto";
import { issues, products, runs } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One run with its product and, once it succeeded, the issues it changed. */
export const GET = withRoute<{ params: { id: string } }>(async (_req, { params }) => {
  const ctx = await requireUser();
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, params.id), eq(runs.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!run) throw new HttpError(404, "not_found", "Run not found.");

  const [product] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.id, run.productId))
    .limit(1);

  let diff: { new: IssueDTO[]; worsened: IssueDTO[]; improved: IssueDTO[]; resolved: IssueDTO[] } | undefined;
  if (run.status === "succeeded") {
    const s = run.stats;
    const ids = Array.from(
      new Set([...(s.newIssueIds ?? []), ...(s.worsenedIssueIds ?? []), ...(s.improvedIssueIds ?? []), ...(s.resolvedIssueIds ?? [])]),
    );
    const rows = ids.length
      ? await db
          .select()
          .from(issues)
          .where(and(inArray(issues.id, ids), eq(issues.workspaceId, ctx.workspace.id)))
      : [];
    const byId = new Map(rows.map((r) => [r.id, toIssueDTO(r)]));
    const pick = (list: string[] | undefined) =>
      (list ?? [])
        .map((id) => byId.get(id))
        .filter((x): x is IssueDTO => Boolean(x))
        .sort((a, b) => b.priorityScore - a.priorityScore);
    diff = {
      new: pick(s.newIssueIds),
      worsened: pick(s.worsenedIssueIds),
      improved: pick(s.improvedIssueIds),
      resolved: pick(s.resolvedIssueIds),
    };
  }

  return json({
    run: toRunDTO(run),
    product: product ?? { id: run.productId, name: "Deleted product" },
    ...(diff ? { issues: diff } : {}),
  });
});
