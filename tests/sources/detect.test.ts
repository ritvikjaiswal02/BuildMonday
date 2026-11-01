import { describe, expect, it } from "vitest";
import { detectSourceFromUrl } from "@/lib/sources/detect";

describe("detectSourceFromUrl", () => {
  it("reads App Store links with and without a country", () => {
    expect(detectSourceFromUrl("https://apps.apple.com/in/app/acme-notes/id123456789")).toMatchObject({
      kind: "appstore",
      config: { appId: "123456789", country: "in" },
      label: "App Store (IN) 123456789",
    });
    expect(detectSourceFromUrl("apps.apple.com/app/id987654321?see-all=reviews")).toMatchObject({
      kind: "appstore",
      config: { appId: "987654321", country: "us" },
    });
    expect(detectSourceFromUrl("https://itunes.apple.com/us/app/acme/id12345678")).toMatchObject({ kind: "appstore" });
  });

  it("reads bare App Store ids", () => {
    expect(detectSourceFromUrl("123456789")).toMatchObject({ kind: "appstore", config: { appId: "123456789", country: "us" } });
    expect(detectSourceFromUrl("id123456789")).toMatchObject({ kind: "appstore" });
  });

  it("reads Google Play links with country and language", () => {
    expect(
      detectSourceFromUrl("https://play.google.com/store/apps/details?id=com.acme.notes&hl=en_IN&gl=in"),
    ).toMatchObject({
      kind: "playstore",
      config: { packageName: "com.acme.notes", country: "in", lang: "en" },
      label: "Google Play (IN) com.acme.notes",
    });
  });

  it("reads bare package names but not bare domains", () => {
    expect(detectSourceFromUrl("com.acme.notes")).toMatchObject({ kind: "playstore", config: { packageName: "com.acme.notes" } });
    expect(detectSourceFromUrl("acme.com")).toBeNull();
  });

  it("reads bare domains when hinted as Trustpilot", () => {
    expect(detectSourceFromUrl("https://www.acme.com/pricing", "trustpilot")).toMatchObject({
      kind: "trustpilot",
      config: { domain: "acme.com" },
    });
  });

  it("reads Trustpilot review pages on any country subdomain", () => {
    expect(detectSourceFromUrl("https://uk.trustpilot.com/review/www.acme.co.uk?page=2")).toMatchObject({
      kind: "trustpilot",
      config: { domain: "acme.co.uk" },
      label: "Trustpilot: acme.co.uk",
    });
  });

  it("reads Hacker News threads and Algolia searches", () => {
    expect(detectSourceFromUrl("https://news.ycombinator.com/item?id=41234567")).toMatchObject({
      kind: "hackernews",
      config: { mode: "thread", itemId: "41234567" },
    });
    expect(detectSourceFromUrl("https://hn.algolia.com/?dateRange=pastMonth&query=acme%20notes&type=all")).toMatchObject({
      kind: "hackernews",
      config: { mode: "search", query: "acme notes" },
    });
  });

  it("reads Reddit threads, subreddits, r/ shorthand and searches", () => {
    expect(
      detectSourceFromUrl("https://old.reddit.com/r/acme/comments/abc123/checkout_is_broken/?utm_source=x"),
    ).toMatchObject({
      kind: "reddit",
      config: { mode: "thread", url: "https://www.reddit.com/r/acme/comments/abc123/checkout_is_broken" },
    });
    expect(detectSourceFromUrl("https://www.reddit.com/r/productivity/top/?t=week")).toMatchObject({
      kind: "reddit",
      config: { mode: "subreddit", subreddit: "productivity", keywords: [] },
    });
    expect(detectSourceFromUrl("r/acme")).toMatchObject({ kind: "reddit", config: { mode: "subreddit", subreddit: "acme" } });
    expect(detectSourceFromUrl("https://www.reddit.com/r/acme/search/?q=sync+bug&restrict_sr=1")).toMatchObject({
      kind: "reddit",
      config: { mode: "subreddit", subreddit: "acme", keywords: ["sync bug"] },
    });
    expect(detectSourceFromUrl("https://www.reddit.com/search/?q=acme%20notes")).toMatchObject({
      kind: "reddit",
      config: { mode: "search", query: "acme notes" },
    });
  });

  it("uses hints for ambiguous bare text", () => {
    expect(detectSourceFromUrl("acme notes", "hackernews")).toMatchObject({
      kind: "hackernews",
      config: { mode: "search", query: "acme notes" },
    });
    expect(detectSourceFromUrl("productivity", "reddit")).toMatchObject({ kind: "reddit", config: { subreddit: "productivity" } });
  });

  it("returns null for things it cannot place", () => {
    expect(detectSourceFromUrl("")).toBeNull();
    expect(detectSourceFromUrl("hello world")).toBeNull();
    expect(detectSourceFromUrl("https://example.com/some/page")).toBeNull();
    expect(detectSourceFromUrl("https://play.google.com/store/apps/details")).toBeNull();
  });
});
