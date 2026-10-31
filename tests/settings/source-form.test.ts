import { describe, expect, it } from "vitest";
import { configFromForm, emptySourceForm, formFromConfig } from "@/components/settings/source-form";
import { formatUntil, formatUtc } from "@/components/settings/api";
import type { MonitorSourceKind, SourceConfig } from "@/lib/db/schema";

describe("source form", () => {
  it("builds each kind's config", () => {
    const base = emptySourceForm("appstore", "Acme");
    expect(configFromForm({ ...base, appInput: "apps.apple.com/us/app/x/id123456789", appCountry: "in" })).toEqual({
      ok: true,
      config: { appId: "123456789", country: "in" },
    });
    expect(configFromForm({ ...base, kind: "playstore", playInput: "com.acme.notes", playCountry: "gb", playLang: "en" })).toEqual({
      ok: true,
      config: { packageName: "com.acme.notes", country: "gb", lang: "en" },
    });
    expect(configFromForm({ ...base, kind: "reddit", subreddit: "r/acme" })).toEqual({
      ok: true,
      config: { mode: "subreddit", subreddit: "acme", keywords: ["Acme"] },
    });
    expect(configFromForm({ ...base, kind: "reddit", redditMode: "search", redditQuery: " acme  notes " })).toEqual({
      ok: true,
      config: { mode: "search", query: "acme notes" },
    });
    expect(configFromForm({ ...base, kind: "hackernews", hnMode: "thread", hnThread: "news.ycombinator.com/item?id=1234" })).toEqual({
      ok: true,
      config: { mode: "thread", itemId: "1234" },
    });
    expect(configFromForm({ ...base, kind: "trustpilot", trustpilot: "acme.com" })).toEqual({
      ok: true,
      config: { domain: "acme.com" },
    });
  });

  it("points at the field that needs fixing", () => {
    const base = emptySourceForm("appstore");
    expect(configFromForm(base)).toMatchObject({ ok: false, field: "appInput" });
    expect(configFromForm({ ...base, kind: "reddit", subreddit: "r/acme", redditKeywords: "" })).toMatchObject({
      ok: false,
      field: "redditKeywords",
    });
    expect(configFromForm({ ...base, kind: "reddit", redditMode: "thread", redditThread: "r/acme" })).toMatchObject({
      ok: false,
      field: "redditThread",
    });
    expect(configFromForm({ ...base, kind: "hackernews", hnQuery: "" })).toMatchObject({ ok: false, field: "hnQuery" });
  });

  it("round-trips saved configs", () => {
    const configs: Array<[MonitorSourceKind, SourceConfig]> = [
      ["appstore", { appId: "123456789", country: "de" }],
      ["playstore", { packageName: "com.acme.notes", country: "in", lang: "hi" }],
      ["reddit", { mode: "subreddit", subreddit: "acme", keywords: ["acme", "notes"] }],
      ["reddit", { mode: "search", query: "acme" }],
      ["reddit", { mode: "thread", url: "https://www.reddit.com/r/acme/comments/abc123/x/" }],
      ["hackernews", { mode: "search", query: "acme" }],
      ["hackernews", { mode: "thread", itemId: "12345" }],
      ["trustpilot", { domain: "acme.com" }],
    ];
    for (const [kind, config] of configs) {
      expect(configFromForm(formFromConfig(kind, config))).toEqual({ ok: true, config });
    }
  });
});

describe("date helpers", () => {
  it("formats UTC times and expiry", () => {
    expect(formatUtc("2026-11-08T05:00:00.000Z")).toBe("Sun 8 Nov, 05:00 UTC");
    expect(formatUtc(null)).toBeNull();
    const now = new Date("2026-11-01T00:00:00Z");
    expect(formatUntil("2026-11-08T00:00:00Z", now)).toBe("in 7 days");
    expect(formatUntil("2026-11-01T05:00:00Z", now)).toBe("in 5 h");
    expect(formatUntil("2026-10-01T00:00:00Z", now)).toBe("now");
  });
});
