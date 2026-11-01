/**
 * Pure request handling for POST /api/extension/clip: the body schema, the
 * mapping from a clipped site to a feedback source kind, and the conversion
 * into items for the shared ingest function. No database access here.
 */
import { z } from "zod";
import { MONITOR_SOURCE_KINDS, type FeedbackSourceKind, type MonitorSourceKind } from "@/lib/db/schema";
import type { IngestItem } from "@/lib/feedback/prepare";

export const CLIP_SITES = [
  "playstore",
  "appstore",
  "reddit",
  "hackernews",
  "trustpilot",
  "g2",
  "producthunt",
  "x",
  "other",
] as const;
export type ClipSite = (typeof CLIP_SITES)[number];

export const MAX_CLIP_ITEMS = 100;
export const MAX_CLIP_BYTES = 256 * 1024;

function isClipSite(value: string): value is ClipSite {
  return (CLIP_SITES as readonly string[]).includes(value);
}

function isMonitorKind(value: string): value is MonitorSourceKind {
  return (MONITOR_SOURCE_KINDS as readonly string[]).includes(value);
}

/** Free text fields: trimmed, whitespace runs collapsed, empty becomes null. */
function optionalText(max: number) {
  return z
    .string()
    .max(max * 4)
    .nullish()
    .transform((v) => {
      if (typeof v !== "string") return null;
      const t = v.replace(/\s+/g, " ").trim();
      if (!t) return null;
      return t.length > max ? t.slice(0, max) : t;
    });
}

const siteSchema = z
  .string()
  .max(40)
  .nullish()
  .transform((v): ClipSite => {
    const s = (v ?? "").trim().toLowerCase();
    if (s === "hn") return "hackernews";
    if (s === "twitter") return "x";
    return isClipSite(s) ? s : "other";
  });

const ratingSchema = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    const r = Math.round(n);
    return r >= 1 && r <= 5 ? r : null;
  });

const postedAtSchema = z
  .string()
  .max(64)
  .nullish()
  .transform((v) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    // Ignore dates far in the future; they are parsing mistakes on the page.
    if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
    return d.toISOString();
  });

const urlSchema = z
  .string()
  .max(4000)
  .nullish()
  .transform((v) => {
    if (!v) return null;
    try {
      const u = new URL(v.trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      return u.toString().slice(0, 2000);
    } catch {
      return null;
    }
  });

export const clipItemSchema = z.object({
  // Length rules (3 to 4000 characters after trimming) are applied by the
  // shared ingest step, which counts short or oversized items as rejected
  // instead of failing the whole batch.
  text: z.string().max(20_000, "A clipped item can be at most 20,000 characters."),
  url: urlSchema,
  title: optionalText(300),
  author: optionalText(120),
  rating: ratingSchema,
  postedAt: postedAtSchema,
  externalId: optionalText(200),
  site: siteSchema,
});

export const clipBodySchema = z.object({
  productId: z.string().trim().min(1, "Choose a product.").max(64),
  items: z
    .array(clipItemSchema)
    .min(1, "Nothing to clip. Select some text or open a review page.")
    .max(MAX_CLIP_ITEMS, `Clip at most ${MAX_CLIP_ITEMS} items at a time.`),
});

export type ClipItem = z.output<typeof clipItemSchema>;
export type ClipBody = z.output<typeof clipBodySchema>;

/** Monitored platforms keep their own kind so clips mix with fetched reviews; everything else is "extension". */
export function siteToSourceKind(site: ClipSite): FeedbackSourceKind {
  return isMonitorKind(site) ? site : "extension";
}

/** Converts validated clip items into ingest items for channel "extension". */
export function toIngestItems(items: ClipItem[], ctx: { userId: string }): IngestItem[] {
  return items.map((item) => {
    const meta: Record<string, unknown> = { site: item.site, clippedBy: ctx.userId };
    if (item.url) meta.pageUrl = item.url;
    return {
      text: item.text,
      title: item.title,
      author: item.author,
      rating: item.rating,
      url: item.url,
      postedAt: item.postedAt,
      externalId: item.externalId,
      sourceKind: siteToSourceKind(item.site),
      role: "own",
      meta,
    };
  });
}

export const createTokenSchema = z.object({
  name: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Give the token a name.").max(60, "Keep the name under 60 characters.")),
});

export const MAX_ACTIVE_TOKENS = 10;
