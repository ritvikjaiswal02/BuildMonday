/**
 * Pure preparation of feedback before it is stored: trimming, size checks,
 * field sanitising, dedupe keys and link-spam detection. No database access.
 */
import type { FeedbackSourceKind, FeedbackStatus, SourceRole } from "@/lib/db/schema";
import { dedupeKey } from "@/lib/sources/dedupe";

export const MIN_FEEDBACK_TEXT = 3;
export const MAX_FEEDBACK_TEXT = 4000;
/** Text with more URLs than this is stored with status "spam". */
export const SPAM_URL_THRESHOLD = 3;
const MAX_META_BYTES = 4096;

export interface IngestItem {
  text: string;
  title?: string | null;
  author?: string | null;
  authorEmail?: string | null;
  rating?: number | null;
  url?: string | null;
  postedAt?: string | Date | null;
  externalId?: string | null;
  sourceKind: FeedbackSourceKind;
  role?: SourceRole;
  competitorName?: string | null;
  meta?: Record<string, unknown>;
  /** Defaults to "new". The widget endpoint passes "spam" for link spam. */
  status?: FeedbackStatus;
}

export interface PreparedFeedback {
  dedupeKey: string;
  text: string;
  title: string | null;
  author: string | null;
  authorEmail: string | null;
  rating: number | null;
  url: string | null;
  postedAt: Date | null;
  externalId: string | null;
  sourceKind: FeedbackSourceKind;
  role: SourceRole;
  competitorName: string | null;
  meta: Record<string, unknown>;
  status: FeedbackStatus;
}

export interface PrepareResult {
  rows: PreparedFeedback[];
  rejected: number;
  /** Items that repeat another item in the same batch. */
  batchDuplicates: number;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[a-z0-9-]+\.[a-z]{2,}[^\s<>"']*/gi;

export function countUrls(text: string): number {
  return (text.match(URL_RE) ?? []).length;
}

export function isLinkSpam(text: string): boolean {
  return countUrls(text) > SPAM_URL_THRESHOLD;
}

function shortString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeEmail(value: unknown): string | null {
  const t = shortString(value, 254);
  return t && EMAIL_RE.test(t) ? t.toLowerCase() : null;
}

export function sanitizeUrl(value: unknown): string | null {
  const t = shortString(value, 2000);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function sanitizeRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const r = Math.round(value);
  return r >= 1 && r <= 5 ? r : null;
}

export function sanitizeDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  // Ignore dates in the future (clock skew, bad parsing) beyond one day.
  if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return d;
}

/** Drops meta that is not plain JSON or is too large. */
export function sanitizeMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  try {
    const json = JSON.stringify(meta);
    if (json.length > MAX_META_BYTES) return {};
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Trims text, keeping paragraph breaks but collapsing other runs of whitespace. */
export function normalizeFeedbackText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

export function prepareIngestItems(productId: string, items: IngestItem[]): PrepareResult {
  const rows: PreparedFeedback[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  let batchDuplicates = 0;

  for (const item of items) {
    const text = typeof item.text === "string" ? normalizeFeedbackText(item.text) : "";
    if (text.length < MIN_FEEDBACK_TEXT || text.length > MAX_FEEDBACK_TEXT) {
      rejected++;
      continue;
    }
    const externalId = shortString(item.externalId, 200);
    const key = dedupeKey(productId, item.sourceKind, { externalId, text });
    if (seen.has(key)) {
      batchDuplicates++;
      continue;
    }
    seen.add(key);
    const role: SourceRole = item.role === "competitor" ? "competitor" : "own";
    rows.push({
      dedupeKey: key,
      text,
      title: shortString(item.title, 300),
      author: shortString(item.author, 120),
      authorEmail: sanitizeEmail(item.authorEmail),
      rating: sanitizeRating(item.rating),
      url: sanitizeUrl(item.url),
      postedAt: sanitizeDate(item.postedAt),
      externalId,
      sourceKind: item.sourceKind,
      role,
      competitorName: role === "competitor" ? shortString(item.competitorName, 80) : null,
      meta: sanitizeMeta(item.meta),
      status: item.status ?? "new",
    });
  }
  return { rows, rejected, batchDuplicates };
}
