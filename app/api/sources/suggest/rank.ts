/** Pure helpers for GET /api/sources/suggest. */

export interface ItunesResult {
  trackId?: number;
  trackName?: string;
  sellerName?: string;
  artistName?: string;
  artworkUrl60?: string;
  sellerUrl?: string;
}

export interface AppStoreSuggestion {
  appId: string;
  name: string;
  developer: string;
  iconUrl: string | null;
  /** True when the developer's site matches the product website. */
  matchesWebsite: boolean;
}

function host(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Valid results only, website matches first, App Store order otherwise. */
export function rankAppStoreMatches(results: ItunesResult[], website: string): AppStoreSuggestion[] {
  const site = host(website);
  const out: AppStoreSuggestion[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (typeof r.trackId !== "number" || !r.trackName) continue;
    const appId = String(r.trackId);
    if (seen.has(appId)) continue;
    seen.add(appId);
    const seller = host(r.sellerUrl);
    out.push({
      appId,
      name: r.trackName.slice(0, 80),
      developer: (r.sellerName ?? r.artistName ?? "").slice(0, 80),
      iconUrl: r.artworkUrl60 && /^https:\/\//.test(r.artworkUrl60) ? r.artworkUrl60 : null,
      matchesWebsite: Boolean(site && seller && (seller === site || seller.endsWith(`.${site}`))),
    });
  }
  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Number(b.s.matchesWebsite) - Number(a.s.matchesWebsite) || a.i - b.i)
    .map((x) => x.s);
}
