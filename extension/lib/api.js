// Shared by the service worker, the popup and the options page.
// Talks to the BuildMonday server and keeps settings in chrome.storage.local.
// The token is stored only in chrome.storage.local, never in sync storage.

import { DEFAULT_SERVER, DEFAULT_TOKEN } from "./config.js";

export { DEFAULT_SERVER, DEFAULT_TOKEN };

export const MAX_TEXT = 4000;
export const MAX_BATCH = 100;
/** Account details are refreshed in the background when older than this. */
export const ACCOUNT_TTL_MS = 5 * 60 * 1000;

export const SITE_LABELS = {
  playstore: "Google Play",
  appstore: "App Store",
  reddit: "Reddit",
  hackernews: "Hacker News",
  trustpilot: "Trustpilot",
  g2: "G2",
  producthunt: "Product Hunt",
  x: "X",
  other: "This page",
};

/** Same detection as the content script, for the service worker. */
export function siteFromUrl(href) {
  let host;
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return "other";
  }
  host = host.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "play.google.com") return "playstore";
  if (host === "apps.apple.com" || host === "itunes.apple.com") return "appstore";
  if (host === "reddit.com" || host === "old.reddit.com" || host === "new.reddit.com") return "reddit";
  if (host === "news.ycombinator.com") return "hackernews";
  if (/(^|\.)trustpilot\.com$/.test(host)) return "trustpilot";
  if (host === "g2.com") return "g2";
  if (host === "producthunt.com") return "producthunt";
  if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") return "x";
  return "other";
}

/** "acme.com" -> "https://acme.com"; returns the origin or null when it is not a web address. */
export function normalizeServer(input) {
  if (typeof input !== "string") return null;
  let v = input.trim();
  if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
    v = (/^(localhost|127\.|\[::1\])/i.test(v) ? "http://" : "https://") + v;
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.protocol === "http:" && !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function isTokenShape(value) {
  return typeof value === "string" && /^bm_ext_[A-Za-z0-9]{16,120}$/.test(value.trim());
}

export function tokenHint(token) {
  return token ? `${token.slice(0, 12)}…` : "";
}

export function hostOf(server) {
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
}

export async function getSettings() {
  const s = await chrome.storage.local.get(["server", "token", "productId", "account", "lowStarOnly"]);
  return {
    server: normalizeServer(s.server) || DEFAULT_SERVER,
    token: typeof s.token === "string" ? s.token : "",
    productId: typeof s.productId === "string" ? s.productId : null,
    account: s.account && typeof s.account === "object" ? s.account : null,
    lowStarOnly: s.lowStarOnly !== false,
  };
}

export async function saveSettings(patch) {
  await chrome.storage.local.set(patch);
}

export async function disconnect() {
  await chrome.storage.local.remove(["token", "account", "productId"]);
}

/**
 * Uses the token baked into a signed-in download, once, on install. Returns
 * true when it connected. A token the user already saved always wins.
 */
export async function adoptBundledToken() {
  if (!isTokenShape(DEFAULT_TOKEN)) return false;
  const stored = await chrome.storage.local.get(["token", "bundledTokenUsed"]);
  if (stored.token || stored.bundledTokenUsed) return false;
  await chrome.storage.local.set({ server: DEFAULT_SERVER, token: DEFAULT_TOKEN, bundledTokenUsed: true });
  return true;
}

/**
 * Validates a connect request sent by a BuildMonday page ("Connect this
 * browser"). The page's origin must be the server it names.
 */
export function acceptExternalConnect(message, senderOrigin) {
  if (!message || message.type !== "bm:connect") return null;
  const server = normalizeServer(message.server);
  if (!server || !isTokenShape(message.token)) return null;
  let origin = null;
  try {
    origin = new URL(server).origin;
  } catch {
    return null;
  }
  if (!senderOrigin || senderOrigin !== origin) return null;
  return { server, token: message.token };
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, body = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function fallbackMessage(status) {
  if (status === 401) return "This token is not valid. Create a new one in BuildMonday under Extension & widget.";
  if (status === 402) return "Your plan's monthly limit is used up. Upgrade in BuildMonday to keep clipping.";
  if (status === 404) return "BuildMonday could not find that. Check the server address on the options page.";
  if (status === 413) return "That is too much text to clip at once. Select less and try again.";
  if (status === 429) return "Too many clips in a short time. Wait a minute and try again.";
  if (status >= 500) return "BuildMonday had a problem saving this. Try again in a moment.";
  return "That did not work. Try again.";
}

/** Authenticated JSON request to the BuildMonday server. Throws ApiError with a readable message. */
export async function request(settings, path, { method = "GET", body } = {}) {
  if (!settings.token) {
    throw new ApiError("Connect the extension to BuildMonday first.", { status: 401, code: "not_connected" });
  }
  let res;
  try {
    res = await fetch(settings.server + path, {
      method,
      headers: {
        Authorization: `Bearer ${settings.token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "omit",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Could not reach ${hostOf(settings.server)}. Check your connection and the server address.`, {
      status: 0,
      code: "network",
    });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data && typeof data.error === "string" && data.error ? data.error : fallbackMessage(res.status);
    throw new ApiError(message, { status: res.status, code: data && data.code ? data.code : null, body: data });
  }
  return data;
}

/** GET /api/extension/me, cached in storage with a timestamp. */
export async function fetchAccount(settings) {
  const me = await request(settings, "/api/extension/me");
  const account = { ...me, fetchedAt: Date.now() };
  await saveSettings({ account });
  return account;
}

/** Cached account when fresh enough, otherwise a new fetch. */
export async function ensureAccount(settings, { maxAgeMs = ACCOUNT_TTL_MS } = {}) {
  const cached = settings.account;
  if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < maxAgeMs && Array.isArray(cached.products)) {
    return cached;
  }
  return fetchAccount(settings);
}

/** The chosen product if it still exists, else the first one, else null. */
export function resolveProduct(account, productId) {
  const list = account && Array.isArray(account.products) ? account.products : [];
  return list.find((p) => p.id === productId) || list[0] || null;
}

export function clampText(text, max = MAX_TEXT) {
  const t = String(text || "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Keeps reviews rated 1 to 3 when asked, but only if the page shows ratings at all. */
export function filterReviews(reviews, { lowStarOnly }) {
  const list = Array.isArray(reviews) ? reviews : [];
  const rated = list.some((r) => typeof r.rating === "number");
  const kept = lowStarOnly && rated ? list.filter((r) => typeof r.rating !== "number" || r.rating <= 3) : list;
  return kept.slice(0, MAX_BATCH);
}

/** From this many new, unmatched items the popup offers to group them now. */
export const GROUP_NOW_THRESHOLD = 10;

/** Starts a run so captured feedback is grouped now. Resolves to { runId, runUrl }. */
export async function groupNow(settings, productId) {
  return request(settings, "/api/extension/runs", { method: "POST", body: { productId } });
}

export function shouldOfferGroupNow(result) {
  const inserted = (result && result.inserted) || 0;
  const matched = (result && result.matched) || 0;
  return inserted - matched >= GROUP_NOW_THRESHOLD;
}

export async function clipItems(settings, productId, items) {
  return request(settings, "/api/extension/clip", {
    method: "POST",
    body: { productId, items: items.slice(0, MAX_BATCH) },
  });
}

export function plural(n, one, many) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many || `${one}s`}`;
}

/** "Saved 12 to Acme Notes" plus a detail line for duplicates and skipped items. */
export function describeClipResult(result, productName) {
  const inserted = result.inserted || 0;
  const duplicates = result.duplicates || 0;
  const rejected = result.rejected || 0;
  const target = productName || (result.product && result.product.name) || "your inbox";
  const title = inserted > 0 ? `Saved ${plural(inserted, "item")} to ${target}` : `Nothing new for ${target}`;
  const details = [];
  if (duplicates > 0) details.push(`${plural(duplicates, "item")} ${duplicates === 1 ? "was" : "were"} already in your inbox`);
  if (rejected > 0) details.push(`${plural(rejected, "item")} ${rejected === 1 ? "was" : "were"} too short or too long`);
  if (result.quotaExceeded) details.push("your monthly limit stopped the rest");
  let detail = details.length ? `${details.join(", ")}.` : "It will be grouped into issues on the next run.";
  detail = detail.charAt(0).toUpperCase() + detail.slice(1);
  return { title, detail };
}

/** "42 of 100 clips this month" or "Unlimited clips". */
export function describeClipUsage(clips) {
  if (!clips || typeof clips.max !== "number") return "";
  if (clips.max < 0) return "Unlimited clips on your plan";
  return `${clips.used.toLocaleString("en-US")} of ${clips.max.toLocaleString("en-US")} clips used this month`;
}
