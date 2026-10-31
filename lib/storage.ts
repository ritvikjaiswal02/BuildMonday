import type { AnalysisDiff, HistoryEntry, Issue, IssueStatus, PrdStub } from "./types";

/**
 * localStorage persistence for the anonymous analyzer at /app. Every accessor
 * is SSR-safe and swallows storage errors (private mode, quota, blocked site
 * data), so the analyzer works even when nothing can be saved.
 */

const KEY = "buildmonday:state";
const STATUS_KEY = "buildmonday:statuses";
const HISTORY_KEY = "buildmonday:history";
const SOURCE_KEY = "buildmonday:last-source";
const MAX_HISTORY = 10;

export interface PersistedState {
  issues: Issue[];
  prdData: Record<number, PrdStub>;
  /** Diff against the previous run, so a reload keeps the trend badges. */
  diff?: AnalysisDiff | null;
  /** The text that was analyzed, so "Add more complaints" can append to it after a reload. */
  text?: string;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or storage blocked: the analyzer keeps working in memory
  }
}

function remove(key: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadState(): PersistedState | null {
  const state = readJson<PersistedState>(KEY);
  if (!state || !Array.isArray(state.issues)) return null;
  return { ...state, prdData: state.prdData ?? {} };
}

export function saveState(state: PersistedState): void {
  writeJson(KEY, state);
}

export function clearState(): void {
  remove(KEY);
  remove(STATUS_KEY);
  remove(SOURCE_KEY);
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function loadStatuses(): Record<string, IssueStatus> {
  const value = readJson<Record<string, IssueStatus>>(STATUS_KEY);
  return value && typeof value === "object" ? value : {};
}

export function saveStatuses(statuses: Record<string, IssueStatus>): void {
  writeJson(STATUS_KEY, statuses);
}

export function clearStatuses(): void {
  remove(STATUS_KEY);
}

export function loadHistory(): HistoryEntry[] {
  const parsed = readJson<HistoryEntry[]>(HISTORY_KEY);
  return Array.isArray(parsed) ? parsed : [];
}

export function appendHistory(entry: HistoryEntry): void {
  const next = [entry, ...loadHistory()].slice(0, MAX_HISTORY);
  writeJson(HISTORY_KEY, next);
}

export function clearHistory(): void {
  remove(HISTORY_KEY);
}

/** The last URL fetched in the analyzer, used by the "Watch this every day" sign-up link. */
export function loadLastSource(): string | null {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(SOURCE_KEY);
  } catch {
    return null;
  }
}

export function saveLastSource(url: string | null): void {
  const s = storage();
  if (!s) return;
  try {
    if (url) s.setItem(SOURCE_KEY, url);
    else s.removeItem(SOURCE_KEY);
  } catch {
    // ignore
  }
}
