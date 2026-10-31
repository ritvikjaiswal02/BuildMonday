import "server-only";

import { callGeminiJson } from "@/lib/gemini";
import { CATEGORIES, PASS_1_PROMPT, PASS_2_PROMPT, clipForPrompt, type PromptContext } from "@/lib/prompts";
import {
  isSource,
  type Action,
  type ChurnRisk,
  type Effort,
  type Issue,
  type Severity,
  type Source,
  type SourceMix,
  type TaggedComplaint,
} from "@/lib/types";

export interface AnalyzeInput {
  text: string;
  source: Source;
}

export interface AnalyzeResult {
  tagged: TaggedComplaint[];
  issues: Issue[];
  /** Per input item (same order): false when pass 1 judged it unrelated to the product. */
  relevant: boolean[];
}

/** Items per pass-1 call; chunks run in parallel. */
export const PASS_1_CHUNK = 80;
const PASS_1_CONCURRENCY = 4;
/** Hard cap on items sent to analysis in one call. */
export const MAX_ANALYZE_ITEMS = 400;

const SEVERITIES: Severity[] = ["Low", "Medium", "High"];
const EFFORTS: Effort[] = ["S", "M", "L"];
const ACTIONS: Action[] = ["fix_now", "investigate", "monitor"];

function pickLevel(value: unknown, fallback: Severity): Severity {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  return SEVERITIES.find((s) => s.toLowerCase() === v) ?? (v === "critical" ? "High" : fallback);
}

function pickEffort(value: unknown): Effort {
  if (typeof value !== "string") return "M";
  const v = value.trim().toUpperCase().charAt(0);
  return (EFFORTS as string[]).includes(v) ? (v as Effort) : "M";
}

function pickAction(value: unknown, severity: Severity, churn: ChurnRisk): Action {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if ((ACTIONS as string[]).includes(v)) return v as Action;
  }
  if (severity === "High" || churn === "High") return "fix_now";
  return severity === "Medium" ? "investigate" : "monitor";
}

function pickCategory(value: unknown): string {
  if (typeof value !== "string") return "other";
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (CATEGORIES as readonly string[]).includes(v) ? v : "other";
}

function str(value: unknown, max: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return fallback;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

interface Pass1Tag {
  category: string;
  severity: Severity;
  affected_segment: string;
  churn_signal: ChurnRisk;
  urgency_keywords: string[];
  relevant: boolean;
}

const DEFAULT_TAG: Pass1Tag = {
  category: "other",
  severity: "Medium",
  affected_segment: "General users",
  churn_signal: "Low",
  urgency_keywords: [],
  relevant: true,
};

/**
 * Joins pass-1 output back to the chunk's items by `index` (1-based within
 * the chunk), falling back to array position. Missing entries get defaults.
 */
export function normalizePass1(raw: unknown, count: number): Pass1Tag[] {
  const out: Pass1Tag[] = Array.from({ length: count }, () => ({ ...DEFAULT_TAG }));
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)
      ? ((raw as { items: unknown[] }).items)
      : [];
  list.forEach((entry, position) => {
    if (!entry || typeof entry !== "object") return;
    const e = entry as Record<string, unknown>;
    const idx = typeof e.index === "number" && Number.isInteger(e.index) ? e.index - 1 : position;
    if (idx < 0 || idx >= count) return;
    out[idx] = {
      category: pickCategory(e.category),
      severity: pickLevel(e.severity, "Medium"),
      affected_segment: str(e.affected_segment, 120, DEFAULT_TAG.affected_segment),
      churn_signal: pickLevel(e.churn_signal, "Low"),
      urgency_keywords: Array.isArray(e.urgency_keywords)
        ? e.urgency_keywords.filter((k): k is string => typeof k === "string").map((k) => str(k, 60)).filter(Boolean).slice(0, 4)
        : [],
      relevant: e.relevant !== false,
    };
  });
  return out;
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | undefined;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/**
 * Validates pass-2 clusters: enums, score range, member indices (1-based,
 * in range, each item in at most one issue), frequency and source mix
 * recomputed from members, evidence fallback. Sorted by priority.
 */
export function normalizeIssues(raw: unknown, items: AnalyzeInput[], tagged?: TaggedComplaint[]): Issue[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { issues?: unknown }).issues)
      ? ((raw as { issues: unknown[] }).issues)
      : [];
  const claimed = new Set<number>();
  const out: Issue[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const title = str(e.title, 120);
    if (!title) continue;

    const members: number[] = [];
    if (Array.isArray(e.member_indices)) {
      for (const m of e.member_indices) {
        const n = typeof m === "number" ? m : typeof m === "string" ? Number(m) : NaN;
        if (!Number.isInteger(n) || n < 1 || n > items.length || claimed.has(n)) continue;
        claimed.add(n);
        members.push(n);
      }
    }
    members.sort((a, b) => a - b);

    const rawFrequency = typeof e.frequency === "number" && Number.isFinite(e.frequency) ? Math.round(e.frequency) : 0;
    // When the model listed members but every one was claimed by an earlier issue, this is a duplicate.
    if (members.length === 0 && Array.isArray(e.member_indices) && e.member_indices.length > 0) continue;
    const frequency = members.length > 0 ? members.length : Math.max(1, rawFrequency);

    const severity = pickLevel(e.severity, "Medium");
    const churn = pickLevel(e.churn_risk, "Low");

    let sourceMix: SourceMix = {};
    if (members.length > 0) {
      for (const m of members) {
        const s = items[m - 1].source;
        sourceMix[s] = (sourceMix[s] ?? 0) + 1;
      }
    } else if (e.source_mix && typeof e.source_mix === "object") {
      for (const [k, v] of Object.entries(e.source_mix as Record<string, unknown>)) {
        if (isSource(k) && typeof v === "number" && v > 0) sourceMix[k] = Math.round(v);
      }
    }
    if (Object.keys(sourceMix).length === 0) sourceMix = {};

    let evidence = Array.isArray(e.evidence)
      ? e.evidence.filter((q): q is string => typeof q === "string").map((q) => str(q, 300)).filter(Boolean).slice(0, 3)
      : [];
    if (evidence.length === 0 && members.length > 0) {
      evidence = members.slice(0, 3).map((m) => clipForPrompt(items[m - 1].text, 300));
    }

    const scoreRaw = typeof e.priority_score === "number" ? e.priority_score : Number(e.priority_score);
    const priority = Number.isFinite(scoreRaw) ? Math.max(1, Math.min(100, Math.round(scoreRaw))) : 50;

    const category =
      typeof e.category === "string" && e.category.trim()
        ? pickCategory(e.category)
        : tagged && members.length > 0
          ? mostCommon(members.map((m) => tagged[m - 1]?.category ?? "other"))
          : undefined;

    const issue: Issue = {
      title,
      frequency,
      severity,
      churn_risk: churn,
      effort: pickEffort(e.effort),
      affected_segment: str(e.affected_segment, 160, "General users"),
      evidence,
      recommended_action: pickAction(e.recommended_action, severity, churn),
      priority_score: priority,
      source_mix: sourceMix,
      member_indices: members,
    };
    const reason = str(e.ranking_reason, 400);
    if (reason) issue.ranking_reason = reason;
    if (category) issue.category = category;
    out.push(issue);
  }

  return out.sort((a, b) => b.priority_score - a.priority_score || b.frequency - a.frequency);
}

/**
 * The two-pass analysis: tag every item (in parallel chunks), then cluster
 * the relevant ones into ranked issues with member indices into `items`.
 */
export async function analyzeItems(
  items: AnalyzeInput[],
  ctx?: PromptContext,
): Promise<AnalyzeResult> {
  const input = items.slice(0, MAX_ANALYZE_ITEMS).map((i) => ({ text: i.text.trim(), source: i.source }));
  if (input.length === 0) return { tagged: [], issues: [], relevant: [] };

  const chunks = chunk(input, PASS_1_CHUNK);
  const tagChunks = await mapLimit(chunks, PASS_1_CONCURRENCY, async (c) =>
    normalizePass1(await callGeminiJson<unknown>(PASS_1_PROMPT(c, ctx), { temperature: 0.2 }), c.length),
  );
  const tags = tagChunks.flat();

  const tagged: TaggedComplaint[] = input.map((item, i) => ({
    complaint: item.text,
    category: tags[i].category,
    severity: tags[i].severity,
    affected_segment: tags[i].affected_segment,
    churn_signal: tags[i].churn_signal,
    urgency_keywords: tags[i].urgency_keywords,
    source: item.source,
  }));
  const relevant = tags.map((t) => t.relevant);

  const pass2Input = input
    .map((item, i) => ({
      index: i + 1,
      text: clipForPrompt(item.text, 400),
      source: item.source,
      category: tags[i].category,
      severity: tags[i].severity,
      churn_signal: tags[i].churn_signal,
      affected_segment: tags[i].affected_segment,
    }))
    .filter((_, i) => relevant[i]);

  if (pass2Input.length === 0) return { tagged, issues: [], relevant };

  const rawIssues = await callGeminiJson<unknown>(PASS_2_PROMPT(pass2Input, ctx), { temperature: 0.3 });
  const issues = normalizeIssues(rawIssues, input, tagged);
  return { tagged, issues, relevant };
}
