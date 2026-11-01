import LZString from "lz-string";
import type { Issue } from "./types";

/**
 * Share links for the anonymous analyzer: the ranked issues compressed into
 * the `results` query parameter. PRDs and statuses are not included, which
 * keeps links short enough for chat apps.
 */

const VERSION = 1;

interface SharedPayload {
  v: number;
  issues: Issue[];
}

/** Drops fields a shared view does not need (member indices can be long). */
function slim(issue: Issue): Issue {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { member_indices, ...rest } = issue;
  return rest;
}

function isIssueLike(value: unknown): value is Issue {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === "string" &&
    typeof v.frequency === "number" &&
    Array.isArray(v.evidence) &&
    typeof v.recommended_action === "string"
  );
}

export function encodeIssuesForShare(issues: Issue[]): string {
  const payload: SharedPayload = { v: VERSION, issues: issues.map(slim) };
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeIssuesFromShare(encoded: string): Issue[] | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const payload = JSON.parse(json) as Partial<SharedPayload>;
    if (!payload || !Array.isArray(payload.issues)) return null;
    const issues = payload.issues.filter(isIssueLike);
    return issues.length > 0 ? issues : null;
  } catch {
    return null;
  }
}

export function buildShareUrl(issues: Issue[]): string {
  if (typeof window === "undefined") return "";
  const encoded = encodeIssuesForShare(issues);
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("results", encoded);
  return url.toString();
}
