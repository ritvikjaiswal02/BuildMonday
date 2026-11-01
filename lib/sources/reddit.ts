import type { RedditConfig } from "@/lib/db/schema";
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

export interface RedditFetchOptions extends FetchOptions {
  /** Listing for a subreddit without keywords. The monitor uses "new"; the free analyzer uses "top". */
  listing?: "new" | "top";
  /** Time filter for "top" and for searches. */
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
}

interface RedditThing {
  kind?: string;
  data?: {
    name?: string;
    id?: string;
    title?: string;
    selftext?: string;
    body?: string;
    author?: string;
    permalink?: string;
    created_utc?: number;
    over_18?: boolean;
    stickied?: boolean;
    replies?: RedditListing | "";
    children?: RedditThing[];
  };
}
interface RedditListing {
  kind?: string;
  data?: { children?: RedditThing[] };
}

const MIN_TEXT = 20;
const REMOVED = new Set(["[deleted]", "[removed]"]);

/** OR-joins keywords for Reddit search, quoting phrases. */
export function redditKeywordQuery(keywords: string[]): string {
  return keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => (/\s/.test(k) ? `"${k.replace(/"/g, "")}"` : k))
    .join(" OR ");
}

/** The JSON endpoint for a config. Exported for tests. */
export function redditJsonUrl(c: RedditConfig, opts: RedditFetchOptions = {}): string {
  const t = opts.timeFilter ?? "month";
  switch (c.mode) {
    case "subreddit": {
      if (c.keywords.length > 0) {
        const q = encodeURIComponent(redditKeywordQuery(c.keywords));
        return `https://www.reddit.com/r/${c.subreddit}/search.json?q=${q}&restrict_sr=1&sort=new&t=${t}&limit=100&raw_json=1`;
      }
      const listing = opts.listing ?? "new";
      return listing === "top"
        ? `https://www.reddit.com/r/${c.subreddit}/top.json?t=${t}&limit=100&raw_json=1`
        : `https://www.reddit.com/r/${c.subreddit}/new.json?limit=100&raw_json=1`;
    }
    case "search":
      return `https://www.reddit.com/search.json?q=${encodeURIComponent(c.query)}&sort=new&t=${t}&limit=100&raw_json=1`;
    case "thread":
      return `${c.url.replace(/\/+$/, "")}.json?limit=500&sort=new&raw_json=1`;
  }
}

/** The HTML page the reader proxy renders when Reddit blocks the JSON API. */
export function redditHtmlUrl(c: RedditConfig, opts: RedditFetchOptions = {}): string {
  switch (c.mode) {
    case "subreddit":
      if (c.keywords.length > 0) {
        return `https://www.reddit.com/r/${c.subreddit}/search/?q=${encodeURIComponent(redditKeywordQuery(c.keywords))}&restrict_sr=1&sort=new`;
      }
      return opts.listing === "top"
        ? `https://www.reddit.com/r/${c.subreddit}/top/?t=${opts.timeFilter ?? "month"}`
        : `https://www.reddit.com/r/${c.subreddit}/new/`;
    case "search":
      return `https://www.reddit.com/search/?q=${encodeURIComponent(c.query)}&sort=new`;
    case "thread":
      return c.url;
  }
}

function postItem(d: NonNullable<RedditThing["data"]>): RawFeedbackItem | null {
  if (d.over_18 || d.stickied) return null;
  const body = d.selftext && !REMOVED.has(d.selftext) ? d.selftext : "";
  const text = cleanText(joinTitle(d.title, body));
  if (text.length < MIN_TEXT) return null;
  return {
    externalId: d.name ?? (d.id ? `t3_${d.id}` : null),
    text,
    title: d.title?.trim() || undefined,
    author: d.author && !REMOVED.has(d.author) ? d.author : undefined,
    url: d.permalink ? `https://www.reddit.com${d.permalink}` : undefined,
    postedAt: toIso(d.created_utc),
  };
}

function commentItem(d: NonNullable<RedditThing["data"]>): RawFeedbackItem | null {
  const body = d.body ?? "";
  if (!body || REMOVED.has(body)) return null;
  const text = cleanText(body);
  if (text.length < MIN_TEXT) return null;
  return {
    externalId: d.name ?? (d.id ? `t1_${d.id}` : null),
    text,
    author: d.author && !REMOVED.has(d.author) ? d.author : undefined,
    url: d.permalink ? `https://www.reddit.com${d.permalink}` : undefined,
    postedAt: toIso(d.created_utc),
  };
}

function walkComments(things: RedditThing[] | undefined, out: RawFeedbackItem[]) {
  if (!things) return;
  for (const c of things) {
    if (c.kind !== "t1" || !c.data) continue;
    const item = commentItem(c.data);
    if (item) out.push(item);
    const replies = c.data.replies;
    if (replies && typeof replies === "object") walkComments(replies.data?.children, out);
  }
}

/** Parses a Reddit JSON response (listing or [post, comments]). Exported for tests. */
export function parseRedditJson(data: unknown, mode: RedditConfig["mode"]): RawFeedbackItem[] {
  const out: RawFeedbackItem[] = [];
  if (mode === "thread") {
    if (!Array.isArray(data) || data.length < 1) return out;
    const [postBlock, commentBlock] = data as [RedditListing, RedditListing | undefined];
    const post = postBlock?.data?.children?.[0]?.data;
    if (post) {
      const item = postItem({ ...post, stickied: false });
      if (item) out.push(item);
    }
    walkComments(commentBlock?.data?.children, out);
    return out;
  }
  const listing = data as RedditListing;
  for (const child of listing?.data?.children ?? []) {
    if (child.kind && child.kind !== "t3") continue;
    if (!child.data) continue;
    const item = postItem(child.data);
    if (item) out.push(item);
  }
  return out;
}

/** Extracts readable lines from the reader proxy's plain-text rendering. Exported for tests. */
export function parseReaderText(raw: string): RawFeedbackItem[] {
  const seen = new Set<string>();
  const out: RawFeedbackItem[] = [];
  for (const rawLine of raw.split(/\n+/)) {
    const line = rawLine.trim();
    if (line.length < 30 || line.length > 4000) continue;
    if (/^[#=*_>\-[!|]/.test(line)) continue;
    if (/^https?:\/\//.test(line)) continue;
    if (/^\d+\s+(comments?|points?|upvotes?|votes?)\b/i.test(line)) continue;
    if (/^(posted by|submitted by|by\s+u\/|share|save|report|hide|reply|sort by)\b/i.test(line)) continue;
    if (/^(URL Source|Markdown Content|Title|Published Time):/i.test(line)) continue;
    const key = line.toLowerCase().slice(0, 90);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ externalId: null, text: cleanText(line) });
  }
  return out;
}

async function fetchDirect(c: RedditConfig, opts: RedditFetchOptions): Promise<RawFeedbackItem[]> {
  const res = await fetchWithTimeout(
    redditJsonUrl(c, opts),
    {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json", "Accept-Language": "en-US,en;q=0.9" },
    },
    "Could not reach Reddit.",
  );
  if (res.status === 404) {
    throw new SourceError(
      c.mode === "subreddit" ? `r/${c.subreddit} does not exist or is private.` : "That Reddit thread was not found.",
    );
  }
  if (res.status === 403 && c.mode === "subreddit") {
    throw new SourceError(`r/${c.subreddit} is private or quarantined, so it cannot be read.`);
  }
  if (!res.ok) throw new Error(`Reddit returned ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new Error("Reddit returned a non-JSON page");
  return parseRedditJson(await res.json(), c.mode);
}

async function fetchViaReader(c: RedditConfig, opts: RedditFetchOptions): Promise<RawFeedbackItem[]> {
  // Reddit often blocks datacenter IPs. r.jina.ai fetches the public page and
  // returns a plain-text rendering. Items lose their ids, links and dates.
  const res = await fetchWithTimeout(
    `https://r.jina.ai/${redditHtmlUrl(c, opts)}`,
    { headers: { "User-Agent": BROWSER_UA, Accept: "text/plain", "X-Return-Format": "text" }, timeoutMs: 20_000 },
    "Could not reach Reddit.",
  );
  if (!res.ok) throw new Error(`Reader proxy returned ${res.status}`);
  return parseReaderText(await res.text());
}

export async function fetchReddit(c: RedditConfig, opts: RedditFetchOptions = {}): Promise<FetchResult> {
  const limit = clampLimit(opts.limit);
  let items: RawFeedbackItem[];
  let via: FetchResult["via"] = "direct";
  const warnings: string[] = [];
  try {
    items = await fetchDirect(c, opts);
  } catch (err) {
    if (err instanceof SourceError) throw err;
    try {
      items = await fetchViaReader(c, opts);
      via = "proxy";
      warnings.push("Reddit blocked the direct request, so we read the public page instead. Links and dates are missing.");
    } catch {
      throw new SourceError(
        "Reddit blocked this request. Try again later or paste the thread text into the inbox.",
      );
    }
  }

  const filtered = uniqueItems(items.filter((i) => isAfter(i.postedAt, opts.since))).slice(0, limit);
  return { items: filtered, label: labelFor(c), warnings, via };
}

function labelFor(c: RedditConfig): string {
  if (c.mode === "subreddit") return c.keywords.length ? `r/${c.subreddit} (${c.keywords.join(", ")})` : `r/${c.subreddit}`;
  if (c.mode === "search") return `Reddit search: ${c.query}`;
  const m = c.url.match(/\/r\/([^/]+)\/comments\/([a-z0-9]+)/i);
  return m ? `r/${m[1]} thread` : "Reddit thread";
}
