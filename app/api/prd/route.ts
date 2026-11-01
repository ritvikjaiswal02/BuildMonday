import { z } from "zod";
import { json, parseJson, withRoute } from "@/lib/auth/http";
import { callGeminiJson } from "@/lib/gemini";
import { normalizePrd } from "@/lib/monitor/prd";
import { PRD_PROMPT } from "@/lib/prompts";
import { chargeSignedInWorkspace, limitFreeTool } from "../analyze/_lib/anonymous";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRDS_PER_DAY = 20;

const bodySchema = z.object({
  title: z.string().trim().min(1, "The issue needs a title.").max(300),
  evidence: z.array(z.string().max(2000)).max(10),
  affected_segment: z.string().max(300).optional(),
  severity: z.string().max(20).optional(),
  ranking_reason: z.string().max(600).optional(),
});

/** Free analyzer: a PRD stub for one issue. */
export const POST = withRoute(async (req) => {
  const body = await parseJson(req, bodySchema, { maxBytes: 32 * 1024 });

  const limited = await limitFreeTool(req, "prd", PRDS_PER_DAY);
  if (limited) return limited;
  await chargeSignedInWorkspace("prds_per_month");

  const raw = await callGeminiJson<unknown>(
    PRD_PROMPT({
      title: body.title,
      evidence: body.evidence,
      affected_segment: body.affected_segment ?? "Unknown",
      severity: body.severity ?? "Medium",
      ranking_reason: body.ranking_reason ?? null,
    }),
  );
  return json({ prd: normalizePrd(raw) });
});
