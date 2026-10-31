import type { TrustpilotConfig } from "@/lib/db/schema";
import {
  BROWSER_UA,
  SourceError,
  clampLimit,
  cleanText,
  fetchWithTimeout,
  isAfter,
  joinTitle,
  toIso,
  uniqueItems,
  type FetchOptions,
  type FetchResult,
  type RawFeedbackItem,
} from "./util";

interface TpReview {
  id?: string;
  text?: string;
  title?: string;
  rating?: number;
  consumer?: { displayName?: string };
  dates?: { publishedDate?: string; experiencedDate?: string };
}

const MAX_PAGES = 3;

export function trustpilotUrl(c: TrustpilotConfig, page: number, lowOnly: boolean): string {
  const params = new URLSearchParams({ sort: "recency" });
  if (lowOnly) {
    params.append("stars", "1");
    params.append("stars", "2");
    params.append("stars", "3");
  }
  if (page > 1) params.set("page", String(page));
  return `https://www.trustpilot.com/review/${encodeURIComponent(c.domain)}?${params.toString()}`;
}

function looksLikeReviewArray(arr: unknown[]): arr is TpReview[] {
  const first = arr[0];
  return typeof first === "object" && first !== null && "text" in first && "rating" in first;
}

/** Finds the reviews array anywhere in Trustpilot's page data. Exported for tests. */
export function findReviewsArray(obj: unknown, depth = 0): TpReview[] | null {
  if (!obj || depth > 9) return null;
  if (Array.isArray(obj)) {
    if (obj.length > 0 && looksLikeReviewArray(obj)) return obj;
    for (const item of obj) {
      const found = findReviewsArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    if (Array.isArray(rec.reviews) && rec.reviews.length > 0 && looksLikeReviewArray(rec.reviews)) {
      return rec.reviews;
    }
    for (const v of Object.values(rec)) {
      const found = findReviewsArray(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Parses a Trustpilot review page. Returns null when the page has no readable data. Exported for tests. */
export function parseTrustpilotHtml(html: string): RawFeedbackItem[] | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const reviews = findReviewsArray(data) ?? [];
  const out: RawFeedbackItem[] = [];
  for (const r of reviews) {
    const text = cleanText(joinTitle(r.title, r.text));
    if (text.length < 10) continue;
    out.push({
      externalId: r.id ?? null,
      text,
      title: r.title?.trim() || undefined,
      author: r.consumer?.displayName?.trim() || undefined,
      rating: typeof r.rating === "number" ? r.rating : null,
      url: r.id ? `https://www.trustpilot.com/reviews/${r.id}` : undefined,
      postedAt: toIso(r.dates?.publishedDate ?? r.dates?.experiencedDate ?? null),
    });
  }
  return out;
}

export async function fetchTrustpilot(c: TrustpilotConfig, opts: FetchOptions = {}): Promise<FetchResult> {
  const limit = clampLimit(opts.limit);
  const lowOnly = opts.lowRatingOnly ?? true;
  const collected: RawFeedbackItem[] = [];
  let reachedSince = false;

  for (let page = 1; page <= MAX_PAGES && collected.length < limit && !reachedSince; page++) {
    const res = await fetchWithTimeout(
      trustpilotUrl(c, page, lowOnly),
      { headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" } },
      "Could not reach Trustpilot.",
    );
    if (res.status === 404) {
      if (page > 1) break;
      throw new SourceError(`Trustpilot has no page for ${c.domain}. Check the domain on the Trustpilot page link.`);
    }
    if (!res.ok) {
      if (page > 1) break;
      throw new SourceError(
        `Trustpilot returned ${res.status}. They sometimes block automated requests; try again later or paste the reviews into the inbox.`,
      );
    }
    const items = parseTrustpilotHtml(await res.text());
    if (items === null) {
      if (page > 1) break;
      throw new SourceError("Trustpilot changed their page layout, so reviews cannot be read automatically right now.");
    }
    if (items.length === 0) break;
    for (const item of items) {
      if (!isAfter(item.postedAt, opts.since)) {
        reachedSince = true;
        break;
      }
      if (lowOnly && (item.rating == null || item.rating > 3)) continue;
      collected.push(item);
      if (collected.length >= limit) break;
    }
  }

  return {
    items: uniqueItems(collected).slice(0, limit),
    label: `Trustpilot: ${c.domain}`,
    warnings: collected.length === 0 ? [`No recent ${lowOnly ? "1 to 3 star " : ""}reviews for ${c.domain} on Trustpilot.`] : [],
    via: "direct",
  };
}
