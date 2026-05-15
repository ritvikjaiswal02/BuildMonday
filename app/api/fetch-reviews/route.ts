import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

interface RssText {
  label?: string;
}
interface RssEntry {
  "im:rating"?: RssText;
  title?: RssText;
  content?: RssText | RssText[];
  author?: { name?: RssText };
}

interface ParsedSource {
  source: "appstore" | "reddit" | "trustpilot" | "hackernews";
}
interface AppStoreSource extends ParsedSource {
  source: "appstore";
  appId: string;
  country: string;
}
interface RedditSource extends ParsedSource {
  source: "reddit";
  kind: "thread" | "subreddit";
  path: string;
  label: string;
}
interface TrustpilotSource extends ParsedSource {
  source: "trustpilot";
  domain: string;
}
interface HackerNewsSource extends ParsedSource {
  source: "hackernews";
  itemId: string;
}

type DetectedSource = AppStoreSource | RedditSource | TrustpilotSource | HackerNewsSource;

const UA = "BuildMonday/1.0 (+https://buildmonday.local)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function extractRedditTimeFilter(input: string): string {
  const m = input.match(/[?&]t=(hour|day|week|month|year|all)\b/i);
  return m ? m[1].toLowerCase() : "month";
}

function detectSource(input: string): DetectedSource | null {
  const t = input.trim();
  if (!t) return null;

  const appStoreUrl = t.match(/apps\.apple\.com\/([a-z]{2})\/app\/[^/]+\/id(\d+)/i);
  if (appStoreUrl) {
    return { source: "appstore", country: appStoreUrl[1].toLowerCase(), appId: appStoreUrl[2] };
  }

  const trustpilot = t.match(/trustpilot\.com\/review\/([^/?#\s]+)/i);
  if (trustpilot) {
    return { source: "trustpilot", domain: trustpilot[1].toLowerCase() };
  }

  const hn = t.match(/news\.ycombinator\.com\/item\?id=(\d+)/i);
  if (hn) {
    return { source: "hackernews", itemId: hn[1] };
  }

  const redditThread = t.match(/reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)(?:\/([^/?#\s]*))?/i);
  if (redditThread) {
    const [, sub, id, slug] = redditThread;
    return {
      source: "reddit",
      kind: "thread",
      path: `/r/${sub}/comments/${id}${slug ? "/" + slug : ""}`,
      label: `r/${sub} thread`,
    };
  }

  const redditSubUrl = t.match(/reddit\.com\/r\/([^/?#\s]+)/i);
  if (redditSubUrl) {
    const tf = extractRedditTimeFilter(t);
    return {
      source: "reddit",
      kind: "subreddit",
      path: `/r/${redditSubUrl[1]}/top.json?t=${tf}&limit=30`,
      label: `r/${redditSubUrl[1]}`,
    };
  }
  const redditBare = t.match(/^r\/([a-z0-9_]+)$/i);
  if (redditBare) {
    return {
      source: "reddit",
      kind: "subreddit",
      path: `/r/${redditBare[1]}/top.json?t=month&limit=30`,
      label: `r/${redditBare[1]}`,
    };
  }

  const idMatch = t.match(/id(\d+)/i);
  if (idMatch) return { source: "appstore", country: "us", appId: idMatch[1] };
  if (/^\d+$/.test(t)) return { source: "appstore", country: "us", appId: t };

  return null;
}

function extractRssContent(entry: RssEntry): string {
  if (!entry.content) return "";
  if (Array.isArray(entry.content)) return entry.content[0]?.label ?? "";
  return entry.content.label ?? "";
}

async function fetchAppStore(s: AppStoreSource) {
  const rssUrl = `https://itunes.apple.com/${s.country}/rss/customerreviews/id=${s.appId}/sortby=mostrecent/json`;
  const res = await fetch(rssUrl, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `App ${s.appId} not found in ${s.country.toUpperCase()} store. Try matching the country code from the App Store URL.`
      );
    }
    throw new Error(`App Store returned ${res.status}`);
  }
  const json = (await res.json()) as { feed?: { entry?: RssEntry[] } };
  const entries = json.feed?.entry ?? [];
  if (entries.length === 0) {
    throw new Error(`No reviews found for App ${s.appId} in ${s.country.toUpperCase()} store.`);
  }
  const reviews = entries
    .filter((e) => e["im:rating"]?.label)
    .map((e) => {
      const rating = parseInt(e["im:rating"]?.label ?? "0", 10);
      const title = e.title?.label?.trim() ?? "";
      const content = extractRssContent(e).trim();
      const text = title && content ? `${title}. ${content}` : title || content;
      return { rating, text };
    })
    .filter((r) => r.rating >= 1 && r.rating <= 3 && r.text.length > 0)
    .slice(0, 50)
    .map((r) => r.text);
  if (reviews.length === 0) {
    throw new Error(
      `No 1-3 star reviews found for App ${s.appId} in ${s.country.toUpperCase()}. Try a different country or App ID.`
    );
  }
  return {
    reviews,
    totalFetched: reviews.length,
    sourceLabel: `App Store ${s.country.toUpperCase()} (App ${s.appId})`,
  };
}

interface RedditPostListing {
  data?: {
    children?: Array<{ data?: { title?: string; selftext?: string; ups?: number; over_18?: boolean } }>;
  };
}
interface RedditCommentListing {
  data?: {
    children?: Array<{
      kind?: string;
      data?: { body?: string; author?: string; ups?: number };
    }>;
  };
}

const cleanRedditText = (t: string) =>
  t
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchRedditDirect(s: RedditSource): Promise<string[]> {
  const url =
    s.kind === "thread"
      ? `https://www.reddit.com${s.path}.json?limit=200&raw_json=1`
      : `https://www.reddit.com${s.path}&raw_json=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Reddit direct returned ${res.status}`);
  const data = await res.json();
  const texts: string[] = [];
  if (s.kind === "thread" && Array.isArray(data) && data.length >= 2) {
    const [postBlock, commentBlock] = data as [RedditPostListing, RedditCommentListing];
    const post = postBlock?.data?.children?.[0]?.data;
    if (post?.selftext && post.selftext.length > 0) {
      const head = post.title ? `${post.title}. ` : "";
      texts.push(cleanRedditText(head + post.selftext));
    } else if (post?.title) {
      texts.push(cleanRedditText(post.title));
    }
    const comments = commentBlock?.data?.children ?? [];
    for (const c of comments) {
      if (c.kind !== "t1") continue;
      const body = c.data?.body;
      if (!body || body === "[deleted]" || body === "[removed]") continue;
      texts.push(cleanRedditText(body));
    }
  } else if (s.kind === "subreddit") {
    const listing = data as RedditPostListing;
    const posts = listing?.data?.children ?? [];
    for (const p of posts) {
      const d = p.data;
      if (!d || d.over_18) continue;
      const title = d.title?.trim() ?? "";
      const body = d.selftext?.trim() ?? "";
      const combined = body ? `${title}. ${body}` : title;
      if (combined.length > 20) texts.push(cleanRedditText(combined));
    }
  }
  return texts;
}

async function fetchRedditViaReader(s: RedditSource): Promise<string[]> {
  // Reddit blocks Vercel datacenter IPs. Route through r.jina.ai which fetches
  // public HTML and returns plain-text rendering. Free, no auth.
  const htmlPath =
    s.kind === "thread"
      ? s.path
      : s.path.replace(/\.json/, "/").replace(/&limit=\d+/g, "");
  const htmlUrl = `https://www.reddit.com${htmlPath}`;
  const proxyUrl = `https://r.jina.ai/${htmlUrl}`;
  const res = await fetch(proxyUrl, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/plain",
      "X-Return-Format": "text",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Reader proxy returned ${res.status}`);
  const raw = await res.text();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawLine of raw.split(/\n+/)) {
    const line = rawLine.trim();
    if (line.length < 30 || line.length > 1500) continue;
    if (/^[#=*_>\-\[!|]/.test(line)) continue; // markdown structural
    if (/^https?:\/\//.test(line)) continue;
    if (/^\d+\s+(comments?|points?|upvotes?)\b/i.test(line)) continue;
    if (/^(posted by|submitted by|by\s+u\/|share|save|report|hide|reply)\b/i.test(line))
      continue;
    if (/^URL Source:|^Markdown Content:|^Title:/i.test(line)) continue;
    const key = line.toLowerCase().slice(0, 90);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleanRedditText(line));
  }
  return out;
}

async function fetchReddit(s: RedditSource) {
  let texts: string[] = [];
  let proxyUsed = false;
  try {
    texts = await fetchRedditDirect(s);
  } catch (e) {
    console.warn("Reddit direct fetch failed, falling back to reader proxy:", e);
    try {
      texts = await fetchRedditViaReader(s);
      proxyUsed = true;
    } catch (e2) {
      console.error("Reddit reader-proxy fallback also failed:", e2);
      throw new Error(
        "Reddit is blocking our server right now. Open the thread in a browser, copy the text, and paste it in the Paste Text tab instead."
      );
    }
  }

  texts = texts.filter((t) => t.length >= 25 && t.length <= 1500).slice(0, 50);
  if (texts.length === 0) {
    throw new Error(
      `No usable posts/comments found in ${s.label}. Try a different thread or a busier subreddit.`
    );
  }
  return {
    reviews: texts,
    totalFetched: texts.length,
    sourceLabel: proxyUsed ? `${s.label} (via reader proxy)` : s.label,
  };
}

interface TpReview {
  text?: string;
  rating?: number;
  title?: string;
}

async function fetchTrustpilot(s: TrustpilotSource) {
  const url = `https://www.trustpilot.com/review/${s.domain}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html",
      },
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not reach Trustpilot.");
  }
  if (!res.ok) {
    throw new Error(
      `Trustpilot returned ${res.status}. They sometimes block automated requests; try a different domain or use the Paste Text tab.`
    );
  }
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) {
    throw new Error(
      "Trustpilot changed their page structure — can't parse reviews automatically. Try Paste Text instead."
    );
  }
  let nextData: unknown;
  try {
    nextData = JSON.parse(m[1]);
  } catch {
    throw new Error("Trustpilot data could not be parsed.");
  }
  const reviewsArr = findReviewsArray(nextData);
  if (!reviewsArr || reviewsArr.length === 0) {
    throw new Error(`No reviews found for ${s.domain} on Trustpilot.`);
  }
  const texts = reviewsArr
    .map((r) => {
      const rating = typeof r.rating === "number" ? r.rating : 0;
      const title = r.title?.trim() ?? "";
      const text = r.text?.trim() ?? "";
      const combined = title && text ? `${title}. ${text}` : title || text;
      return { rating, text: combined };
    })
    .filter((r) => r.rating >= 1 && r.rating <= 3 && r.text.length > 20)
    .slice(0, 50)
    .map((r) => r.text);
  if (texts.length === 0) {
    throw new Error(
      `No 1-3 star reviews found for ${s.domain} on Trustpilot.`
    );
  }
  return { reviews: texts, totalFetched: texts.length, sourceLabel: `Trustpilot · ${s.domain}` };
}

interface HnItem {
  title?: string;
  text?: string;
  type?: string;
  author?: string;
  points?: number;
  children?: HnItem[];
}

async function fetchHackerNews(s: HackerNewsSource) {
  const url = `https://hn.algolia.com/api/v1/items/${s.itemId}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Hacker News (Algolia) returned ${res.status}`);
  }
  const data = (await res.json()) as HnItem;

  const stripHtml = (s: string) =>
    s
      .replace(/<\/?p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();

  const texts: string[] = [];
  if (data.title) {
    const head = data.text ? `${data.title}. ${stripHtml(data.text)}` : data.title;
    if (head.length > 20) texts.push(head);
  }

  const walk = (items: HnItem[] | undefined) => {
    if (!items) return;
    for (const item of items) {
      if (item.type === "comment" && item.text) {
        const t = stripHtml(item.text);
        if (t.length >= 25 && t.length <= 1500) texts.push(t);
      }
      walk(item.children);
    }
  };
  walk(data.children);

  const limited = texts.slice(0, 50);
  if (limited.length === 0) {
    throw new Error(`No comments found on HN thread ${s.itemId}.`);
  }
  return {
    reviews: limited,
    totalFetched: limited.length,
    sourceLabel: `HN thread ${s.itemId}${data.title ? " · " + data.title : ""}`,
  };
}

function findReviewsArray(obj: unknown, depth = 0): TpReview[] | null {
  if (!obj || depth > 8) return null;
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
      const first = obj[0] as Record<string, unknown>;
      if ("text" in first && "rating" in first) return obj as TpReview[];
    }
    for (const item of obj) {
      const found = findReviewsArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === "object") {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      const found = findReviewsArray(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing URL or input" }, { status: 400 });
    }
    const parsed = detectSource(url);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Couldn't recognise that URL. Try an App Store link, a Reddit thread/subreddit URL, or a Trustpilot product page.",
        },
        { status: 400 }
      );
    }

    let result;
    if (parsed.source === "appstore") result = await fetchAppStore(parsed);
    else if (parsed.source === "reddit") result = await fetchReddit(parsed);
    else if (parsed.source === "hackernews") result = await fetchHackerNews(parsed);
    else result = await fetchTrustpilot(parsed);

    const sourceCode =
      parsed.source === "appstore"
        ? "appstore"
        : parsed.source === "reddit"
        ? "reddit"
        : parsed.source === "hackernews"
        ? "hn"
        : "manual";

    return NextResponse.json({ ...result, source: parsed.source, sourceCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch reviews";
    console.error("/api/fetch-reviews failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
