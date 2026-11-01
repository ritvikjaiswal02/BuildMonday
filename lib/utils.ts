import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names, resolving Tailwind conflicts (last wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(date: string | Date): Date {
  return date instanceof Date ? date : new Date(date);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Short calendar date: "12 Oct", or "12 Oct 2025" when the year differs from `now`.
 */
export function formatDate(date: string | Date, now: Date = new Date()): string {
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) return "";
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * Relative time for anything within a week, a short date otherwise.
 * Past: "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", "12 Oct".
 * Future: "in a moment", "in 5 min", "in 3 h", "tomorrow", "in 4 days", "12 Oct".
 */
export function formatRelativeTime(date: string | Date, now: Date = new Date()): string {
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) return "";
  const diff = now.getTime() - d.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;

  if (abs < MINUTE) return future ? "in a moment" : "just now";
  if (abs < HOUR) {
    const m = Math.floor(abs / MINUTE);
    return future ? `in ${m} min` : `${m} min ago`;
  }

  if (abs < DAY) {
    const h = Math.floor(abs / HOUR);
    return future ? `in ${h} h` : `${h} h ago`;
  }

  if (abs < 7 * DAY) {
    // Calendar-day distance (DST-safe via rounding).
    const dayDelta = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
    const days = Math.abs(dayDelta);
    if (days <= 1) return future ? "tomorrow" : "yesterday";
    if (days < 7) return future ? `in ${days} days` : `${days} days ago`;
  }
  return formatDate(d, now);
}

const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "1,234"; "12.3k" from 10,000; "1.2M" from a million. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${sign}${trimZero((abs / 1_000_000).toFixed(1))}M`;
  }
  if (abs >= 10_000) {
    return `${sign}${trimZero((abs / 1_000).toFixed(1))}k`;
  }
  return `${sign}${integerFormat.format(Math.round(abs))}`;
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** "1 issue", "3 issues", "0 issues". Uses formatNumber for the count. */
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : plural ?? `${singular}s`;
  return `${formatNumber(count)} ${word}`;
}

/** Shortens text to at most `max` characters, ending with "…" when cut. */
export function truncate(text: string, max: number): string {
  if (max <= 0) return "";
  const clean = text.trim();
  if (clean.length <= max) return clean;
  if (max === 1) return "…";
  const cut = clean.slice(0, max - 1);
  // Prefer to break at a word boundary when it does not lose too much.
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s.,;:!?-]+$/, "")}…`;
}

/** "850 ms", "12 s", "1 min 12 s", "1 h 4 min". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} s`;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return s > 0 ? `${m} min ${s} s` : `${m} min`;
}

/** Up to two initials from a name or email: "Ritvik Jaiswal" -> "RJ", "sam@x.io" -> "S". */
export function initials(nameOrEmail: string | null | undefined): string {
  const value = (nameOrEmail ?? "").trim();
  if (!value) return "?";
  const base = value.includes("@") ? value.split("@")[0] : value;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return value[0]!.toUpperCase();
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
