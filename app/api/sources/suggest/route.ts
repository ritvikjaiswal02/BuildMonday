import { json, withRoute } from "@/lib/auth/http";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { rankAppStoreMatches, type ItunesResult } from "./rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ITUNES_TIMEOUT_MS = 6_000;

/**
 * GET /api/sources/suggest?name=Acme%20Notes&website=https://acme.com
 *
 * Looks the product up in the App Store (iTunes Search API) so people can pick
 * their app instead of hunting for its numeric id. Results whose developer
 * site matches the website come first. Any failure returns an empty list:
 * suggestions are a shortcut and never block onboarding.
 */
export const GET = withRoute(async (req) => {
  const ctx = await requireUser();
  const params = new URL(req.url).searchParams;
  const name = (params.get("name") ?? "").trim().slice(0, 80);
  const website = (params.get("website") ?? "").trim().slice(0, 300);
  const country = /^[a-z]{2}$/i.test(params.get("country") ?? "") ? params.get("country")!.toLowerCase() : "us";
  if (name.length < 2) return json({ appstore: [] });

  const limited = await rateLimit(`suggest:user:${ctx.user.id}`, { limit: 60, windowSec: 600 });
  if (!limited.ok) return json({ appstore: [] });

  let results: ItunesResult[] = [];
  try {
    const url = new URL("https://itunes.apple.com/search");
    url.searchParams.set("entity", "software");
    url.searchParams.set("limit", "5");
    url.searchParams.set("country", country);
    url.searchParams.set("term", name);
    const res = await fetch(url, { signal: AbortSignal.timeout(ITUNES_TIMEOUT_MS), cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { results?: ItunesResult[] };
      results = Array.isArray(body.results) ? body.results : [];
    }
  } catch {
    results = [];
  }

  return json({ appstore: rankAppStoreMatches(results, website).slice(0, 3) });
});
