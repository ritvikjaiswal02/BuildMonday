/**
 * Pure helpers for the inbox: query strings, optimistic count updates and
 * the keyboard map. Kept separate from the component so they are testable.
 */
import type { FeedbackDTO } from "@/lib/db/dto";
import type { FeedbackSourceKind, FeedbackStatus } from "@/lib/db/schema";
import { FEEDBACK_KIND_ORDER, FEEDBACK_STATUS_ORDER } from "../labels";

// Local copies of the schema's value lists keep drizzle out of the client bundle.
const FEEDBACK_SOURCE_KINDS = FEEDBACK_KIND_ORDER;
const FEEDBACK_STATUSES = FEEDBACK_STATUS_ORDER;

export type InboxTab = FeedbackStatus | "all";

export interface InboxFilters {
  tab: InboxTab;
  sourceKind: FeedbackSourceKind | "";
  issueId: string;
  q: string;
}

export const DEFAULT_INBOX_FILTERS: InboxFilters = { tab: "new", sourceKind: "", issueId: "", q: "" };

export function parseInboxFilters(params: Record<string, string | string[] | undefined>): InboxFilters {
  const get = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const status = get("status");
  const tab: InboxTab =
    status === "all" ? "all" : (FEEDBACK_STATUSES as readonly string[]).includes(status) ? (status as FeedbackStatus) : "new";
  const kind = get("source");
  const sourceKind = (FEEDBACK_SOURCE_KINDS as readonly string[]).includes(kind) ? (kind as FeedbackSourceKind) : "";
  const issueId = /^[0-9a-zA-Z-]{1,64}$/.test(get("issueId")) ? get("issueId") : "";
  const q = get("q").slice(0, 200);
  // Filtering by issue usually means "everything in it", whatever its status.
  return { tab: issueId && !status ? "all" : tab, sourceKind, issueId, q };
}

/** Query string for GET /api/feedback. */
export function feedbackQuery(productId: string, f: InboxFilters, opts: { cursor?: string | null; limit?: number } = {}): string {
  const p = new URLSearchParams();
  p.set("productId", productId);
  if (f.tab !== "all") p.set("status", f.tab);
  if (f.sourceKind) p.set("sourceKind", f.sourceKind);
  if (f.issueId) p.set("issueId", f.issueId);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (opts.cursor) p.set("cursor", opts.cursor);
  p.set("limit", String(opts.limit ?? 50));
  return p.toString();
}

/** Search params for the page URL (only non-default values). */
export function inboxUrlQuery(f: InboxFilters): string {
  const p = new URLSearchParams();
  if (f.tab !== DEFAULT_INBOX_FILTERS.tab) p.set("status", f.tab);
  if (f.sourceKind) p.set("source", f.sourceKind);
  if (f.issueId) p.set("issueId", f.issueId);
  if (f.q.trim()) p.set("q", f.q.trim());
  return p.toString();
}

export function hasActiveFilters(f: InboxFilters): boolean {
  return Boolean(f.sourceKind || f.issueId || f.q.trim());
}

export type StatusCounts = Record<FeedbackStatus, number>;

export const EMPTY_COUNTS: StatusCounts = { new: 0, triaged: 0, archived: 0, spam: 0 };

/** Counts after moving `items` to `status`. Never goes below zero. */
export function applyStatusChange(counts: StatusCounts, items: Array<Pick<FeedbackDTO, "status">>, status: FeedbackStatus): StatusCounts {
  const next = { ...counts };
  for (const item of items) {
    if (item.status === status) continue;
    next[item.status] = Math.max(0, (next[item.status] ?? 0) - 1);
    next[status] = (next[status] ?? 0) + 1;
  }
  return next;
}

export function totalCount(counts: StatusCounts): number {
  return FEEDBACK_STATUSES.reduce((s, k) => s + (counts[k] ?? 0), 0);
}

/** Groups ids by their current status, for undoing a bulk status change. */
export function groupIdsByStatus(items: Array<Pick<FeedbackDTO, "id" | "status">>): Map<FeedbackStatus, string[]> {
  const out = new Map<FeedbackStatus, string[]>();
  for (const it of items) {
    const list = out.get(it.status) ?? [];
    list.push(it.id);
    out.set(it.status, list);
  }
  return out;
}

export type InboxKeyAction = "next" | "prev" | "toggle-select" | "archive" | "focus-search" | "expand" | "clear-selection" | null;

/** Keyboard map for the inbox list. Ignores keys with modifiers. */
export function inboxKeyAction(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): InboxKeyAction {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  switch (e.key) {
    case "j":
    case "ArrowDown":
      return "next";
    case "k":
    case "ArrowUp":
      return "prev";
    case "x":
      return "toggle-select";
    case "e":
      return "archive";
    case "/":
      return "focus-search";
    case "o":
    case "Enter":
      return "expand";
    case "Escape":
      return "clear-selection";
    default:
      return null;
  }
}

/** True when keyboard shortcuts should not fire (typing in a field). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/** Splits pasted text into feedback lines (max 500, each 3 to 4000 chars). */
export function parsePastedFeedback(raw: string): { lines: string[]; skipped: number; truncated: boolean } {
  const all = raw
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const valid = all.filter((s) => s.length >= 3 && s.length <= 4000);
  return { lines: valid.slice(0, 500), skipped: all.length - valid.length, truncated: valid.length > 500 };
}
