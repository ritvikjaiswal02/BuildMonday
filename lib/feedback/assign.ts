import "server-only";

import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { feedback, issues } from "@/lib/db/schema";
import { embedBatch } from "@/lib/embeddings";
import { env } from "@/lib/env";
import { matchToIssues, MATCH_THRESHOLD, type MatchIssue } from "./match";

/** Items embedded per call; larger pastes are matched on the next run. */
const MAX_ITEMS = 200;
const MAX_TEXT = 2000;

/**
 * Incremental assignment: embeds newly stored feedback and links each item to
 * the closest existing issue of the same product and scope (cosine >= 0.72).
 * The item keeps status "new", so the next run still counts it, but the inbox
 * already shows "Matches: <issue>" and the dashboard shows it as pending.
 *
 * Best effort: without a Gemini key, issue embeddings or on any error it
 * returns 0 and the next run groups the feedback as before.
 */
export async function assignToExistingIssues(productId: string, feedbackIds: string[]): Promise<number> {
  if (feedbackIds.length === 0 || !env.GEMINI_API_KEY) return 0;
  try {
    const candidates = await db
      .select({ id: issues.id, scope: issues.scope, competitorName: issues.competitorName, embedding: issues.embedding })
      .from(issues)
      .where(
        and(
          eq(issues.productId, productId),
          ne(issues.status, "ignored"),
          ne(issues.trend, "resolved"),
          isNotNull(issues.embedding),
        ),
      );
    const usable: MatchIssue[] = candidates
      .filter((c): c is typeof c & { embedding: number[] } => Array.isArray(c.embedding) && c.embedding.length > 0)
      .map((c) => ({ id: c.id, scope: c.scope, competitorName: c.competitorName, embedding: c.embedding }));
    if (usable.length === 0) return 0;

    const rows = await db
      .select({ id: feedback.id, text: feedback.text, role: feedback.role, competitorName: feedback.competitorName })
      .from(feedback)
      .where(and(inArray(feedback.id, feedbackIds.slice(0, MAX_ITEMS)), isNull(feedback.issueId)));
    if (rows.length === 0) return 0;

    const vectors = await embedBatch(rows.map((r) => r.text.slice(0, MAX_TEXT)));
    const dims = usable[0].embedding.length;
    const items = rows
      .map((r, i) => ({ id: r.id, role: r.role, competitorName: r.competitorName, embedding: vectors[i] ?? [] }))
      .filter((r) => r.embedding.length === dims);
    const matches = matchToIssues(items, usable, MATCH_THRESHOLD);
    if (matches.size === 0) return 0;

    const byIssue = new Map<string, string[]>();
    for (const [feedbackId, issueId] of matches) {
      byIssue.set(issueId, [...(byIssue.get(issueId) ?? []), feedbackId]);
    }
    let linked = 0;
    for (const [issueId, ids] of byIssue) {
      const updated = await db
        .update(feedback)
        .set({ issueId })
        .where(and(inArray(feedback.id, ids), isNull(feedback.issueId), eq(feedback.productId, productId)))
        .returning({ id: feedback.id });
      linked += updated.length;
    }
    return linked;
  } catch (err) {
    console.warn("[assign] incremental matching skipped", err instanceof Error ? err.message : err);
    return 0;
  }
}
