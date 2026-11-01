/**
 * Client-safe parsing for the source fields in onboarding and settings.
 *
 * These turn what people paste into a form field (a store link, a bare id,
 * "r/acme, r/productivity") into the typed source configs from the schema.
 * The server validates every config again with `validateSourceConfig` from
 * lib/sources before saving; this module only gives instant feedback.
 *
 * Pure functions, no imports with runtime cost (types only).
 */
import type {
  AppStoreConfig,
  HackerNewsConfig,
  MonitorSourceKind,
  PlayStoreConfig,
  RedditConfig,
  SourceConfig,
  SourceRole,
  TrustpilotConfig,
} from "@/lib/db/schema";

export type { MonitorSourceKind, SourceConfig, SourceRole } from "@/lib/db/schema";

export const SOURCE_KINDS: MonitorSourceKind[] = ["appstore", "playstore", "reddit", "hackernews", "trustpilot"];

export const SOURCE_KIND_META: Record<
  MonitorSourceKind,
  { name: string; short: string; description: string }
> = {
  appstore: {
    name: "App Store",
    short: "App Store",
    description: "Recent 1 to 3 star reviews from one country store.",
  },
  playstore: {
    name: "Google Play",
    short: "Google Play",
    description: "Recent low-star reviews from the Play Store.",
  },
  reddit: {
    name: "Reddit",
    short: "Reddit",
    description: "New posts in a subreddit that mention your keywords, a search, or one thread.",
  },
  hackernews: {
    name: "Hacker News",
    short: "Hacker News",
    description: "Stories and comments that mention a keyword, or one discussion.",
  },
  trustpilot: {
    name: "Trustpilot",
    short: "Trustpilot",
    description: "Recent low-star reviews on a Trustpilot page.",
  },
};

/** Countries offered in the store selects, most common first. Codes are ISO-2 lowercase. */
export const STORE_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "us", name: "United States" },
  { code: "in", name: "India" },
  { code: "gb", name: "United Kingdom" },
  { code: "ca", name: "Canada" },
  { code: "au", name: "Australia" },
  { code: "de", name: "Germany" },
  { code: "fr", name: "France" },
  { code: "es", name: "Spain" },
  { code: "it", name: "Italy" },
  { code: "nl", name: "Netherlands" },
  { code: "se", name: "Sweden" },
  { code: "br", name: "Brazil" },
  { code: "mx", name: "Mexico" },
  { code: "jp", name: "Japan" },
  { code: "kr", name: "South Korea" },
  { code: "sg", name: "Singapore" },
  { code: "ae", name: "United Arab Emirates" },
  { code: "id", name: "Indonesia" },
  { code: "ie", name: "Ireland" },
  { code: "nz", name: "New Zealand" },
  { code: "za", name: "South Africa" },
  { code: "ng", name: "Nigeria" },
  { code: "ph", name: "Philippines" },
  { code: "pl", name: "Poland" },
  { code: "tr", name: "Turkey" },
];

export const PLAY_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "id", name: "Indonesian" },
  { code: "tr", name: "Turkish" },
  { code: "nl", name: "Dutch" },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clean(input: string): string {
  return input.trim().replace(/^<|>$/g, "");
}

/** Parses "https://x", "x.com/..." and "www.x.com" leniently. */
function toUrl(input: string): URL | null {
  const value = clean(input);
  if (!value || /\s/.test(value)) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function hostIs(url: URL, domain: string): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return host === domain || host.endsWith(`.${domain}`);
}

const ISO2 = /^[a-z]{2}$/;
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
const SUBREDDIT_RE = /^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/;

const WEB_TLDS = new Set(["com", "net", "org", "io", "app", "ai", "co", "dev", "so", "xyz", "tech", "me", "sh", "gg"]);

/** "acme.com" or "www.acme.io" rather than a reverse-domain package such as "com.acme.notes". */
export function looksLikeWebDomain(value: string): boolean {
  const parts = value.toLowerCase().split(".");
  if (parts[0] === "www") return true;
  if (WEB_TLDS.has(parts[0])) return false;
  return parts.length === 2 && WEB_TLDS.has(parts[1]);
}

export function normalizeCountry(code: string | null | undefined, fallback = "us"): string {
  const c = (code ?? "").trim().toLowerCase();
  return ISO2.test(c) ? c : fallback;
}

// ---------------------------------------------------------------------------
// Per-kind parsers
// ---------------------------------------------------------------------------

/**
 * "apps.apple.com/us/app/acme/id123456789", "id123456789" or "123456789".
 * The country comes from the link when present, else from `country`.
 */
export function parseAppStoreInput(input: string, country?: string): AppStoreConfig | null {
  const value = clean(input);
  if (!value) return null;

  const bare = /^(?:id)?(\d{6,12})$/i.exec(value);
  if (bare) return { appId: bare[1], country: normalizeCountry(country) };

  const url = toUrl(value);
  if (!url || !(hostIs(url, "apps.apple.com") || hostIs(url, "itunes.apple.com"))) return null;
  const id = /\/id(\d{6,12})(?:[/?#]|$)/i.exec(url.pathname + url.search) ?? /[?&]id=(\d{6,12})/.exec(url.search);
  if (!id) return null;
  const pathCountry = /^\/([a-z]{2})\//i.exec(url.pathname)?.[1];
  return { appId: id[1], country: normalizeCountry(pathCountry ?? country) };
}

/** "play.google.com/store/apps/details?id=com.acme.notes&hl=en&gl=IN" or "com.acme.notes". */
export function parsePlayStoreInput(
  input: string,
  defaults?: { country?: string; lang?: string },
): PlayStoreConfig | null {
  const value = clean(input);
  if (!value) return null;
  const country = normalizeCountry(defaults?.country);
  const lang = normalizeCountry(defaults?.lang, "en");

  if (PACKAGE_RE.test(value) && !/^https?:/i.test(value) && !value.includes("/")) {
    // A bare domain such as "acme.com" also matches the package shape.
    if (looksLikeWebDomain(value)) return null;
    return { packageName: value, country, lang };
  }

  const url = toUrl(value);
  if (!url || !hostIs(url, "play.google.com")) return null;
  const pkg = url.searchParams.get("id");
  if (!pkg || !PACKAGE_RE.test(pkg)) return null;
  const gl = url.searchParams.get("gl");
  const hl = url.searchParams.get("hl")?.split(/[-_]/)[0];
  return { packageName: pkg, country: normalizeCountry(gl, country), lang: normalizeCountry(hl, lang) };
}

/** "trustpilot.com/review/acme.com", "https://acme.com" or "acme.com". */
export function parseTrustpilotInput(input: string): TrustpilotConfig | null {
  const value = clean(input).toLowerCase();
  if (!value) return null;

  const url = toUrl(value);
  if (url && hostIs(url, "trustpilot.com")) {
    const m = /^\/review\/([^/?#]+)/.exec(url.pathname);
    if (!m) return null;
    const domain = decodeURIComponent(m[1]).replace(/^www\./, "");
    return DOMAIN_RE.test(domain) ? { domain } : null;
  }
  if (!url) return null;
  const domain = url.hostname.replace(/^www\./, "");
  if (!DOMAIN_RE.test(domain)) return null;
  // A path on someone else's site is not a Trustpilot page; only accept bare domains or root URLs.
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return { domain };
}

/** One subreddit name from "r/acme", "/r/acme/", "reddit.com/r/acme" or "acme". */
export function parseSubredditName(input: string): string | null {
  let value = clean(input);
  if (!value) return null;
  const url = /reddit\.com/i.test(value) ? toUrl(value) : null;
  if (url) {
    const m = /^\/r\/([^/?#]+)/i.exec(url.pathname);
    if (!m) return null;
    value = m[1];
  }
  value = value.replace(/^\/?r\//i, "").replace(/\/+$/, "");
  return SUBREDDIT_RE.test(value) ? value : null;
}

/** Comma, space or newline separated subreddits. Deduplicated case-insensitively. */
export function parseSubreddits(input: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of input.split(/[\s,;]+/)) {
    if (!part.trim()) continue;
    const name = parseSubredditName(part);
    if (!name) {
      invalid.push(part.trim());
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(name);
  }
  return { valid, invalid };
}

export const MAX_KEYWORDS = 10;
export const MAX_KEYWORD_LENGTH = 60;

/** Comma or newline separated phrases, trimmed and deduplicated case-insensitively. */
export function parseKeywords(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of input.split(/[,\n;]+/)) {
    const phrase = part.trim().replace(/\s+/g, " ").replace(/^["']|["']$/g, "");
    if (phrase.length < 2) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase.slice(0, MAX_KEYWORD_LENGTH));
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/** The product name plus keywords, deduplicated: what we search Reddit and Hacker News for. */
export function searchTerms(productName: string, keywords: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const term of [productName.trim(), ...keywords]) {
    const t = term.trim();
    if (t.length < 2) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.slice(0, MAX_KEYWORD_LENGTH));
  }
  return out;
}

/** A reddit thread link, a subreddit, or null. */
export function parseRedditInput(input: string): RedditConfig | null {
  const value = clean(input);
  if (!value) return null;
  const url = /reddit\.com|redd\.it/i.test(value) ? toUrl(value) : null;
  if (url) {
    if (/\/comments\/[a-z0-9]+/i.test(url.pathname) || hostIs(url, "redd.it")) {
      url.search = "";
      url.hash = "";
      return { mode: "thread", url: url.toString() };
    }
    const sub = parseSubredditName(value);
    return sub ? { mode: "subreddit", subreddit: sub, keywords: [] } : null;
  }
  if (/^\/?r\//i.test(value)) {
    const sub = parseSubredditName(value);
    return sub ? { mode: "subreddit", subreddit: sub, keywords: [] } : null;
  }
  return null;
}

/** "news.ycombinator.com/item?id=123" or "123" (thread). Anything else is not a link. */
export function parseHackerNewsInput(input: string): HackerNewsConfig | null {
  const value = clean(input);
  if (!value) return null;
  if (/^\d{3,12}$/.test(value)) return { mode: "thread", itemId: value };
  const url = toUrl(value);
  if (!url || !hostIs(url, "news.ycombinator.com")) return null;
  const id = url.searchParams.get("id");
  return id && /^\d{3,12}$/.test(id) ? { mode: "thread", itemId: id } : null;
}

export interface DetectedInput {
  kind: MonitorSourceKind;
  config: SourceConfig;
  label: string;
}

/**
 * Recognises a pasted link or id. Used by the competitor field and the smart
 * paste box in "Add source". `allowBareDomain` treats "acme.com" as a
 * Trustpilot page (the competitor field hints that).
 */
export function detectSourceInput(input: string, opts?: { allowBareDomain?: boolean }): DetectedInput | null {
  const value = clean(input);
  if (!value) return null;

  const tries: Array<() => DetectedInput | null> = [
    () => {
      if (!/apple\.com/i.test(value) && !/^(?:id)?\d{6,12}$/i.test(value)) return null;
      const c = parseAppStoreInput(value);
      return c ? { kind: "appstore", config: c, label: describeSource("appstore", c) } : null;
    },
    () => {
      const c = parsePlayStoreInput(value);
      return c ? { kind: "playstore", config: c, label: describeSource("playstore", c) } : null;
    },
    () => {
      if (!/trustpilot\.com/i.test(value)) return null;
      const c = parseTrustpilotInput(value);
      return c ? { kind: "trustpilot", config: c, label: describeSource("trustpilot", c) } : null;
    },
    () => {
      const c = parseRedditInput(value);
      return c ? { kind: "reddit", config: c, label: describeSource("reddit", c) } : null;
    },
    () => {
      if (!/ycombinator\.com/i.test(value)) return null;
      const c = parseHackerNewsInput(value);
      return c ? { kind: "hackernews", config: c, label: describeSource("hackernews", c) } : null;
    },
    () => {
      if (!opts?.allowBareDomain) return null;
      const c = parseTrustpilotInput(value);
      return c ? { kind: "trustpilot", config: c, label: describeSource("trustpilot", c) } : null;
    },
  ];

  for (const attempt of tries) {
    const found = attempt();
    if (found) return found;
  }
  return null;
}

/** Plain-language name for a source config, close to lib/sources `sourceLabel`. */
export function describeSource(kind: MonitorSourceKind, config: SourceConfig): string {
  switch (kind) {
    case "appstore": {
      const c = config as AppStoreConfig;
      return `App Store (${c.country.toUpperCase()}) ${c.appId}`;
    }
    case "playstore": {
      const c = config as PlayStoreConfig;
      return `Google Play ${c.packageName}`;
    }
    case "reddit": {
      const c = config as RedditConfig;
      if (c.mode === "subreddit") {
        return c.keywords.length > 0 ? `r/${c.subreddit}: ${c.keywords.join(", ")}` : `r/${c.subreddit}`;
      }
      if (c.mode === "search") return `Reddit search: ${c.query}`;
      return `Reddit thread ${shortThread(c.url)}`;
    }
    case "hackernews": {
      const c = config as HackerNewsConfig;
      return c.mode === "search" ? `HN search: ${c.query}` : `HN thread ${c.itemId}`;
    }
    case "trustpilot":
      return `Trustpilot ${(config as TrustpilotConfig).domain}`;
    default:
      return "Source";
  }
}

function shortThread(url: string): string {
  const m = /\/r\/([^/]+)\/comments\/([a-z0-9]+)/i.exec(url);
  return m ? `r/${m[1]} ${m[2]}` : url.replace(/^https?:\/\/(www\.)?/, "");
}

/** Stable key so the same source is not added twice. Key order and case do not matter. */
export function sourceFingerprint(kind: MonitorSourceKind, config: SourceConfig): string {
  return `${kind}:${stableStringify(config).toLowerCase()}`;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** A source a form wants to create. */
export interface SourceDraft {
  kind: MonitorSourceKind;
  config: SourceConfig;
  role: SourceRole;
  competitorName: string | null;
  label: string;
}
