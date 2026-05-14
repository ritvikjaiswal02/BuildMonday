import { NextResponse } from "next/server";
import { callGeminiJson } from "@/lib/gemini";
import { PRD_PROMPT } from "@/lib/prompts";
import type { PrdStub } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      evidence?: string[];
      affected_segment?: string;
      severity?: string;
    };

    if (!body.title || !Array.isArray(body.evidence)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const prd = await callGeminiJson<PrdStub>(
      PRD_PROMPT({
        title: body.title,
        evidence: body.evidence,
        affected_segment: body.affected_segment ?? "Unknown",
        severity: body.severity ?? "Medium",
      })
    );

    return NextResponse.json({ prd });
  } catch (err) {
    console.error("/api/prd failed:", err);
    return NextResponse.json({ error: "PRD generation failed" }, { status: 500 });
  }
}
