/**
 * Source config validation (zod) and human labels. Client-safe: no Node APIs.
 */
import { z } from "zod";
import type {
  AppStoreConfig,
  HackerNewsConfig,
  MonitorSourceKind,
  PlayStoreConfig,
  RedditConfig,
  SourceConfig,
  SourceConfigMap,
  TrustpilotConfig,
} from "@/lib/db/schema";

export const MONITOR_KIND_LABELS: Record<MonitorSourceKind, string> = {
  appstore: "App Store",
  playstore: "Google Play",
  reddit: "Reddit",
  hackernews: "Hacker News",
  trustpilot: "Trustpilot",
};

const countryCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}$/, "Use a two-letter country code, for example us or in.")
  .default("us");

const langCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,3}(-[a-z]{2,4})?$/, "Use a language code, for example en.")
  .default("en");

const appStoreSchema = z.object({
  appId: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().replace(/^id/i, ""))
    .pipe(z.string().regex(/^\d{5,12}$/, "The App Store app id is the number after \"id\" in the app's link.")),
  country: countryCode,
});

export const PACKAGE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;

const playStoreSchema = z.object({
  packageName: z
    .string()
    .trim()
    .regex(PACKAGE_NAME_RE, "The Google Play id looks like com.company.app (the id= part of the store link)."),
  country: countryCode,
  lang: langCode,
});

export const SUBREDDIT_RE = /^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/;

const subredditName = z
  .string()
  .trim()
  .transform((v) => v.replace(/^\/?r\//i, "").replace(/\/+$/, ""))
  .pipe(z.string().regex(SUBREDDIT_RE, "Use a subreddit name like r/acme."));

const keywordList = z
  .array(z.string())
  .default([])
  .transform((list) =>
    Array.from(new Set(list.map((k) => k.trim().replace(/\s+/g, " ")).filter((k) => k.length > 0))).slice(0, 10),
  )
  .pipe(z.array(z.string().max(60, "Keep each keyword under 60 characters.")));

const query = z
  .string()
  .trim()
  .min(2, "Add a search term of at least 2 characters.")
  .max(200, "Keep the search under 200 characters.");

export const REDDIT_THREAD_RE = /^https:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/[A-Za-z0-9_]+\/comments\/[a-z0-9]+(?:\/[^\s?#]*)?$/i;

const redditSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("subreddit"), subreddit: subredditName, keywords: keywordList }),
  z.object({ mode: z.literal("search"), query }),
  z.object({
    mode: z.literal("thread"),
    url: z
      .string()
      .trim()
      .transform((v) => v.replace(/[?#].*$/, "").replace(/\/+$/, ""))
      .pipe(z.string().regex(REDDIT_THREAD_RE, "Paste a Reddit thread link (reddit.com/r/.../comments/...).")),
  }),
]);

const hackerNewsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("search"), query }),
  z.object({
    mode: z.literal("thread"),
    itemId: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .pipe(z.string().regex(/^\d{1,10}$/, "A Hacker News item id is the number after item?id= in the link.")),
  }),
]);

export const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://www.Acme.com/path" -> "acme.com" (keeps subdomains other than www). */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

const trustpilotSchema = z.object({
  domain: z
    .string()
    .transform((v) => normalizeDomain(v.replace(/^.*trustpilot\.com\/review\//i, "")))
    .pipe(z.string().regex(DOMAIN_RE, "Use the website domain from the Trustpilot page, for example acme.com.")),
});

const SCHEMAS: { [K in MonitorSourceKind]: z.ZodType<SourceConfigMap[K], z.ZodTypeDef, unknown> } = {
  appstore: appStoreSchema as z.ZodType<AppStoreConfig, z.ZodTypeDef, unknown>,
  playstore: playStoreSchema as z.ZodType<PlayStoreConfig, z.ZodTypeDef, unknown>,
  reddit: redditSchema as z.ZodType<RedditConfig, z.ZodTypeDef, unknown>,
  hackernews: hackerNewsSchema as z.ZodType<HackerNewsConfig, z.ZodTypeDef, unknown>,
  trustpilot: trustpilotSchema as z.ZodType<TrustpilotConfig, z.ZodTypeDef, unknown>,
};

export function isMonitorSourceKind(value: unknown): value is MonitorSourceKind {
  return typeof value === "string" && value in SCHEMAS;
}

/** Validates and normalises a config for its kind. Errors are user-facing sentences. */
export function validateSourceConfig(
  kind: MonitorSourceKind,
  config: unknown,
): { ok: true; config: SourceConfig } | { ok: false; error: string } {
  if (!isMonitorSourceKind(kind)) return { ok: false, error: "That source type is not supported." };
  const result = SCHEMAS[kind].safeParse(config);
  if (result.success) return { ok: true, config: result.data as SourceConfig };
  const first = result.error.issues[0];
  if (!first) return { ok: false, error: "That source is not set up correctly." };
  if (first.code === "invalid_union_discriminator") {
    return { ok: false, error: "Choose how to watch this source (search, subreddit or thread)." };
  }
  if (first.code === "invalid_type" && first.received === "undefined") {
    return { ok: false, error: `${MONITOR_KIND_LABELS[kind]}: ${String(first.path.at(-1) ?? "a field")} is missing.` };
  }
  return { ok: false, error: first.message };
}

function truncateLabel(s: string, max = 60): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** "App Store (US) 123456789", "r/acme: acme notes", "HN search: acme". */
export function sourceLabel(kind: MonitorSourceKind, config: SourceConfig): string {
  switch (kind) {
    case "appstore": {
      const c = config as AppStoreConfig;
      return `App Store (${(c.country || "us").toUpperCase()}) ${c.appId}`;
    }
    case "playstore": {
      const c = config as PlayStoreConfig;
      return `Google Play (${(c.country || "us").toUpperCase()}) ${c.packageName}`;
    }
    case "reddit": {
      const c = config as RedditConfig;
      if (c.mode === "subreddit") {
        return truncateLabel(c.keywords.length > 0 ? `r/${c.subreddit}: ${c.keywords.join(", ")}` : `r/${c.subreddit}`);
      }
      if (c.mode === "search") return truncateLabel(`Reddit search: ${c.query}`);
      const m = c.url.match(/\/r\/([^/]+)\/comments\/([a-z0-9]+)/i);
      return m ? `Reddit thread in r/${m[1]} (${m[2]})` : "Reddit thread";
    }
    case "hackernews": {
      const c = config as HackerNewsConfig;
      return c.mode === "search" ? truncateLabel(`HN search: ${c.query}`) : `HN thread ${c.itemId}`;
    }
    case "trustpilot": {
      const c = config as TrustpilotConfig;
      return `Trustpilot: ${c.domain}`;
    }
    default:
      return "Source";
  }
}

/** Public links for a source, used in emails and the runs page. */
export function sourcePublicUrl(kind: MonitorSourceKind, config: SourceConfig): string | null {
  switch (kind) {
    case "appstore": {
      const c = config as AppStoreConfig;
      return `https://apps.apple.com/${c.country || "us"}/app/id${c.appId}`;
    }
    case "playstore": {
      const c = config as PlayStoreConfig;
      return `https://play.google.com/store/apps/details?id=${encodeURIComponent(c.packageName)}&hl=${c.lang || "en"}&gl=${c.country || "us"}`;
    }
    case "reddit": {
      const c = config as RedditConfig;
      if (c.mode === "subreddit") return `https://www.reddit.com/r/${c.subreddit}/`;
      if (c.mode === "search") return `https://www.reddit.com/search/?q=${encodeURIComponent(c.query)}&sort=new`;
      return c.url;
    }
    case "hackernews": {
      const c = config as HackerNewsConfig;
      return c.mode === "search"
        ? `https://hn.algolia.com/?dateRange=pastMonth&query=${encodeURIComponent(c.query)}&sort=byDate&type=all`
        : `https://news.ycombinator.com/item?id=${c.itemId}`;
    }
    case "trustpilot": {
      const c = config as TrustpilotConfig;
      return `https://www.trustpilot.com/review/${c.domain}`;
    }
    default:
      return null;
  }
}
