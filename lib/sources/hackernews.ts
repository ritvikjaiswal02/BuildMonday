import type { HackerNewsConfig } from "@/lib/db/schema";
import {
  BOT_UA,
  SourceError,
  clampLimit,
  fetchWithTimeout,
  isAfter,
  joinTitle,
  stripHtml,
  toIso,
  uniqueItems,
  type FetchOptions,
  type FetchResult,
  type RawFeedbackItem,
} from "./util";

/** Searches look back this far when there is no previous successful fetch. */
export const HN_DEFAULT_LOOKBACK_DAYS = 30;
const MIN_TEXT = 25;

interface AlgoliaHit {
  objectID?: string;
  title?: string | null;
  story_title?: string | null;
  comment_text?: string | null;
  story_text?: string | null;
  author?: string | null;
  created_at?: string | null;
  created_at_i?: number | null;
  url?: string | null;
  _tags?: string[];
}

interface HnItem {
  id?: number;
  title?: string | null;
  text?: string | null;
  type?: string;
  author?: string | null;
  created_at?: string | null;
  created_at_i?: number | null;
  children?: HnItem[];
}

export function hnSearchUrl(query: string, sinceUnix: number, hitsPerPage: number): string {
  const params = new URLSearchParams({
    query,
    tags: "(story,comment)",
    numericFilters: `created_at_i>${sinceUnix}`,
    hitsPerPage: String(hitsPerPage),
  });
  return `https://hn.algolia.com/api/v1/search_by_date?${params.toString()}`;
}

/** Exported for tests. */
export function parseHnSearch(json: { hits?: AlgoliaHit[] }): RawFeedbackItem[] {
  const out: RawFeedbackItem[] = [];
  for (const h of json.hits ?? []) {
    if (!h.objectID) continue;
    const isComment = h._tags?.includes("comment") || Boolean(h.comment_text);
    const text = isComment ? stripHtml(h.comment_text ?? "") : joinTitle(h.title, stripHtml(h.story_text ?? ""));
    if (text.length < MIN_TEXT) continue;
    out.push({
      externalId: h.objectID,
      text,
      title: isComment ? (h.story_title ?? undefined) : (h.title ?? undefined),
      author: h.author ?? undefined,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      postedAt: toIso(h.created_at ?? h.created_at_i ?? null),
    });
  }
  return out;
}

/** Flattens a discussion into the story plus every comment. Exported for tests. */
export function parseHnThread(item: HnItem): RawFeedbackItem[] {
  const out: RawFeedbackItem[] = [];
  if (item.title) {
    const head = joinTitle(item.title, item.text ? stripHtml(item.text) : "");
    if (head.length >= MIN_TEXT) {
      out.push({
        externalId: item.id != null ? String(item.id) : null,
        text: head,
        title: item.title,
        author: item.author ?? undefined,
        url: item.id != null ? `https://news.ycombinator.com/item?id=${item.id}` : undefined,
        postedAt: toIso(item.created_at ?? item.created_at_i ?? null),
      });
    }
  }
  const walk = (children: HnItem[] | undefined) => {
    for (const c of children ?? []) {
      if (c.type === "comment" && c.text) {
        const text = stripHtml(c.text);
        if (text.length >= MIN_TEXT) {
          out.push({
            externalId: c.id != null ? String(c.id) : null,
            text,
            author: c.author ?? undefined,
            url: c.id != null ? `https://news.ycombinator.com/item?id=${c.id}` : undefined,
            postedAt: toIso(c.created_at ?? c.created_at_i ?? null),
          });
        }
      }
      walk(c.children);
    }
  };
  walk(item.children);
  return out;
}

export async function fetchHackerNews(c: HackerNewsConfig, opts: FetchOptions = {}): Promise<FetchResult> {
  const limit = clampLimit(opts.limit);

  if (c.mode === "search") {
    const sinceMs = opts.since?.getTime() ?? Date.now() - HN_DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const res = await fetchWithTimeout(
      hnSearchUrl(c.query, Math.floor(sinceMs / 1000), Math.min(1000, Math.max(limit, 20))),
      { headers: { "User-Agent": BOT_UA, Accept: "application/json" } },
      "Could not reach Hacker News search.",
    );
    if (!res.ok) throw new SourceError(`Hacker News search returned ${res.status}. Try again later.`);
    const items = parseHnSearch((await res.json()) as { hits?: AlgoliaHit[] });
    return {
      items: uniqueItems(items).slice(0, limit),
      label: `HN search: ${c.query}`,
      warnings: items.length === 0 ? [`Nobody on Hacker News mentioned "${c.query}" in this period.`] : [],
      via: "direct",
    };
  }

  const res = await fetchWithTimeout(
    `https://hn.algolia.com/api/v1/items/${encodeURIComponent(c.itemId)}`,
    { headers: { "User-Agent": BOT_UA, Accept: "application/json" }, timeoutMs: 20_000 },
    "Could not reach Hacker News.",
  );
  if (res.status === 404) throw new SourceError(`Hacker News item ${c.itemId} was not found.`);
  if (!res.ok) throw new SourceError(`Hacker News returned ${res.status}. Try again later.`);
  const data = (await res.json()) as HnItem;
  const items = parseHnThread(data).filter((i) => isAfter(i.postedAt, opts.since));
  if (items.length === 0 && !opts.since) {
    throw new SourceError(`No comments found on Hacker News item ${c.itemId}.`);
  }
  return {
    items: uniqueItems(items).slice(0, limit),
    label: data.title ? `HN: ${data.title}` : `HN thread ${c.itemId}`,
    warnings: [],
    via: "direct",
  };
}
