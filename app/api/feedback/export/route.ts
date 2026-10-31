import { desc, eq } from "drizzle-orm";
import { withRoute } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { assertFeature } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { feedback, issues } from "@/lib/db/schema";
import { csvCell } from "@/lib/monitor/export";
import { andAll, feedbackConditions, feedbackFilterSchema } from "../_lib/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT = 10_000;
const COLUMNS = ["ingested_at", "posted_at", "source", "channel", "status", "rating", "author", "text", "url", "issue", "competitor"];

/** Inbox export as CSV, with the same filters as the inbox list (Pro and Team). */
export const GET = withRoute(async (req) => {
  const ctx = await requireUser();
  const filter = feedbackFilterSchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  await assertFeature(ctx.workspace.id, "export");
  const conditions = await feedbackConditions(ctx, filter);

  const rows = await db
    .select({ row: feedback, issueTitle: issues.title })
    .from(feedback)
    .leftJoin(issues, eq(issues.id, feedback.issueId))
    .where(andAll(conditions))
    .orderBy(desc(feedback.ingestedAt))
    .limit(MAX_EXPORT);

  const lines = [
    COLUMNS.join(","),
    ...rows.map(({ row, issueTitle }) =>
      [
        row.ingestedAt.toISOString(),
        row.postedAt?.toISOString() ?? "",
        row.sourceKind,
        row.channel,
        row.status,
        row.rating ?? "",
        row.author ?? "",
        row.text,
        row.url ?? "",
        issueTitle ?? "",
        row.competitorName ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="buildmonday-feedback-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
