import type { AppStoreConfig } from "@/lib/db/schema";
import {
  BOT_UA,
  SourceError,
  clampLimit,
  fetchWithTimeout,
  isAfter,
  joinTitle,
  toIso,
  uniqueItems,
  type FetchOptions,
  type FetchResult,
  type RawFeedbackItem,
} from "./util";

interface RssText {
  label?: string;
}
interface RssEntry {
  id?: RssText;
  "im:rating"?: RssText;
  "im:version"?: RssText;
  title?: RssText;
  content?: RssText | RssText[];
  author?: { name?: RssText };
  updated?: RssText;
}
interface RssFeed {
  feed?: { entry?: RssEntry | RssEntry[] };
}

/** The public RSS feed serves at most 10 pages of 50 reviews. */
const MAX_PAGES = 10;

export function appStoreFeedUrl(c: AppStoreConfig, page: number): string {
  return `https://itunes.apple.com/${c.country || "us"}/rss/customerreviews/page=${page}/id=${c.appId}/sortby=mostrecent/json`;
}

function contentOf(entry: RssEntry): string {
  if (!entry.content) return "";
  if (Array.isArray(entry.content)) {
    // The feed lists a text part and an html part; the text part comes first.
    return entry.content[0]?.label ?? "";
  }
  return entry.content.label ?? "";
}

/** Parses one RSS page into items. Exported for tests. */
export function parseAppStoreFeed(json: RssFeed, c: AppStoreConfig): RawFeedbackItem[] {
  const raw = json.feed?.entry;
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const items: RawFeedbackItem[] = [];
  for (const e of entries) {
    // The first entry of older feeds describes the app itself and has no rating.
    const ratingLabel = e["im:rating"]?.label;
    if (!ratingLabel) continue;
    const rating = parseInt(ratingLabel, 10);
    const title = e.title?.label?.trim() ?? "";
    const body = contentOf(e).trim();
    const text = joinTitle(title, body);
    if (!text) continue;
    const id = e.id?.label?.trim() || null;
    items.push({
      externalId: id,
      text,
      title: title || undefined,
      author: e.author?.name?.label?.trim() || undefined,
      rating: Number.isFinite(rating) ? rating : null,
      url: `https://apps.apple.com/${c.country || "us"}/app/id${c.appId}?see-all=reviews`,
      postedAt: toIso(e.updated?.label),
    });
  }
  return items;
}

export async function fetchAppStore(c: AppStoreConfig, opts: FetchOptions = {}): Promise<FetchResult> {
  const limit = clampLimit(opts.limit);
  const lowOnly = opts.lowRatingOnly ?? true;
  const country = (c.country || "us").toUpperCase();
  const collected: RawFeedbackItem[] = [];
  let sawAnyReview = false;
  let reachedSince = false;

  for (let page = 1; page <= MAX_PAGES && collected.length < limit && !reachedSince; page++) {
    const res = await fetchWithTimeout(
      appStoreFeedUrl(c, page),
      { headers: { "User-Agent": BOT_UA, Accept: "application/json" } },
      "Could not reach the App Store.",
    );
    if (!res.ok) {
      if (page > 1) break;
      if (res.status === 404 || res.status === 400) {
        throw new SourceError(
          `App ${c.appId} was not found in the ${country} store. Check the id and pick the country store your users are in.`,
        );
      }
      throw new SourceError(`The App Store returned ${res.status}. Try again later.`);
    }
    let json: RssFeed;
    try {
      json = (await res.json()) as RssFeed;
    } catch {
      if (page > 1) break;
      throw new SourceError("The App Store sent a response we could not read. Try again later.");
    }
    const pageItems = parseAppStoreFeed(json, c);
    if (pageItems.length === 0) break;
    sawAnyReview = true;
    for (const item of pageItems) {
      if (!isAfter(item.postedAt, opts.since)) {
        reachedSince = true;
        break;
      }
      if (lowOnly && (item.rating == null || item.rating > 3)) continue;
      collected.push(item);
      if (collected.length >= limit) break;
    }
  }

  if (!sawAnyReview) {
    throw new SourceError(`No reviews found for app ${c.appId} in the ${country} store yet.`);
  }
  return {
    items: uniqueItems(collected).slice(0, limit),
    label: `App Store ${country} (app ${c.appId})`,
    warnings: collected.length === 0 && lowOnly ? ["No recent 1 to 3 star reviews. Nothing to fix here yet."] : [],
    via: "direct",
  };
}
