import LZString from "lz-string";
import type { Issue } from "./types";

const VERSION = 1;

interface SharedPayload {
  v: number;
  issues: Issue[];
}

export function encodeIssuesForShare(issues: Issue[]): string {
  const payload: SharedPayload = { v: VERSION, issues };
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeIssuesFromShare(encoded: string): Issue[] | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const payload = JSON.parse(json) as Partial<SharedPayload>;
    if (!payload || !Array.isArray(payload.issues)) return null;
    return payload.issues as Issue[];
  } catch {
    return null;
  }
}

export function buildShareUrl(issues: Issue[]): string {
  if (typeof window === "undefined") return "";
  const encoded = encodeIssuesForShare(issues);
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("results", encoded);
  return url.toString();
}
