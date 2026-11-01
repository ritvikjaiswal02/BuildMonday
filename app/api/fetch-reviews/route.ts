import { z } from "zod";
import { errorResponse, json, parseJson, withRoute } from "@/lib/auth/http";
import { detectSourceFromUrl, fetchSource, SourceError } from "@/lib/sources";
import { feedbackKindToSource } from "@/lib/types";
import { limitFreeTool } from "../analyze/_lib/anonymous";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const FETCHES_PER_DAY = 30;

const bodySchema = z.object({ url: z.string().trim().min(1, "Paste a link first.").max(2000) });

const UNRECOGNISED =
  "We could not recognise that link. Try an App Store or Google Play link, a Reddit thread or subreddit, a Hacker News discussion, or a Trustpilot page.";

function redditTimeFilter(input: string): "hour" | "day" | "week" | "month" | "year" | "all" {
  const m = input.match(/[?&]t=(hour|day|week|month|year|all)\b/i);
  return (m?.[1]?.toLowerCase() as "hour" | "day" | "week" | "month" | "year" | "all" | undefined) ?? "month";
}

/** Free analyzer: fetch recent reviews or comments from one link. */
export const POST = withRoute(async (req) => {
  const { url } = await parseJson(req, bodySchema, { maxBytes: 8 * 1024 });
  const detected = detectSourceFromUrl(url);
  if (!detected) return errorResponse(400, "invalid_request", UNRECOGNISED);

  const limited = await limitFreeTool(req, "fetch", FETCHES_PER_DAY);
  if (limited) return limited;

  try {
    const result = await fetchSource(detected.kind, detected.config, {
      limit: 50,
      // The free analyzer looks at the subreddit's top posts, not just the newest.
      listing: "top",
      timeFilter: redditTimeFilter(url),
    });
    if (result.items.length === 0) {
      return errorResponse(
        502,
        "source_unreachable",
        result.warnings[0] ?? `No usable reviews or comments found for ${result.label}. Try a busier page or paste the text instead.`,
      );
    }
    return json({
      reviews: result.items.map((i) => i.text),
      totalFetched: result.items.length,
      sourceLabel: result.via === "proxy" ? `${result.label} (read from the public page)` : result.label,
      source: detected.kind,
      sourceCode: feedbackKindToSource(detected.kind),
      warnings: result.warnings,
    });
  } catch (err) {
    if (err instanceof SourceError) return errorResponse(502, "source_unreachable", err.message);
    throw err;
  }
});
