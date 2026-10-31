import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { json, parseJson, withRoute } from "@/lib/auth/http";
import { requireProduct, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { toRunDTO } from "@/lib/db/dto";
import { runs } from "@/lib/db/schema";
import { decodeCursor, encodeCursor, intParam } from "@/lib/monitor/cursor";
import { startManualRun } from "./_lib/start";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ productId: z.string().min(1).max(64) });

/**
 * "Run now". Returns 202 with the queued run immediately; the pipeline keeps
 * going in the background (see startManualRun for the quota rules).
 */
export const POST = withRoute(async (req) => {
  const ctx = await requireUser();
  const { productId } = await parseJson(req, bodySchema, { maxBytes: 4 * 1024 });
  const product = await requireProduct(ctx, productId);
  const run = await startManualRun(ctx.workspace.id, product.id);
  return json({ run: toRunDTO(run) }, 202);
});

/** Run history for a product (or every product in the workspace), newest first. */
export const GET = withRoute(async (req) => {
  const ctx = await requireUser();
  const params = new URL(req.url).searchParams;
  const productId = params.get("productId");
  const limit = intParam(params.get("limit"), 20, 1, 100);
  const cursor = decodeCursor(params.get("cursor"));

  const scope = productId
    ? eq(runs.productId, (await requireProduct(ctx, productId)).id)
    : eq(runs.workspaceId, ctx.workspace.id);

  const rows = await db
    .select()
    .from(runs)
    .where(
      and(
        scope,
        eq(runs.workspaceId, ctx.workspace.id),
        cursor
          ? or(lt(runs.createdAt, cursor.at), and(eq(runs.createdAt, cursor.at), lt(runs.id, cursor.id)))
          : undefined,
      ),
    )
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id) : null;
  return json({ runs: page.map(toRunDTO), nextCursor });
});
