import { describe, expect, it } from "vitest";
import {
  clipBodySchema,
  createTokenSchema,
  siteToSourceKind,
  toIngestItems,
} from "@/app/api/extension/_lib/clip";
import { extensionCorsHeaders, isExtensionOrigin } from "@/app/api/extension/_lib/cors";

const PRODUCT = "6f1c2b9e-1111-4c4c-8888-222233334444";

describe("clipBodySchema", () => {
  it("accepts a minimal selection clip", () => {
    const body = clipBodySchema.parse({ productId: PRODUCT, items: [{ text: "Checkout fails on Safari" }] });
    expect(body.items[0]).toEqual({
      text: "Checkout fails on Safari",
      url: null,
      title: null,
      author: null,
      rating: null,
      postedAt: null,
      externalId: null,
      site: "other",
    });
  });

  it("normalises site aliases and unknown sites", () => {
    const body = clipBodySchema.parse({
      productId: PRODUCT,
      items: [
        { text: "one", site: "HN" },
        { text: "two", site: "twitter" },
        { text: "three", site: "zendesk" },
        { text: "four", site: "Reddit" },
      ],
    });
    expect(body.items.map((i) => i.site)).toEqual(["hackernews", "x", "other", "reddit"]);
  });

  it("rounds ratings into 1 to 5 and drops impossible ones", () => {
    const body = clipBodySchema.parse({
      productId: PRODUCT,
      items: [
        { text: "a", rating: 4.4 },
        { text: "b", rating: "2" },
        { text: "c", rating: 0 },
        { text: "d", rating: 9 },
        { text: "e", rating: null },
      ],
    });
    expect(body.items.map((i) => i.rating)).toEqual([4, 2, null, null, null]);
  });

  it("keeps only http(s) URLs and valid past dates", () => {
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const body = clipBodySchema.parse({
      productId: PRODUCT,
      items: [
        { text: "a", url: "javascript:alert(1)", postedAt: "not a date" },
        { text: "b", url: "https://play.google.com/store/apps/details?id=com.acme", postedAt: "2026-10-01T10:00:00Z" },
        { text: "c", postedAt: future },
      ],
    });
    expect(body.items[0].url).toBeNull();
    expect(body.items[0].postedAt).toBeNull();
    expect(body.items[1].url).toBe("https://play.google.com/store/apps/details?id=com.acme");
    expect(body.items[1].postedAt).toBe("2026-10-01T10:00:00.000Z");
    expect(body.items[2].postedAt).toBeNull();
  });

  it("collapses whitespace in short fields and caps their length", () => {
    const body = clipBodySchema.parse({
      productId: PRODUCT,
      items: [{ text: "x", author: "  Jane \n  Doe  ", title: "t".repeat(400) }],
    });
    expect(body.items[0].author).toBe("Jane Doe");
    expect(body.items[0].title).toHaveLength(300);
  });

  it("rejects empty batches, more than 100 items and a missing product", () => {
    expect(clipBodySchema.safeParse({ productId: PRODUCT, items: [] }).success).toBe(false);
    const many = Array.from({ length: 101 }, (_, i) => ({ text: `item ${i}` }));
    expect(clipBodySchema.safeParse({ productId: PRODUCT, items: many }).success).toBe(false);
    expect(clipBodySchema.safeParse({ productId: "", items: [{ text: "abc" }] }).success).toBe(false);
  });
});

describe("siteToSourceKind and toIngestItems", () => {
  it("keeps monitored platforms and files everything else as extension", () => {
    expect(siteToSourceKind("playstore")).toBe("playstore");
    expect(siteToSourceKind("appstore")).toBe("appstore");
    expect(siteToSourceKind("reddit")).toBe("reddit");
    expect(siteToSourceKind("hackernews")).toBe("hackernews");
    expect(siteToSourceKind("trustpilot")).toBe("trustpilot");
    expect(siteToSourceKind("g2")).toBe("extension");
    expect(siteToSourceKind("producthunt")).toBe("extension");
    expect(siteToSourceKind("x")).toBe("extension");
    expect(siteToSourceKind("other")).toBe("extension");
  });

  it("maps clip items to ingest items with site metadata", () => {
    const body = clipBodySchema.parse({
      productId: PRODUCT,
      items: [
        { text: "App crashes on launch", site: "playstore", rating: 1, externalId: "gp:abc", url: "https://play.google.com/x" },
        { text: "Love it but sync is slow", site: "g2" },
      ],
    });
    const items = toIngestItems(body.items, { userId: "user-1" });
    expect(items[0]).toMatchObject({
      text: "App crashes on launch",
      sourceKind: "playstore",
      rating: 1,
      externalId: "gp:abc",
      role: "own",
      meta: { site: "playstore", clippedBy: "user-1", pageUrl: "https://play.google.com/x" },
    });
    expect(items[1]).toMatchObject({ sourceKind: "extension", meta: { site: "g2", clippedBy: "user-1" } });
    expect(items[1].meta).not.toHaveProperty("pageUrl");
  });
});

describe("createTokenSchema", () => {
  it("trims and validates the name", () => {
    expect(createTokenSchema.parse({ name: "  Chrome   on Mac " })).toEqual({ name: "Chrome on Mac" });
    expect(createTokenSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createTokenSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  });
});

describe("extension CORS", () => {
  const EXT = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

  it("recognises extension origins only", () => {
    expect(isExtensionOrigin(EXT)).toBe(true);
    expect(isExtensionOrigin("https://evil.example")).toBe(false);
    expect(isExtensionOrigin("chrome-extension://")).toBe(false);
    expect(isExtensionOrigin(null)).toBe(false);
  });

  it("allows the extension origin with Authorization", () => {
    const req = new Request("http://localhost/api/extension/me", { headers: { Origin: EXT } });
    const h = extensionCorsHeaders(req);
    expect(h["Access-Control-Allow-Origin"]).toBe(EXT);
    expect(h["Access-Control-Allow-Headers"]).toContain("Authorization");
  });

  it("does not allow web origins", () => {
    const req = new Request("http://localhost/api/extension/me", { headers: { Origin: "https://evil.example" } });
    expect(extensionCorsHeaders(req)["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
