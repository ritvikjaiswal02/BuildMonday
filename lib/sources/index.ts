import "server-only";

import type {
  AppStoreConfig,
  HackerNewsConfig,
  MonitorSourceKind,
  PlayStoreConfig,
  RedditConfig,
  SourceConfig,
  TrustpilotConfig,
} from "@/lib/db/schema";
import { fetchAppStore } from "./appstore";
import { validateSourceConfig } from "./config";
import { fetchHackerNews } from "./hackernews";
import { fetchPlayStore } from "./playstore";
import { fetchReddit, type RedditFetchOptions } from "./reddit";
import { fetchTrustpilot } from "./trustpilot";
import { SourceError, type FetchOptions, type FetchResult, type RawFeedbackItem } from "./util";

export type { RawFeedbackItem, FetchResult, FetchOptions } from "./util";
export { SourceError } from "./util";
export type { DetectedSource } from "./detect";
export { detectSourceFromUrl } from "./detect";
export { validateSourceConfig, sourceLabel, sourcePublicUrl, isMonitorSourceKind, MONITOR_KIND_LABELS } from "./config";
export { normalizeText, dedupeKey } from "./dedupe";

/** Longest text stored for one item; longer posts are cut at a word boundary. */
export const MAX_ITEM_TEXT = 4000;

export function clipItemText(text: string, max = MAX_ITEM_TEXT): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut}…`;
}

function finalize(result: FetchResult): FetchResult {
  return {
    ...result,
    items: result.items
      .map((i): RawFeedbackItem => ({ ...i, text: clipItemText(i.text) }))
      .filter((i) => i.text.length >= 3),
  };
}

/**
 * Fetches recent items from one monitored source. Throws SourceError with a
 * message that can be shown to the person who added the source.
 */
export async function fetchSource(
  kind: MonitorSourceKind,
  config: SourceConfig,
  opts?: FetchOptions & Pick<RedditFetchOptions, "listing" | "timeFilter">,
): Promise<FetchResult> {
  const checked = validateSourceConfig(kind, config);
  if (!checked.ok) throw new SourceError(checked.error);
  const cfg = checked.config;
  const o = opts ?? {};
  switch (kind) {
    case "appstore":
      return finalize(await fetchAppStore(cfg as AppStoreConfig, o));
    case "playstore":
      return finalize(await fetchPlayStore(cfg as PlayStoreConfig, o));
    case "reddit":
      return finalize(await fetchReddit(cfg as RedditConfig, o));
    case "hackernews":
      return finalize(await fetchHackerNews(cfg as HackerNewsConfig, o));
    case "trustpilot":
      return finalize(await fetchTrustpilot(cfg as TrustpilotConfig, o));
    default:
      throw new SourceError("That source type is not supported.");
  }
}

/** "Test this source": a small fetch that never throws. */
export async function previewSource(
  kind: MonitorSourceKind,
  config: SourceConfig,
): Promise<{ ok: true; label: string; count: number; sample: RawFeedbackItem[] } | { ok: false; error: string }> {
  try {
    const result = await fetchSource(kind, config, { limit: 50 });
    return { ok: true, label: result.label, count: result.items.length, sample: result.items.slice(0, 5) };
  } catch (err) {
    if (err instanceof SourceError) return { ok: false, error: err.message };
    console.error("[sources] preview failed", err);
    return { ok: false, error: "We could not read this source right now. You can still save it; we will retry on every run." };
  }
}
