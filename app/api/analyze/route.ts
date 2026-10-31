import { z } from "zod";
import { HttpError, json, parseJson, withRoute } from "@/lib/auth/http";
import { analyzeItems, MAX_ANALYZE_ITEMS } from "@/lib/monitor/analyze";
import { computeDiff } from "@/lib/monitor/diff";
import { isSource, type AnalysisDiff, type Issue, type Source } from "@/lib/types";
import { limitFreeTool } from "./_lib/anonymous";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** The free analyzer takes up to this many complaints per request. */
const MAX_FREE_ITEMS = 300;
const MAX_BYTES = 256 * 1024;
const ANALYSES_PER_DAY = 10;

const bodySchema = z.object({
  complaints: z.string().max(MAX_BYTES).optional(),
  complaintsTagged: z
    .array(z.object({ text: z.string(), source: z.string().max(40).optional().nullable() }))
    .max(5000)
    .optional(),
  // History comes from the browser's localStorage and may be from an older
  // version of the app, so it is sanitised rather than strictly validated.
  priorIssues: z.array(z.unknown()).max(200).optional(),
  priorRunDate: z.string().max(100).optional(),
});

/** Keeps prior issues that have a title; coerces the fields the diff uses. */
function sanitizePriorIssues(list: unknown[] | undefined): Issue[] {
  if (!list) return [];
  const out: Issue[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.title !== "string" || !r.title.trim()) continue;
    out.push({
      ...(r as unknown as Issue),
      title: r.title.slice(0, 300),
      frequency: typeof r.frequency === "number" && Number.isFinite(r.frequency) ? r.frequency : 0,
      evidence: Array.isArray(r.evidence)
        ? r.evidence.filter((e): e is string => typeof e === "string").slice(0, 3).map((e) => e.slice(0, 1000))
        : [],
    });
  }
  return out.slice(0, 100);
}

function toItems(body: z.infer<typeof bodySchema>): Array<{ text: string; source: Source }> {
  if (body.complaintsTagged && body.complaintsTagged.length > 0) {
    return body.complaintsTagged
      .map((c) => ({ text: c.text.trim().slice(0, 4000), source: isSource(c.source) ? c.source : ("manual" as Source) }))
      .filter((c) => c.text.length > 0);
  }
  if (typeof body.complaints === "string") {
    return body.complaints
      .split(/\n+/)
      .map((s) => s.trim().slice(0, 4000))
      .filter((s) => s.length > 0)
      .map((text) => ({ text, source: "manual" as Source }));
  }
  throw new HttpError(400, "invalid_request", "Add some complaints to analyze, one per line.");
}

/** Anonymous two-pass analysis with an optional diff against the browser's previous run. */
export const POST = withRoute(async (req) => {
  const body = await parseJson(req, bodySchema, { maxBytes: MAX_BYTES });
  const items = toItems(body);
  if (items.length === 0) {
    throw new HttpError(400, "invalid_request", "No complaints found. Add at least one line of feedback.");
  }
  if (items.length > MAX_FREE_ITEMS) {
    throw new HttpError(
      400,
      "invalid_request",
      `The free analyzer takes up to ${MAX_FREE_ITEMS} complaints at a time. You sent ${items.length}.`,
      { max: MAX_FREE_ITEMS, received: items.length },
    );
  }

  const limited = await limitFreeTool(req, "analyze", ANALYSES_PER_DAY);
  if (limited) return limited;

  const { issues } = await analyzeItems(items.slice(0, Math.min(MAX_FREE_ITEMS, MAX_ANALYZE_ITEMS)));

  let diff: AnalysisDiff | null = null;
  const prior = sanitizePriorIssues(body.priorIssues);
  if (prior.length > 0 && body.priorRunDate) {
    try {
      diff = await computeDiff(issues, prior, body.priorRunDate);
    } catch (err) {
      console.error("[analyze] diff computation failed", err);
    }
  }

  return json({ issues, diff });
});
