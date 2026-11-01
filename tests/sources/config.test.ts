import { describe, expect, it } from "vitest";
import { sourceLabel, sourcePublicUrl, validateSourceConfig } from "@/lib/sources/config";

describe("validateSourceConfig", () => {
  it("normalises App Store configs", () => {
    expect(validateSourceConfig("appstore", { appId: "id123456789", country: "IN" })).toEqual({
      ok: true,
      config: { appId: "123456789", country: "in" },
    });
    expect(validateSourceConfig("appstore", { appId: 123456789 })).toEqual({
      ok: true,
      config: { appId: "123456789", country: "us" },
    });
  });

  it("rejects bad App Store ids with a readable message", () => {
    const r = validateSourceConfig("appstore", { appId: "acme", country: "us" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/app id/i);
  });

  it("fills Play Store defaults and checks the package name", () => {
    expect(validateSourceConfig("playstore", { packageName: "com.acme.notes" })).toEqual({
      ok: true,
      config: { packageName: "com.acme.notes", country: "us", lang: "en" },
    });
    expect(validateSourceConfig("playstore", { packageName: "acme" }).ok).toBe(false);
  });

  it("cleans subreddit names and keyword lists", () => {
    expect(
      validateSourceConfig("reddit", { mode: "subreddit", subreddit: "r/acme/", keywords: [" acme  notes ", "acme notes", "", "acmenotes"] }),
    ).toEqual({ ok: true, config: { mode: "subreddit", subreddit: "acme", keywords: ["acme notes", "acmenotes"] } });
  });

  it("accepts Reddit thread links and strips query strings", () => {
    expect(
      validateSourceConfig("reddit", { mode: "thread", url: "https://www.reddit.com/r/acme/comments/abc123/title/?share=1" }),
    ).toEqual({ ok: true, config: { mode: "thread", url: "https://www.reddit.com/r/acme/comments/abc123/title" } });
    expect(validateSourceConfig("reddit", { mode: "thread", url: "https://example.com" }).ok).toBe(false);
  });

  it("asks for a mode when the discriminator is missing", () => {
    const r = validateSourceConfig("reddit", { subreddit: "acme" });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/how to watch/i) });
  });

  it("validates Hacker News configs", () => {
    expect(validateSourceConfig("hackernews", { mode: "search", query: "acme" })).toEqual({
      ok: true,
      config: { mode: "search", query: "acme" },
    });
    expect(validateSourceConfig("hackernews", { mode: "thread", itemId: 4123 })).toEqual({
      ok: true,
      config: { mode: "thread", itemId: "4123" },
    });
    expect(validateSourceConfig("hackernews", { mode: "search", query: "a" }).ok).toBe(false);
  });

  it("normalises Trustpilot domains", () => {
    expect(validateSourceConfig("trustpilot", { domain: "https://www.trustpilot.com/review/www.Acme.com" })).toEqual({
      ok: true,
      config: { domain: "acme.com" },
    });
    expect(validateSourceConfig("trustpilot", { domain: "not a domain" }).ok).toBe(false);
  });

  it("rejects unknown kinds", () => {
    expect(validateSourceConfig("twitter" as never, {}).ok).toBe(false);
  });
});

describe("sourceLabel", () => {
  it("names each kind the way the settings list shows it", () => {
    expect(sourceLabel("appstore", { appId: "123456789", country: "us" })).toBe("App Store (US) 123456789");
    expect(sourceLabel("reddit", { mode: "subreddit", subreddit: "acme", keywords: ["acme notes"] })).toBe("r/acme: acme notes");
    expect(sourceLabel("reddit", { mode: "subreddit", subreddit: "acme", keywords: [] })).toBe("r/acme");
    expect(sourceLabel("reddit", { mode: "search", query: "acme" })).toBe("Reddit search: acme");
    expect(sourceLabel("hackernews", { mode: "search", query: "acme" })).toBe("HN search: acme");
    expect(sourceLabel("hackernews", { mode: "thread", itemId: "42" })).toBe("HN thread 42");
    expect(sourceLabel("trustpilot", { domain: "acme.com" })).toBe("Trustpilot: acme.com");
  });

  it("links to the public page of a source", () => {
    expect(sourcePublicUrl("playstore", { packageName: "com.acme", country: "in", lang: "en" })).toContain("id=com.acme");
    expect(sourcePublicUrl("hackernews", { mode: "thread", itemId: "42" })).toBe("https://news.ycombinator.com/item?id=42");
  });
});
