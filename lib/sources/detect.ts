/**
 * Turns whatever someone pastes (a store link, a subreddit, a bare id) into a
 * typed source config. Client-safe: no Node APIs.
 */
import type { MonitorSourceKind, SourceConfig } from "@/lib/db/schema";
import { DOMAIN_RE, PACKAGE_NAME_RE, SUBREDDIT_RE, normalizeDomain, sourceLabel } from "./config";

export interface DetectedSource {
  kind: MonitorSourceKind;
  config: SourceConfig;
  label: string;
}

/** First segments that mark a reverse-DNS Android package name rather than a website. */
const PACKAGE_PREFIXES = new Set([
  "com", "org", "net", "io", "co", "app", "me", "ai", "dev", "in", "uk", "de", "fr", "br", "jp", "kr", "cn",
  "ru", "es", "it", "nl", "se", "au", "ca", "us", "tv", "gg", "so", "xyz", "info", "biz", "edu", "gov",
]);

function done(kind: MonitorSourceKind, config: SourceConfig): DetectedSource {
  return { kind, config, label: sourceLabel(kind, config) };
}

function searchParam(url: string, name: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.searchParams.get(name);
  } catch {
    const m = url.match(new RegExp(`[?&]${name}=([^&#]*)`, "i"));
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
  }
}

function looksLikePackage(s: string): boolean {
  if (!PACKAGE_NAME_RE.test(s)) return false;
  const first = s.split(".")[0].toLowerCase();
  return PACKAGE_PREFIXES.has(first);
}

/**
 * Detects a monitorable source from a URL or short form. Returns null when it
 * cannot tell. `hint` lets a form say which kind the field is for, which
 * unlocks bare forms that are ambiguous on their own (a bare domain for
 * Trustpilot, a bare query for Hacker News).
 */
export function detectSourceFromUrl(input: string, hint?: MonitorSourceKind): DetectedSource | null {
  const t = input.trim();
  if (!t) return null;

  // App Store: apps.apple.com/us/app/name/id123, apps.apple.com/app/id123, itunes.apple.com/...
  const appStore = t.match(/(?:apps|itunes)\.apple\.com\/(?:([a-z]{2})\/)?app\/(?:[^/?#]+\/)?id(\d{5,12})/i);
  if (appStore) {
    return done("appstore", { appId: appStore[2], country: (appStore[1] ?? "us").toLowerCase() });
  }

  // Google Play: play.google.com/store/apps/details?id=com.x.y&gl=in&hl=en
  if (/play\.google\.com\/store\/apps\/details/i.test(t)) {
    const id = searchParam(t, "id");
    if (id && PACKAGE_NAME_RE.test(id)) {
      const gl = (searchParam(t, "gl") ?? "us").toLowerCase();
      const hl = (searchParam(t, "hl") ?? "en").toLowerCase().split(/[-_]/)[0];
      return done("playstore", {
        packageName: id,
        country: /^[a-z]{2}$/.test(gl) ? gl : "us",
        lang: /^[a-z]{2,3}$/.test(hl) ? hl : "en",
      });
    }
    return null;
  }

  // Trustpilot: trustpilot.com/review/acme.com (any country subdomain)
  const trustpilot = t.match(/trustpilot\.com\/review\/([^/?#\s]+)/i);
  if (trustpilot) {
    const domain = normalizeDomain(trustpilot[1]);
    return DOMAIN_RE.test(domain) ? done("trustpilot", { domain }) : null;
  }

  // Hacker News thread and search
  const hnItem = t.match(/news\.ycombinator\.com\/item\?(?:[^#\s]*&)?id=(\d+)/i);
  if (hnItem) return done("hackernews", { mode: "thread", itemId: hnItem[1] });
  if (/hn\.algolia\.com/i.test(t)) {
    const q = searchParam(t, "query")?.trim();
    if (q && q.length >= 2) return done("hackernews", { mode: "search", query: q.slice(0, 200) });
    return null;
  }

  // Reddit thread
  const redditThread = t.match(/reddit\.com\/r\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)(?:\/([^/?#\s]*))?/i);
  if (redditThread) {
    const [, sub, id, slug] = redditThread;
    return done("reddit", {
      mode: "thread",
      url: `https://www.reddit.com/r/${sub}/comments/${id}${slug ? `/${slug}` : ""}`,
    });
  }

  // Reddit search, inside a subreddit or site-wide
  if (/reddit\.com\/(?:r\/[A-Za-z0-9_]+\/)?search/i.test(t)) {
    const q = searchParam(t, "q")?.trim();
    const sub = t.match(/reddit\.com\/r\/([A-Za-z0-9_]+)\/search/i)?.[1];
    if (q && sub && SUBREDDIT_RE.test(sub)) {
      return done("reddit", { mode: "subreddit", subreddit: sub, keywords: [q.slice(0, 60)] });
    }
    if (q && q.length >= 2) return done("reddit", { mode: "search", query: q.slice(0, 200) });
    return null;
  }

  // Subreddit URL or r/name
  const redditSub = t.match(/reddit\.com\/r\/([A-Za-z0-9_]+)/i) ?? t.match(/^\/?r\/([A-Za-z0-9_]+)\/?$/i);
  if (redditSub && SUBREDDIT_RE.test(redditSub[1])) {
    return done("reddit", { mode: "subreddit", subreddit: redditSub[1], keywords: [] });
  }

  // Bare forms
  const bareAppId = t.match(/^(?:id)?(\d{5,12})$/i);
  if (bareAppId && (!hint || hint === "appstore")) {
    return done("appstore", { appId: bareAppId[1], country: "us" });
  }
  if (bareAppId && hint === "hackernews") {
    return done("hackernews", { mode: "thread", itemId: bareAppId[1] });
  }

  if (hint === "playstore" ? PACKAGE_NAME_RE.test(t) : !hint && looksLikePackage(t)) {
    return done("playstore", { packageName: t, country: "us", lang: "en" });
  }

  if (hint === "trustpilot") {
    const domain = normalizeDomain(t);
    if (DOMAIN_RE.test(domain)) return done("trustpilot", { domain });
  }

  if (hint === "reddit" && SUBREDDIT_RE.test(t)) {
    return done("reddit", { mode: "subreddit", subreddit: t, keywords: [] });
  }

  if (hint === "hackernews" && t.length >= 2 && !/^https?:\/\//i.test(t)) {
    return done("hackernews", { mode: "search", query: t.slice(0, 200) });
  }

  return null;
}
