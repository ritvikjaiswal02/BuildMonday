import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAppStore, parseAppStoreFeed } from "@/lib/sources/appstore";
import { fetchHackerNews, hnSearchUrl, parseHnSearch, parseHnThread } from "@/lib/sources/hackernews";
import { fetchSource, previewSource } from "@/lib/sources";
import {
  parseBatchExecute,
  parsePlayReviews,
  playStoreRequestBody,
} from "@/lib/sources/playstore";
import { fetchReddit, parseReaderText, parseRedditJson, redditJsonUrl, redditKeywordQuery } from "@/lib/sources/reddit";
import { findReviewsArray, parseTrustpilotHtml, trustpilotUrl } from "@/lib/sources/trustpilot";
import { SourceError, joinTitle, stripHtml } from "@/lib/sources/util";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("util", () => {
  it("joins a title and body without repeating the title", () => {
    expect(joinTitle("Crashes", "on launch")).toBe("Crashes. on launch");
    expect(joinTitle("Crashes!", "on launch")).toBe("Crashes! on launch");
    expect(joinTitle("Crashes", "Crashes on launch")).toBe("Crashes on launch");
    expect(joinTitle("", "body")).toBe("body");
  });

  it("strips HTML and decodes entities", () => {
    expect(stripHtml("<p>It&#x27;s &quot;slow&quot;</p><p>really &amp; truly</p>")).toBe(`It's "slow" really & truly`);
  });
});

// ---------------------------------------------------------------------------

const appEntry = (id: string, rating: number, title: string, body: string, updated: string) => ({
  id: { label: id },
  "im:rating": { label: String(rating) },
  title: { label: title },
  content: [{ label: body }, { label: `<p>${body}</p>` }],
  author: { name: { label: `user-${id}` } },
  updated: { label: updated },
});

describe("App Store", () => {
  it("parses entries, skipping the app-info entry", () => {
    const items = parseAppStoreFeed(
      {
        feed: {
          entry: [
            { title: { label: "Acme" } },
            appEntry("r1", 2, "Sync broken", "Notes vanish after sync", "2026-10-30T10:00:00-07:00"),
          ],
        },
      },
      { appId: "123456789", country: "us" },
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "r1",
      text: "Sync broken. Notes vanish after sync",
      rating: 2,
      author: "user-r1",
      postedAt: "2026-10-30T17:00:00.000Z",
    });
  });

  it("accepts a single entry object", () => {
    const items = parseAppStoreFeed({ feed: { entry: appEntry("r9", 1, "Bad", "Very bad", "2026-10-01") } }, { appId: "1", country: "us" });
    expect(items).toHaveLength(1);
  });

  it("keeps only 1 to 3 star reviews and stops at `since`", async () => {
    const page1 = {
      feed: {
        entry: [
          appEntry("a", 1, "Crash", "Crashes on open", "2026-10-30T00:00:00Z"),
          appEntry("b", 5, "Love it", "Great app", "2026-10-29T00:00:00Z"),
          appEntry("c", 3, "Slow", "Sync is slow", "2026-10-28T00:00:00Z"),
          appEntry("d", 2, "Old", "An old complaint", "2026-09-01T00:00:00Z"),
        ],
      },
    };
    const fetchMock = vi.fn(async () => jsonResponse(page1));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchAppStore({ appId: "123456789", country: "us" }, { since: new Date("2026-10-01T00:00:00Z") });
    expect(result.items.map((i) => i.externalId)).toEqual(["a", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.label).toBe("App Store US (app 123456789)");
  });

  it("explains a missing app", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(fetchAppStore({ appId: "123456789", country: "gb" })).rejects.toThrow(/not found in the GB store/);
  });

  it("reports when there are no reviews at all", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ feed: {} })));
    await expect(fetchAppStore({ appId: "123456789", country: "us" })).rejects.toBeInstanceOf(SourceError);
  });
});

// ---------------------------------------------------------------------------

describe("Google Play", () => {
  const review = (id: string, score: number, text: string, seconds: number) => [
    id,
    ["Jordan", null],
    score,
    null,
    text,
    [seconds, 0],
    3,
  ];
  const payload = [[review("gp:1", 1, "Crashes after the update", 1761800000), review("gp:2", 5, "Lovely", 1761700000)], [null, "NEXT"]];
  const body = `)]}'\n\n${JSON.stringify([["wrb.fr", "UsvDTd", JSON.stringify(payload), null, null, null, "generic"], ["di", 42]])}`;

  it("builds the batchexecute request body", () => {
    const decoded = decodeURIComponent(playStoreRequestBody("com.acme.notes", 100, null).replace(/^f\.req=/, ""));
    const outer = JSON.parse(decoded);
    expect(outer[0][0][0]).toBe("UsvDTd");
    expect(JSON.parse(outer[0][0][1])).toEqual([null, null, [2, 2, [100, null, null], null, []], ["com.acme.notes", 7]]);
  });

  it("parses the RPC envelope and the reviews", () => {
    const parsed = parseBatchExecute(body);
    const { items, nextToken } = parsePlayReviews(parsed, { packageName: "com.acme.notes", country: "us", lang: "en" });
    expect(nextToken).toBe("NEXT");
    expect(items[0]).toMatchObject({ externalId: "gp:1", rating: 1, author: "Jordan", text: "Crashes after the update" });
    expect(items[0].postedAt).toBe(new Date(1761800000 * 1000).toISOString());
    expect(items[0].url).toContain("reviewId=gp%3A1");
  });

  it("returns null when the payload is missing", () => {
    expect(parseBatchExecute(`)]}'\n\n[["wrb.fr","UsvDTd",null,null,null,[3]]]`)).toBeNull();
    expect(parseBatchExecute("garbage")).toBeNull();
  });

  it("fetches low-star reviews through fetchSource", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(body, { status: 200 }))
      .mockResolvedValueOnce(new Response(`)]}'\n\n[["wrb.fr","UsvDTd","[[],null]",null]]`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchSource("playstore", { packageName: "com.acme.notes", country: "us", lang: "en" });
    expect(result.items.map((i) => i.externalId)).toEqual(["gp:1"]);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("explains an unknown package", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`)]}'\n\n[["wrb.fr","UsvDTd",null]]`, { status: 200 })));
    await expect(fetchSource("playstore", { packageName: "com.nope.app", country: "us", lang: "en" })).rejects.toThrow(
      /did not return reviews/,
    );
  });
});

// ---------------------------------------------------------------------------

describe("Reddit", () => {
  const listing = {
    kind: "Listing",
    data: {
      children: [
        { kind: "t3", data: { name: "t3_a", title: "Sync keeps failing", selftext: "Since the update my notes do not sync", author: "u1", permalink: "/r/acme/comments/a/x/", created_utc: 1761800000 } },
        { kind: "t3", data: { name: "t3_b", title: "NSFW", selftext: "nope nope nope nope nope", over_18: true } },
        { kind: "t3", data: { name: "t3_c", title: "Weekly thread", selftext: "pinned post text here for everyone", stickied: true } },
        { kind: "t3", data: { name: "t3_d", title: "short", selftext: "" } },
      ],
    },
  };

  it("builds search URLs for keywords and listings otherwise", () => {
    expect(redditKeywordQuery(["acme notes", "acmenotes"])).toBe('"acme notes" OR acmenotes');
    expect(redditJsonUrl({ mode: "subreddit", subreddit: "acme", keywords: ["acme"] })).toContain("/r/acme/search.json?q=acme&restrict_sr=1&sort=new");
    expect(redditJsonUrl({ mode: "subreddit", subreddit: "acme", keywords: [] })).toContain("/r/acme/new.json");
    expect(redditJsonUrl({ mode: "subreddit", subreddit: "acme", keywords: [] }, { listing: "top", timeFilter: "week" })).toContain(
      "/r/acme/top.json?t=week",
    );
    expect(redditJsonUrl({ mode: "thread", url: "https://www.reddit.com/r/acme/comments/abc/x" })).toBe(
      "https://www.reddit.com/r/acme/comments/abc/x.json?limit=500&sort=new&raw_json=1",
    );
  });

  it("parses listings, skipping NSFW, stickied and very short posts", () => {
    const items = parseRedditJson(listing, "subreddit");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "t3_a",
      text: "Sync keeps failing. Since the update my notes do not sync",
      url: "https://www.reddit.com/r/acme/comments/a/x/",
    });
  });

  it("parses a thread with nested replies", () => {
    const thread = [
      { data: { children: [{ kind: "t3", data: { name: "t3_p", title: "Is Acme down?", selftext: "Nothing loads for me since this morning" } }] } },
      {
        data: {
          children: [
            {
              kind: "t1",
              data: {
                name: "t1_1",
                body: "Same here, the app hangs on the splash screen",
                replies: { data: { children: [{ kind: "t1", data: { name: "t1_2", body: "Also broken on Android for me today" } }] } },
              },
            },
            { kind: "t1", data: { name: "t1_3", body: "[deleted]" } },
            { kind: "more", data: {} },
          ],
        },
      },
    ];
    expect(parseRedditJson(thread, "thread").map((i) => i.externalId)).toEqual(["t3_p", "t1_1", "t1_2"]);
  });

  it("falls back to the reader proxy when Reddit blocks JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("<html>blocked</html>", { status: 403, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(
        new Response("Title: r/acme\nURL Source: https://reddit.com\nThe export button has been broken for a week now and support is silent\n12 comments\n", {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchReddit({ mode: "search", query: "acme" });
    expect(result.via).toBe("proxy");
    expect(result.items).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/public page/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/^https:\/\/r\.jina\.ai\/https:\/\/www\.reddit\.com\/search/);
  });

  it("says Reddit blocked the request when both paths fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 429 })));
    await expect(fetchReddit({ mode: "search", query: "acme" })).rejects.toThrow(/Reddit blocked this request/);
  });

  it("reports a missing subreddit directly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404, headers: { "content-type": "application/json" } })));
    await expect(fetchReddit({ mode: "subreddit", subreddit: "nopeacme", keywords: [] })).rejects.toThrow(/does not exist/);
  });

  it("filters reader lines that are page chrome", () => {
    const items = parseReaderText("Share\nPosted by u/someone 3 hours ago\nhttps://example.com\nThis is a real complaint about the sync engine failing\n");
    expect(items.map((i) => i.text)).toEqual(["This is a real complaint about the sync engine failing"]);
  });
});

// ---------------------------------------------------------------------------

describe("Hacker News", () => {
  it("builds the Algolia search URL with a since filter", () => {
    const url = hnSearchUrl("acme notes", 1761000000, 50);
    expect(url).toContain("search_by_date?");
    expect(decodeURIComponent(url)).toContain("tags=(story,comment)");
    expect(decodeURIComponent(url)).toContain("numericFilters=created_at_i>1761000000");
  });

  it("parses search hits for stories and comments", () => {
    const items = parseHnSearch({
      hits: [
        { objectID: "1", title: "Show HN: Acme Notes", story_text: "<p>We built a notes app</p>", _tags: ["story"], created_at_i: 1761800000 },
        { objectID: "2", comment_text: "Acme notes lost my data twice, I switched away", _tags: ["comment"], story_title: "Ask HN" },
        { objectID: "3", comment_text: "+1", _tags: ["comment"] },
      ],
    });
    expect(items.map((i) => i.externalId)).toEqual(["1", "2"]);
    expect(items[0].text).toBe("Show HN: Acme Notes. We built a notes app");
    expect(items[1].url).toBe("https://news.ycombinator.com/item?id=2");
  });

  it("flattens a thread", () => {
    const items = parseHnThread({
      id: 10,
      title: "Ask HN: What do you use for notes?",
      children: [
        { id: 11, type: "comment", text: "Acme, but sync is unreliable on Linux", children: [{ id: 12, type: "comment", text: "Same, it drops edits when offline" }] },
      ],
    });
    expect(items.map((i) => i.externalId)).toEqual(["10", "11", "12"]);
  });

  it("defaults the search window to 30 days", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ hits: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const before = Math.floor((Date.now() - 30 * 86400000) / 1000);
    const result = await fetchHackerNews({ mode: "search", query: "acme" });
    const url = decodeURIComponent(String((fetchMock.mock.calls[0] as unknown[])[0]));
    const since = Number(url.match(/created_at_i>(\d+)/)?.[1]);
    expect(Math.abs(since - before)).toBeLessThan(5);
    expect(result.items).toEqual([]);
    expect(result.warnings[0]).toMatch(/Nobody on Hacker News/);
  });
});

// ---------------------------------------------------------------------------

describe("Trustpilot", () => {
  const page = (reviews: unknown[]) =>
    `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { reviews } } })}</script></html>`;

  it("builds a recency URL with the star filter", () => {
    const url = trustpilotUrl({ domain: "acme.com" }, 2, true);
    expect(url).toBe("https://www.trustpilot.com/review/acme.com?sort=recency&stars=1&stars=2&stars=3&page=2");
  });

  it("parses reviews from page data", () => {
    const items = parseTrustpilotHtml(
      page([{ id: "tp1", title: "Refund refused", text: "They would not refund a double charge", rating: 1, consumer: { displayName: "Sam" }, dates: { publishedDate: "2026-10-20T08:00:00Z" } }]),
    );
    expect(items).toEqual([
      expect.objectContaining({ externalId: "tp1", rating: 1, author: "Sam", url: "https://www.trustpilot.com/reviews/tp1" }),
    ]);
  });

  it("finds a nested reviews array", () => {
    expect(findReviewsArray({ a: { b: [{ c: 1 }, { reviews: [{ text: "x", rating: 1 }] }] } })).toEqual([{ text: "x", rating: 1 }]);
  });

  it("returns null when the layout is unknown", () => {
    expect(parseTrustpilotHtml("<html></html>")).toBeNull();
  });

  it("fetches and filters through fetchSource", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            page([
              { id: "1", title: "Bad", text: "Support never answered my ticket", rating: 2 },
              { id: "2", title: "Good", text: "Works fine for me honestly", rating: 5 },
            ]),
          ),
        )
        .mockResolvedValueOnce(new Response(page([]))),
    );
    const result = await fetchSource("trustpilot", { domain: "acme.com" });
    expect(result.items.map((i) => i.externalId)).toEqual(["1"]);
  });
});

// ---------------------------------------------------------------------------

describe("fetchSource and previewSource", () => {
  it("rejects invalid configs before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSource("appstore", { appId: "nope", country: "us" })).rejects.toBeInstanceOf(SourceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clips very long items to 4000 characters", async () => {
    const long = "word ".repeat(1200);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ hits: [{ objectID: "9", comment_text: long, _tags: ["comment"] }] })),
    );
    const result = await fetchSource("hackernews", { mode: "search", query: "acme" });
    expect(result.items[0].text.length).toBeLessThanOrEqual(4000);
    expect(result.items[0].text.endsWith("…")).toBe(true);
  });

  it("returns ok with a sample", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          hits: Array.from({ length: 8 }, (_, i) => ({ objectID: String(i), comment_text: `Acme complaint number ${i} about syncing`, _tags: ["comment"] })),
        }),
      ),
    );
    const preview = await previewSource("hackernews", { mode: "search", query: "acme" });
    expect(preview).toMatchObject({ ok: true, count: 8, label: "HN search: acme" });
    if (preview.ok) expect(preview.sample).toHaveLength(5);
  });

  it("returns the user-facing error instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const preview = await previewSource("appstore", { appId: "123456789", country: "us" });
    expect(preview).toEqual({ ok: false, error: expect.stringMatching(/not found/) });
  });
});
