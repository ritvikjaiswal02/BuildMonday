import { describe, expect, it } from "vitest";
import {
  describeSource,
  detectSourceInput,
  looksLikeWebDomain,
  parseAppStoreInput,
  parseHackerNewsInput,
  parseKeywords,
  parsePlayStoreInput,
  parseRedditInput,
  parseSubredditName,
  parseSubreddits,
  parseTrustpilotInput,
  searchTerms,
  sourceFingerprint,
} from "@/components/onboarding/source-input";

describe("parseAppStoreInput", () => {
  it("reads the id and country from a store link", () => {
    expect(parseAppStoreInput("https://apps.apple.com/in/app/acme-notes/id123456789")).toEqual({
      appId: "123456789",
      country: "in",
    });
  });

  it("accepts links without a scheme and with query strings", () => {
    expect(parseAppStoreInput("apps.apple.com/gb/app/acme/id987654321?mt=8")).toEqual({
      appId: "987654321",
      country: "gb",
    });
  });

  it("accepts a bare id or an id-prefixed id, using the given country", () => {
    expect(parseAppStoreInput("123456789", "de")).toEqual({ appId: "123456789", country: "de" });
    expect(parseAppStoreInput("id123456789")).toEqual({ appId: "123456789", country: "us" });
  });

  it("rejects other hosts and junk", () => {
    expect(parseAppStoreInput("https://example.com/id123456789")).toBeNull();
    expect(parseAppStoreInput("acme")).toBeNull();
    expect(parseAppStoreInput("")).toBeNull();
  });
});

describe("parsePlayStoreInput", () => {
  it("reads package, country and language from a Play link", () => {
    expect(
      parsePlayStoreInput("https://play.google.com/store/apps/details?id=com.acme.notes&hl=hi_IN&gl=IN"),
    ).toEqual({ packageName: "com.acme.notes", country: "in", lang: "hi" });
  });

  it("accepts bare package names, including two-part ones", () => {
    expect(parsePlayStoreInput("com.acme.notes")).toEqual({ packageName: "com.acme.notes", country: "us", lang: "en" });
    expect(parsePlayStoreInput("com.whatsapp")?.packageName).toBe("com.whatsapp");
  });

  it("does not mistake a website domain for a package", () => {
    expect(parsePlayStoreInput("acme.com")).toBeNull();
    expect(parsePlayStoreInput("www.acme.io")).toBeNull();
    expect(looksLikeWebDomain("notion.so")).toBe(true);
    expect(looksLikeWebDomain("com.notion.android")).toBe(false);
  });

  it("rejects Play links without an id", () => {
    expect(parsePlayStoreInput("https://play.google.com/store/apps")).toBeNull();
  });
});

describe("parseTrustpilotInput", () => {
  it("reads the domain from review links and bare domains", () => {
    expect(parseTrustpilotInput("https://www.trustpilot.com/review/acme.com")).toEqual({ domain: "acme.com" });
    expect(parseTrustpilotInput("trustpilot.com/review/www.acme.co.uk?page=2")).toEqual({ domain: "acme.co.uk" });
    expect(parseTrustpilotInput("Acme.com")).toEqual({ domain: "acme.com" });
    expect(parseTrustpilotInput("https://acme.com/")).toEqual({ domain: "acme.com" });
  });

  it("rejects deep links on other sites and non-domains", () => {
    expect(parseTrustpilotInput("https://acme.com/pricing")).toBeNull();
    expect(parseTrustpilotInput("acme")).toBeNull();
    expect(parseTrustpilotInput("https://trustpilot.com/categories")).toBeNull();
  });
});

describe("subreddits and keywords", () => {
  it("parses subreddit names in every common form", () => {
    expect(parseSubredditName("r/acme")).toBe("acme");
    expect(parseSubredditName("/r/Productivity/")).toBe("Productivity");
    expect(parseSubredditName("https://www.reddit.com/r/notetaking/top")).toBe("notetaking");
    expect(parseSubredditName("a")).toBeNull();
    expect(parseSubredditName("r/has space")).toBeNull();
  });

  it("splits lists, dedupes case-insensitively and reports invalid parts", () => {
    expect(parseSubreddits("r/acme, r/Acme r/productivity; ??")).toEqual({
      valid: ["acme", "productivity"],
      invalid: ["??"],
    });
  });

  it("parses keywords and builds search terms with the product name first", () => {
    expect(parseKeywords("acme notes, acmenotes,\nAcme Notes, x")).toEqual(["acme notes", "acmenotes"]);
    expect(searchTerms("Acme Notes", ["acme notes", "acmenotes"])).toEqual(["Acme Notes", "acmenotes"]);
  });
});

describe("parseRedditInput and parseHackerNewsInput", () => {
  it("recognises threads and subreddits", () => {
    expect(parseRedditInput("https://www.reddit.com/r/acme/comments/abc123/sync_is_broken/?utm=x")).toEqual({
      mode: "thread",
      url: "https://www.reddit.com/r/acme/comments/abc123/sync_is_broken/",
    });
    expect(parseRedditInput("r/acme")).toEqual({ mode: "subreddit", subreddit: "acme", keywords: [] });
    expect(parseRedditInput("acme")).toBeNull();
  });

  it("recognises Hacker News items", () => {
    expect(parseHackerNewsInput("https://news.ycombinator.com/item?id=41234567")).toEqual({
      mode: "thread",
      itemId: "41234567",
    });
    expect(parseHackerNewsInput("41234567")).toEqual({ mode: "thread", itemId: "41234567" });
    expect(parseHackerNewsInput("https://news.ycombinator.com/newest")).toBeNull();
  });
});

describe("detectSourceInput", () => {
  it("detects each kind from a pasted link", () => {
    expect(detectSourceInput("https://apps.apple.com/us/app/x/id123456789")?.kind).toBe("appstore");
    expect(detectSourceInput("https://play.google.com/store/apps/details?id=com.acme.notes")?.kind).toBe("playstore");
    expect(detectSourceInput("https://www.trustpilot.com/review/acme.com")?.kind).toBe("trustpilot");
    expect(detectSourceInput("https://www.reddit.com/r/acme/")?.kind).toBe("reddit");
    expect(detectSourceInput("https://news.ycombinator.com/item?id=123456")?.kind).toBe("hackernews");
  });

  it("only treats a bare domain as Trustpilot when allowed", () => {
    expect(detectSourceInput("acme.com")).toBeNull();
    expect(detectSourceInput("acme.com", { allowBareDomain: true })).toMatchObject({
      kind: "trustpilot",
      config: { domain: "acme.com" },
    });
  });

  it("returns a readable label", () => {
    expect(detectSourceInput("123456789")?.label).toBe("App Store (US) 123456789");
    expect(describeSource("reddit", { mode: "subreddit", subreddit: "acme", keywords: ["acme", "notes"] })).toBe(
      "r/acme: acme, notes",
    );
    expect(describeSource("hackernews", { mode: "search", query: "acme" })).toBe("HN search: acme");
  });
});

describe("sourceFingerprint", () => {
  it("ignores key order and case", () => {
    expect(sourceFingerprint("appstore", { appId: "1", country: "US" })).toBe(
      sourceFingerprint("appstore", { country: "us", appId: "1" } as never),
    );
    expect(sourceFingerprint("appstore", { appId: "1", country: "us" })).not.toBe(
      sourceFingerprint("appstore", { appId: "2", country: "us" }),
    );
  });
});
