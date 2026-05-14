import { NextResponse } from "next/server";
import { callGeminiChat } from "@/lib/gemini";
import type { Issue } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_HISTORY_TURNS = 6;

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

function buildSystemInstruction(issues: Issue[]): string {
  if (issues.length === 0) {
    return "You are a product strategy assistant. No analysis has been run yet, so politely ask the user to run an analysis first.";
  }
  const summary = issues
    .map((i, idx) => {
      const mix = i.source_mix
        ? Object.entries(i.source_mix)
            .filter(([, n]) => (n ?? 0) > 0)
            .map(([s, n]) => `${s}:${n}`)
            .join(", ")
        : "";
      const evidence = (i.evidence ?? []).slice(0, 3).map((e) => `"${e}"`).join(" | ");
      return [
        `Cluster #${idx + 1}: ${i.title}`,
        `  frequency=${i.frequency}, severity=${i.severity}, churn_risk=${i.churn_risk}, effort=${i.effort}, action=${i.recommended_action}, priority=${i.priority_score}`,
        `  affected: ${i.affected_segment}`,
        mix ? `  sources: ${mix}` : null,
        `  evidence: ${evidence}`,
        i.ranking_reason ? `  ranking_reason: ${i.ranking_reason}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return `You are a product strategy assistant grounded in a specific customer-complaint analysis. Answer questions about these clusters and nothing else. When you reference a cluster, cite it as "#N" (its rank number). If the user asks something the data cannot support, say so directly — do not invent complaints, frequencies, or segments.

Be concise. Default to 1-3 short paragraphs or a tight bullet list. No preamble like "Sure!" or "Great question!".

ANALYSIS:
${summary}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages?: ChatMessage[];
      issues?: Issue[];
    };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const issues = Array.isArray(body.issues) ? body.issues : [];

    if (messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }
    const last = messages[messages.length - 1];
    if (last.role !== "user" || !last.content?.trim()) {
      return NextResponse.json({ error: "Last message must be from user" }, { status: 400 });
    }

    const history = messages
      .slice(0, -1)
      .slice(-MAX_HISTORY_TURNS * 2)
      .filter((m) => m.content?.trim().length > 0);

    const systemInstruction = buildSystemInstruction(issues);
    const reply = await callGeminiChat(systemInstruction, history, last.content);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("/api/chat failed:", err);
    const message = err instanceof Error ? err.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
