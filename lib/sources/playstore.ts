import type { PlayStoreConfig } from "@/lib/db/schema";
import {
  BROWSER_UA,
  SourceError,
  clampLimit,
  cleanText,
  fetchWithTimeout,
  isAfter,
  toIso,
  uniqueItems,
  type FetchOptions,
  type FetchResult,
  type RawFeedbackItem,
} from "./util";

/**
 * Google Play has no public reviews API. This uses the same `batchexecute`
 * RPC (UsvDTd) the store's web page calls. It is best effort: when Google
 * changes the format, the adapter fails with a clear message instead of
 * returning wrong data.
 */
const RPC_ID = "UsvDTd";
const SORT_NEWEST = 2;
const PAGE_SIZE = 100;
const MAX_PAGES = 4;

export function playStoreRpcUrl(c: PlayStoreConfig): string {
  const params = new URLSearchParams({
    rpcids: RPC_ID,
    "source-path": "/store/apps/details",
    "f.sid": "-697906427155521722",
    bl: "boq_playuiserver_20190903.08_p0",
    hl: c.lang || "en",
    gl: c.country || "us",
    authuser: "",
    "soc-app": "121",
    "soc-platform": "1",
    "soc-device": "1",
    _reqid: String(1000 + Math.floor(Math.random() * 90000)),
  });
  return `https://play.google.com/_/PlayStoreUi/data/batchexecute?${params.toString()}`;
}

export function playStoreRequestBody(packageName: string, count: number, token: string | null): string {
  const inner = JSON.stringify([null, null, [2, SORT_NEWEST, [count, null, token], null, []], [packageName, 7]]);
  const outer = JSON.stringify([[[RPC_ID, inner, null, "generic"]]]);
  return `f.req=${encodeURIComponent(outer)}`;
}

type Envelope = unknown[];

/** Finds the UsvDTd payload in a batchexecute response body. Exported for tests. */
export function parseBatchExecute(body: string): unknown | null {
  const cleaned = body.replace(/^\)\]\}'\s*/, "");
  const candidates: unknown[] = [];
  try {
    candidates.push(JSON.parse(cleaned));
  } catch {
    // Chunked form: length lines followed by JSON lines.
    for (const line of cleaned.split("\n")) {
      const l = line.trim();
      if (!l.startsWith("[")) continue;
      try {
        candidates.push(JSON.parse(l));
      } catch {
        // skip
      }
    }
  }
  for (const c of candidates) {
    if (!Array.isArray(c)) continue;
    for (const entry of c as Envelope[]) {
      if (Array.isArray(entry) && entry[0] === "wrb.fr" && entry[1] === RPC_ID) {
        const payload = entry[2];
        if (typeof payload !== "string") return null;
        try {
          return JSON.parse(payload);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function at(value: unknown, ...path: number[]): unknown {
  let cur: unknown = value;
  for (const i of path) {
    if (!Array.isArray(cur)) return undefined;
    cur = cur[i];
  }
  return cur;
}

/** Converts the RPC payload into items plus the next page token. Exported for tests. */
export function parsePlayReviews(
  payload: unknown,
  c: PlayStoreConfig,
): { items: RawFeedbackItem[]; nextToken: string | null } {
  const list = at(payload, 0);
  const items: RawFeedbackItem[] = [];
  if (Array.isArray(list)) {
    for (const r of list) {
      const id = at(r, 0);
      const text = at(r, 4);
      if (typeof id !== "string" || typeof text !== "string" || !text.trim()) continue;
      const score = at(r, 2);
      const author = at(r, 1, 0);
      const seconds = at(r, 5, 0);
      items.push({
        externalId: id,
        text: cleanText(text),
        author: typeof author === "string" ? author : undefined,
        rating: typeof score === "number" ? score : null,
        url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(c.packageName)}&hl=${c.lang || "en"}&reviewId=${encodeURIComponent(id)}`,
        postedAt: typeof seconds === "number" ? toIso(seconds) : null,
      });
    }
  }
  const token = at(payload, 1, 1);
  return { items, nextToken: typeof token === "string" && token.length > 0 ? token : null };
}

export async function fetchPlayStore(c: PlayStoreConfig, opts: FetchOptions = {}): Promise<FetchResult> {
  const limit = clampLimit(opts.limit);
  const lowOnly = opts.lowRatingOnly ?? true;
  const collected: RawFeedbackItem[] = [];
  let token: string | null = null;
  let sawAny = false;
  let reachedSince = false;

  for (let page = 0; page < MAX_PAGES && collected.length < limit && !reachedSince; page++) {
    const res = await fetchWithTimeout(
      playStoreRpcUrl(c),
      {
        method: "POST",
        headers: {
          "User-Agent": BROWSER_UA,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "*/*",
          Origin: "https://play.google.com",
          Referer: "https://play.google.com/",
        },
        body: playStoreRequestBody(c.packageName, PAGE_SIZE, token),
      },
      "Could not reach Google Play.",
    );
    if (!res.ok) {
      if (page > 0) break;
      throw new SourceError(`Google Play returned ${res.status}. Try again later, or paste the reviews into the inbox.`);
    }
    const payload = parseBatchExecute(await res.text());
    if (payload === null) {
      if (page > 0) break;
      throw new SourceError(
        `Google Play did not return reviews for ${c.packageName}. Check the app id (the id= part of the store link) and that the app is public in this country.`,
      );
    }
    const { items, nextToken } = parsePlayReviews(payload, c);
    if (items.length > 0) sawAny = true;
    for (const item of items) {
      if (!isAfter(item.postedAt, opts.since)) {
        reachedSince = true;
        break;
      }
      if (lowOnly && (item.rating == null || item.rating > 3)) continue;
      collected.push(item);
      if (collected.length >= limit) break;
    }
    if (!nextToken) break;
    token = nextToken;
  }

  if (!sawAny) {
    throw new SourceError(`No reviews found for ${c.packageName} on Google Play yet.`);
  }
  return {
    items: uniqueItems(collected).slice(0, limit),
    label: `Google Play ${(c.country || "us").toUpperCase()} (${c.packageName})`,
    warnings: collected.length === 0 && lowOnly ? ["No recent 1 to 3 star reviews. Nothing to fix here yet."] : [],
    via: "direct",
  };
}
