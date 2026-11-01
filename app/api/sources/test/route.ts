import { errorResponse, json, withRoute } from "@/lib/auth/http";
import { rateLimit, rateLimitHeaders } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { previewSource } from "@/lib/sources";
import { sourceLocatorSchema } from "../_lib/schemas";
import { resolveSourceLocator } from "../_lib/service";
import { parseBody } from "@/app/api/products/_lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TESTS_PER_HOUR = 30;

/** "Test this source": fetches a small preview without saving anything. */
export const POST = withRoute(async (req) => {
  const ctx = await requireUser();
  const limit = await rateLimit(`sources-test:${ctx.user.id}`, { limit: TESTS_PER_HOUR, windowSec: 3600 });
  if (!limit.ok) {
    return errorResponse(
      429,
      "rate_limited",
      "You have tested a lot of sources in the last hour. Try again later, or save the source and it will be checked on the next run.",
      { retryAfter: Math.max(0, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000)) },
      rateLimitHeaders(limit),
    );
  }

  const body = await parseBody(req, sourceLocatorSchema);
  const { kind, config } = resolveSourceLocator(body);

  let preview: Awaited<ReturnType<typeof previewSource>>;
  try {
    preview = await previewSource(kind, config);
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : "We could not reach this source.";
    return errorResponse(422, "source_unreachable", message);
  }
  if (!preview.ok) return errorResponse(422, "source_unreachable", preview.error);

  return json({
    ok: true,
    kind,
    config,
    label: preview.label,
    count: preview.count,
    sample: preview.sample.slice(0, 5),
  });
});
