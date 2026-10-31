/**
 * Shared helpers for the source adapters: the item and result shapes, a
 * user-facing error type, fetch with a timeout and text cleanup.
 */

export interface RawFeedbackItem {
  /** The platform's own id when it has one (review id, comment id); null otherwise. */
  externalId: string | null;
  text: string;
  title?: string;
  author?: string;
  rating?: number | null;
  url?: string;
  /** ISO 8601 */
  postedAt?: string | null;
}

export interface FetchResult {
  items: RawFeedbackItem[];
  label: string;
  warnings: string[];
  via: "direct" | "proxy";
}

export interface FetchOptions {
  /** Only items posted after this moment (adapters that know dates honour it). */
  since?: Date | null;
  /** Maximum items to return. Default 50; the monitor passes 100. */
  limit?: number;
  /** Only 1 to 3 star reviews. Defaults to true for appstore, playstore and trustpilot. */
  lowRatingOnly?: boolean;
}

/** An error whose message is safe and useful to show to the person who added the source. */
export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export const BOT_UA = "BuildMonday/1.0 (+https://github.com/ritvikjaiswal02/BuildMonday)";
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
const DEFAULT_TIMEOUT_MS = 12_000;

export function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

/** fetch with a timeout; network failures and timeouts become SourceError with `unreachable`. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  unreachable = "Could not reach the source.",
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  try {
    return await fetch(url, { cache: "no-store", ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new SourceError(timedOut ? `${unreachable} The request timed out.` : unreachable);
  }
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&#x2F;": "/",
  "&#47;": "/",
  "&nbsp;": " ",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|nbsp|#39|#x27|#x2F|#47);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    });
}

/** HTML fragment to plain text (paragraphs become spaces). */
export function stripHtml(s: string): string {
  return decodeEntities(
    s
      .replace(/<\/?(p|br|div|li)[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapses whitespace to single spaces. */
export function cleanText(t: string): string {
  return t.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

/** "Title. Body" without doubling the title when the body repeats it. */
export function joinTitle(title: string | undefined | null, body: string | undefined | null): string {
  const t = (title ?? "").trim();
  const b = (body ?? "").trim();
  if (!t) return b;
  if (!b) return t;
  if (b.toLowerCase().startsWith(t.toLowerCase())) return b;
  const sep = /[.!?]$/.test(t) ? " " : ". ";
  return `${t}${sep}${b}`;
}

export function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d =
    typeof value === "number"
      ? new Date(value < 1e12 ? value * 1000 : value)
      : value instanceof Date
        ? value
        : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isAfter(postedAt: string | null | undefined, since: Date | null | undefined): boolean {
  if (!since || !postedAt) return true;
  const t = Date.parse(postedAt);
  return Number.isNaN(t) ? true : t > since.getTime();
}

/** Removes items with the same externalId or the same normalised text, keeping the first. */
export function uniqueItems(items: RawFeedbackItem[]): RawFeedbackItem[] {
  const seenIds = new Set<string>();
  const seenText = new Set<string>();
  const out: RawFeedbackItem[] = [];
  for (const item of items) {
    const textKey = item.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (item.externalId) {
      if (seenIds.has(item.externalId)) continue;
      seenIds.add(item.externalId);
    } else if (seenText.has(textKey)) {
      continue;
    }
    seenText.add(textKey);
    out.push(item);
  }
  return out;
}
