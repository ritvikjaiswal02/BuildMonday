import { NextResponse } from "next/server";
import { callGeminiJson } from "@/lib/gemini";
import { embedBatch, cosineSimilarity } from "@/lib/embeddings";
import { PASS_1_PROMPT, PASS_2_PROMPT } from "@/lib/prompts";
import type {
  AnalysisDiff,
  Issue,
  IssueDiff,
  ResolvedIssue,
  Source,
  TaggedComplaint,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SIMILARITY_THRESHOLD = 0.72;

function issueSignature(i: Issue): string {
  const head = i.title ?? "";
  const ev = (i.evidence ?? []).slice(0, 3).join(" ");
  return `${head}. ${ev}`.slice(0, 1500);
}

async function computeDiff(
  current: Issue[],
  prior: Issue[],
  priorRunDate: string
): Promise<AnalysisDiff> {
  if (prior.length === 0 || current.length === 0) {
    return {
      perIssue: current.map(() => ({ category: "new" as const })),
      resolved: [],
      priorRunDate,
    };
  }

  const currentSigs = current.map(issueSignature);
  const priorSigs = prior.map(issueSignature);

  const allEmbeds = await embedBatch([...currentSigs, ...priorSigs]);
  const currentEmbeds = allEmbeds.slice(0, currentSigs.length);
  const priorEmbeds = allEmbeds.slice(currentSigs.length);

  const matchedPrior = new Set<number>();
  const perIssue: IssueDiff[] = current.map((cur, ci) => {
    let bestPriorIdx = -1;
    let bestSim = 0;
    for (let pi = 0; pi < prior.length; pi++) {
      if (matchedPrior.has(pi)) continue;
      const sim = cosineSimilarity(currentEmbeds[ci], priorEmbeds[pi]);
      if (sim > bestSim) {
        bestSim = sim;
        bestPriorIdx = pi;
      }
    }
    if (bestPriorIdx === -1 || bestSim < SIMILARITY_THRESHOLD) {
      return { category: "new" };
    }
    matchedPrior.add(bestPriorIdx);
    const priorIssue = prior[bestPriorIdx];
    const freqDelta = (cur.frequency ?? 0) - (priorIssue.frequency ?? 0);
    let category: IssueDiff["category"] = "persistent";
    if (freqDelta > 0) category = "worsened";
    else if (freqDelta < 0) category = "improved";
    return {
      category,
      priorIdx: bestPriorIdx,
      priorTitle: priorIssue.title,
      priorFrequency: priorIssue.frequency,
      similarity: bestSim,
    };
  });

  const resolved: ResolvedIssue[] = [];
  for (let pi = 0; pi < prior.length; pi++) {
    if (matchedPrior.has(pi)) continue;
    resolved.push({
      priorIdx: pi,
      title: prior[pi].title,
      frequency: prior[pi].frequency ?? 0,
    });
  }

  return { perIssue, resolved, priorRunDate };
}

const VALID_SOURCES: Source[] = ["appstore", "reddit", "hn", "manual"];

function normalizeSource(s: unknown): Source {
  return typeof s === "string" && (VALID_SOURCES as string[]).includes(s)
    ? (s as Source)
    : "manual";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      complaints?: string;
      complaintsTagged?: Array<{ text?: string; source?: string }>;
      priorIssues?: Issue[];
      priorRunDate?: string;
    };
    const { complaints, complaintsTagged, priorIssues, priorRunDate } = body;

    let items: Array<{ text: string; source: Source }>;
    if (complaintsTagged && Array.isArray(complaintsTagged) && complaintsTagged.length > 0) {
      items = complaintsTagged
        .map((c) => ({
          text: typeof c.text === "string" ? c.text.trim() : "",
          source: normalizeSource(c.source),
        }))
        .filter((c) => c.text.length > 0);
    } else if (complaints && typeof complaints === "string") {
      items = complaints
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((text) => ({ text, source: "manual" as Source }));
    } else {
      return NextResponse.json({ error: "Missing complaints" }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "No complaints found" }, { status: 400 });
    }

    const tagged = await callGeminiJson<TaggedComplaint[]>(PASS_1_PROMPT(items));
    const issues = await callGeminiJson<Issue[]>(PASS_2_PROMPT(tagged));
    const sorted = [...issues].sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));

    let diff: AnalysisDiff | null = null;
    if (priorIssues && priorIssues.length > 0 && priorRunDate) {
      try {
        diff = await computeDiff(sorted, priorIssues, priorRunDate);
      } catch (err) {
        console.error("Diff computation failed:", err);
      }
    }

    return NextResponse.json({ issues: sorted, diff });
  } catch (err) {
    console.error("/api/analyze failed:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
