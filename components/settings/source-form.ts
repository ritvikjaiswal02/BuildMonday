/**
 * Form model for the "Add source" / "Edit source" dialog: one flat form state
 * for every kind, converted to and from the typed source configs. Pure.
 */
import type {
  AppStoreConfig,
  HackerNewsConfig,
  PlayStoreConfig,
  RedditConfig,
  TrustpilotConfig,
} from "@/lib/db/schema";
import {
  normalizeCountry,
  parseAppStoreInput,
  parseHackerNewsInput,
  parseKeywords,
  parsePlayStoreInput,
  parseRedditInput,
  parseSubredditName,
  parseTrustpilotInput,
  type MonitorSourceKind,
  type SourceConfig,
} from "@/components/onboarding/source-input";

export type RedditMode = RedditConfig["mode"];
export type HackerNewsMode = HackerNewsConfig["mode"];

export interface SourceFormState {
  kind: MonitorSourceKind;
  appInput: string;
  appCountry: string;
  playInput: string;
  playCountry: string;
  playLang: string;
  redditMode: RedditMode;
  subreddit: string;
  redditKeywords: string;
  redditQuery: string;
  redditThread: string;
  hnMode: HackerNewsMode;
  hnQuery: string;
  hnThread: string;
  trustpilot: string;
}

export function emptySourceForm(kind: MonitorSourceKind = "appstore", productName = ""): SourceFormState {
  return {
    kind,
    appInput: "",
    appCountry: "us",
    playInput: "",
    playCountry: "us",
    playLang: "en",
    redditMode: "subreddit",
    subreddit: "",
    redditKeywords: productName.trim(),
    redditQuery: productName.trim(),
    redditThread: "",
    hnMode: "search",
    hnQuery: productName.trim(),
    hnThread: "",
    trustpilot: "",
  };
}

/** Fills the form from a saved or detected config. */
export function formFromConfig(
  kind: MonitorSourceKind,
  config: SourceConfig,
  base: SourceFormState = emptySourceForm(kind),
): SourceFormState {
  const form: SourceFormState = { ...base, kind };
  switch (kind) {
    case "appstore": {
      const c = config as AppStoreConfig;
      form.appInput = c.appId;
      form.appCountry = normalizeCountry(c.country);
      break;
    }
    case "playstore": {
      const c = config as PlayStoreConfig;
      form.playInput = c.packageName;
      form.playCountry = normalizeCountry(c.country);
      form.playLang = normalizeCountry(c.lang, "en");
      break;
    }
    case "reddit": {
      const c = config as RedditConfig;
      form.redditMode = c.mode;
      if (c.mode === "subreddit") {
        form.subreddit = c.subreddit;
        if (c.keywords.length > 0) form.redditKeywords = c.keywords.join(", ");
      } else if (c.mode === "search") form.redditQuery = c.query;
      else form.redditThread = c.url;
      break;
    }
    case "hackernews": {
      const c = config as HackerNewsConfig;
      form.hnMode = c.mode;
      if (c.mode === "search") form.hnQuery = c.query;
      else form.hnThread = c.itemId;
      break;
    }
    case "trustpilot":
      form.trustpilot = (config as TrustpilotConfig).domain;
      break;
    default:
  }
  return form;
}

export type FormField =
  | "appInput"
  | "playInput"
  | "subreddit"
  | "redditKeywords"
  | "redditQuery"
  | "redditThread"
  | "hnQuery"
  | "hnThread"
  | "trustpilot";

export type ConfigResult = { ok: true; config: SourceConfig } | { ok: false; field: FormField; error: string };

/** Builds the config for the form's kind, or the first field error. */
export function configFromForm(form: SourceFormState): ConfigResult {
  switch (form.kind) {
    case "appstore": {
      if (!form.appInput.trim()) return { ok: false, field: "appInput", error: "Paste an App Store link or app ID." };
      const c = parseAppStoreInput(form.appInput, form.appCountry);
      if (!c) return { ok: false, field: "appInput", error: "Use an App Store link or the numeric app ID, like 123456789." };
      // An explicit country choice wins over the one in a pasted link.
      return { ok: true, config: { appId: c.appId, country: normalizeCountry(form.appCountry, c.country) } };
    }
    case "playstore": {
      if (!form.playInput.trim()) return { ok: false, field: "playInput", error: "Paste a Google Play link or package name." };
      const c = parsePlayStoreInput(form.playInput, { country: form.playCountry, lang: form.playLang });
      if (!c) {
        return { ok: false, field: "playInput", error: "Use a Google Play link or the package name, like com.acme.notes." };
      }
      return {
        ok: true,
        config: { packageName: c.packageName, country: normalizeCountry(form.playCountry), lang: normalizeCountry(form.playLang, "en") },
      };
    }
    case "reddit": {
      if (form.redditMode === "subreddit") {
        const sub = parseSubredditName(form.subreddit);
        if (!sub) return { ok: false, field: "subreddit", error: "Enter a subreddit, like r/productivity." };
        const keywords = parseKeywords(form.redditKeywords);
        if (keywords.length === 0) {
          return { ok: false, field: "redditKeywords", error: "Add at least one keyword so we only read posts about you." };
        }
        return { ok: true, config: { mode: "subreddit", subreddit: sub, keywords } };
      }
      if (form.redditMode === "search") {
        const query = form.redditQuery.trim().replace(/\s+/g, " ");
        if (query.length < 2) return { ok: false, field: "redditQuery", error: "Enter what to search Reddit for." };
        return { ok: true, config: { mode: "search", query: query.slice(0, 120) } };
      }
      const thread = parseRedditInput(form.redditThread);
      if (!thread || thread.mode !== "thread") {
        return { ok: false, field: "redditThread", error: "Paste a link to a Reddit thread (it contains /comments/)." };
      }
      return { ok: true, config: thread };
    }
    case "hackernews": {
      if (form.hnMode === "search") {
        const query = form.hnQuery.trim().replace(/\s+/g, " ");
        if (query.length < 2) return { ok: false, field: "hnQuery", error: "Enter what to search Hacker News for." };
        return { ok: true, config: { mode: "search", query: query.slice(0, 120) } };
      }
      const thread = parseHackerNewsInput(form.hnThread);
      if (!thread) {
        return { ok: false, field: "hnThread", error: "Paste a Hacker News discussion link, like news.ycombinator.com/item?id=123." };
      }
      return { ok: true, config: thread };
    }
    case "trustpilot": {
      const c = parseTrustpilotInput(form.trustpilot);
      if (!c) return { ok: false, field: "trustpilot", error: "Paste a Trustpilot link or the domain, like acme.com." };
      return { ok: true, config: c };
    }
    default:
      return { ok: false, field: "appInput", error: "Choose a source type." };
  }
}
