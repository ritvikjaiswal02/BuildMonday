import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, parseJson, withRoute } from "@/lib/auth/http";
import { requireProduct, requireUser } from "@/lib/auth/session";
import { assertAndConsume } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { issues } from "@/lib/db/schema";
import { callGeminiChat } from "@/lib/gemini";
import { rowToAnalysisIssue } from "@/lib/monitor/mappers";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompts";
import type { Issue } from "@/lib/types";
import { chargeSignedInWorkspace, limitFreeTool } from "../analyze/_lib/anonymous";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_HISTORY_TURNS = 6;
const ANON_MESSAGES_PER_DAY = 30;
const PRODUCT_ISSUES_IN_CONTEXT = 25;

const messageSchema = z.object({
  role: z.enum(["user", "model"]),
  content: z.string().max(4000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1, "Send a message first.").max(40),
  issues: z.array(z.object({ title: z.string().max(300) }).passthrough()).max(100).optional(),
  productId: z.string().min(1).max(64).optional(),
});

async function productIssues(productId: string): Promise<{ own: Issue[]; competitor: Issue[] }> {
  const open = and(eq(issues.productId, productId), ne(issues.status, "ignored"), ne(issues.trend, "resolved"));
  const ownRows = await db
    .select()
    .from(issues)
    .where(and(open, eq(issues.scope, "own")))
    .orderBy(sql`${issues.rank} asc nulls last`, desc(issues.priorityScore))
    .limit(PRODUCT_ISSUES_IN_CONTEXT);
  const competitorRows = await db
    .select()
    .from(issues)
    .where(and(open, eq(issues.scope, "competitor")))
    .orderBy(desc(issues.priorityScore))
    .limit(10);
  return { own: ownRows.map(rowToAnalysisIssue), competitor: competitorRows.map(rowToAnalysisIssue) };
}

/**
 * Grounded chat. Anonymous: `{ messages, issues }` from the browser's
 * analysis. Signed in: `{ messages, productId }`, answered from the product's
 * stored issues and counted against chat_messages_per_month.
 */
export const POST = withRoute(async (req) => {
  const body = await parseJson(req, bodySchema, { maxBytes: 256 * 1024 });
  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user" || !last.content.trim()) {
    throw new HttpError(400, "invalid_request", "The last message must be a question from you.");
  }
  const history = body.messages
    .slice(0, -1)
    .slice(-MAX_HISTORY_TURNS * 2)
    .filter((m) => m.content.trim().length > 0);

  let systemInstruction: string;
  if (body.productId) {
    const ctx = await requireUser();
    const product = await requireProduct(ctx, body.productId);
    await assertAndConsume(ctx.workspace.id, "chat_messages_per_month", 1);
    const { own, competitor } = await productIssues(product.id);
    const notes = competitor.length
      ? [
          "Competitor issues (complaints about competing products, useful for spotting gaps):",
          ...competitor.map((c, i) => `C${i + 1}. ${c.title} (${c.frequency} reports)`),
        ]
      : [];
    systemInstruction = CHAT_SYSTEM_PROMPT(own, { productName: product.name, extraNotes: notes });
  } else {
    const limited = await limitFreeTool(req, "chat", ANON_MESSAGES_PER_DAY);
    if (limited) return limited;
    await chargeSignedInWorkspace("chat_messages_per_month");
    systemInstruction = CHAT_SYSTEM_PROMPT((body.issues ?? []) as unknown as Issue[]);
  }

  const reply = await callGeminiChat(systemInstruction, history, last.content);
  return json({ reply });
});
