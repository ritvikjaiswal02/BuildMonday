import type { HistoryEntry, Issue, IssueStatus, PrdStub } from "./types";

const KEY = "buildmonday:state";
const STATUS_KEY = "buildmonday:statuses";
const HISTORY_KEY = "buildmonday:history";
const MAX_HISTORY = 10;

export interface PersistedState {
  issues: Issue[];
  prdData: Record<number, PrdStub>;
}

export function loadState(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function clearState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(STATUS_KEY);
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function loadStatuses(): Record<string, IssueStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STATUS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, IssueStatus>;
  } catch {
    return {};
  }
}

export function saveStatuses(statuses: Record<string, IssueStatus>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
  } catch {
    // ignore
  }
}

export function clearStatuses() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STATUS_KEY);
}

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendHistory(entry: HistoryEntry) {
  if (typeof window === "undefined") return;
  try {
    const existing = loadHistory();
    const next = [entry, ...existing].slice(0, MAX_HISTORY);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HISTORY_KEY);
}
