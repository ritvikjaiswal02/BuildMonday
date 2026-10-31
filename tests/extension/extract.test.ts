// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

interface Extracted {
  text: string;
  title: string | null;
  author: string | null;
  rating: number | null;
  postedAt: string | null;
  externalId: string | null;
  url: string | null;
}

interface ExtractApi {
  siteFromUrl(url: string): string;
  ratingFrom(value: unknown): number | null;
  extractReviews(doc: Document, site: string): Extracted[];
  selectionText(): string;
  scan(): { site: string; supported: boolean; reviews: Extracted[]; selection: string; ratingsFound: boolean };
}

const code = readFileSync(path.resolve(__dirname, "../../extension/content/extract.js"), "utf8");
let api: ExtractApi;

beforeAll(() => {
  // eslint-disable-next-line no-new-func
  new Function(code)();
  api = (globalThis as unknown as { BuildMondayExtract: ExtractApi }).BuildMondayExtract;
});

function doc(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
}

describe("site detection", () => {
  it("maps review hosts to sites", () => {
    expect(api.siteFromUrl("https://play.google.com/store/apps/details?id=com.acme")).toBe("playstore");
    expect(api.siteFromUrl("https://apps.apple.com/us/app/acme/id123")).toBe("appstore");
    expect(api.siteFromUrl("https://www.reddit.com/r/acme/comments/x")).toBe("reddit");
    expect(api.siteFromUrl("https://old.reddit.com/r/acme")).toBe("reddit");
    expect(api.siteFromUrl("https://news.ycombinator.com/item?id=1")).toBe("hackernews");
    expect(api.siteFromUrl("https://uk.trustpilot.com/review/acme.com")).toBe("trustpilot");
    expect(api.siteFromUrl("https://www.g2.com/products/acme/reviews")).toBe("g2");
    expect(api.siteFromUrl("https://www.producthunt.com/products/acme")).toBe("producthunt");
    expect(api.siteFromUrl("https://x.com/acme/status/1")).toBe("x");
    expect(api.siteFromUrl("https://twitter.com/acme")).toBe("x");
    expect(api.siteFromUrl("https://acme.zendesk.com/agent/tickets/1")).toBe("other");
    expect(api.siteFromUrl("not a url")).toBe("other");
  });

  it("reads ratings from labels", () => {
    expect(api.ratingFrom("Rated 2 stars out of five stars")).toBe(2);
    expect(api.ratingFrom("4 out of 5")).toBe(4);
    expect(api.ratingFrom("Rated 1 out of 5 stars")).toBe(1);
    expect(api.ratingFrom("3/5")).toBe(3);
    expect(api.ratingFrom("5")).toBe(5);
    expect(api.ratingFrom("Two stars")).toBe(2);
    expect(api.ratingFrom("great")).toBeNull();
    expect(api.ratingFrom("9")).toBeNull();
  });
});

describe("extractors", () => {
  it("reads Google Play reviews", () => {
    const d = doc(`
      <div class="RHo1pe">
        <header data-review-id="gp:AOqp1">
          <div class="X5PpBb">Jane Doe</div>
          <div role="img" aria-label="Rated 2 stars out of five stars"></div>
          <span class="bp9Aid">October 3, 2026</span>
        </header>
        <div class="h3YV2d">Sync keeps failing after the update.</div>
      </div>
      <div class="RHo1pe">
        <header data-review-id="gp:AOqp2"><div class="X5PpBb">Raj</div><div role="img" aria-label="Rated 5 stars out of five stars"></div></header>
        <div class="h3YV2d">Works great.</div>
      </div>`);
    const items = api.extractReviews(d, "playstore");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      text: "Sync keeps failing after the update.",
      author: "Jane Doe",
      rating: 2,
      externalId: "gp:AOqp1",
    });
    expect(items[0].postedAt).toMatch(/^2026-10-0[23]/);
    expect(items[1].rating).toBe(5);
  });

  it("reads App Store reviews", () => {
    const d = doc(`
      <div class="we-customer-review">
        <figure class="we-star-rating" aria-label="1 out of 5"></figure>
        <time datetime="2026-09-01">Sep 1</time>
        <span class="we-customer-review__user">kim</span>
        <h3 class="we-customer-review__title">Crashes</h3>
        <blockquote class="we-customer-review__body"><p>Crashes on launch since the last update.</p></blockquote>
      </div>`);
    const [item] = api.extractReviews(d, "appstore");
    expect(item).toMatchObject({ text: "Crashes on launch since the last update.", title: "Crashes", author: "kim", rating: 1 });
    expect(item.postedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("reads new Reddit posts and comments", () => {
    const d = doc(`
      <shreddit-post post-title="App crashes on open" author="u_one" id="t3_abc" permalink="/r/acme/comments/abc/app/" created-timestamp="2026-10-01T10:00:00.000Z">
        <div slot="text-body"><p>Every time I open it on Android 15.</p></div>
      </shreddit-post>
      <shreddit-comment author="u_two" thingid="t1_def" permalink="/r/acme/comments/abc/app/def/">
        <div slot="comment"><p>Same here, started this week.</p></div>
      </shreddit-comment>
      <shreddit-comment author="[deleted]" thingid="t1_ghi"><div slot="comment"><p>[deleted]</p></div></shreddit-comment>`);
    const items = api.extractReviews(d, "reddit");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "App crashes on open",
      author: "u_one",
      externalId: "t3_abc",
      postedAt: "2026-10-01T10:00:00.000Z",
    });
    expect(items[0].text).toContain("App crashes on open");
    expect(items[0].text).toContain("Every time I open it on Android 15.");
    expect(items[0].url).toMatch(/\/r\/acme\/comments\/abc\/app\/$/);
    expect(items[1]).toMatchObject({ text: "Same here, started this week.", author: "u_two", externalId: "t1_def" });
  });

  it("reads old Reddit comments", () => {
    const d = doc(`
      <div class="thing comment" data-author="olduser" data-fullname="t1_old" data-permalink="/r/acme/comments/1/x/old/">
        <div class="entry"><time datetime="2026-09-20T12:00:00+00:00"></time><div class="usertext-body"><div class="md"><p>Export to CSV is broken.</p></div></div></div>
      </div>`);
    const [item] = api.extractReviews(d, "reddit");
    expect(item).toMatchObject({ text: "Export to CSV is broken.", author: "olduser", externalId: "t1_old" });
  });

  it("reads Hacker News comments without the reply link", () => {
    const d = doc(`
      <table>
        <tr class="athing comtr" id="4242">
          <td><span class="hnuser">pg</span><span class="age" title="2026-10-01T12:00:00 1790000000"><a>1 day ago</a></span>
            <div class="comment"><div class="commtext c00">The onboarding asks for too much up front.<div class="reply"><p><a>reply</a></p></div></div></div>
          </td>
        </tr>
      </table>`);
    const [item] = api.extractReviews(d, "hackernews");
    expect(item).toMatchObject({
      text: "The onboarding asks for too much up front.",
      author: "pg",
      externalId: "4242",
      url: "https://news.ycombinator.com/item?id=4242",
      postedAt: "2026-10-01T12:00:00.000Z",
    });
  });

  it("reads Trustpilot reviews", () => {
    const d = doc(`
      <article data-service-review-card-paper="true">
        <span data-consumer-name-typography="true">Sam</span>
        <div data-service-review-rating="1"></div>
        <time datetime="2026-09-30T08:00:00.000Z"></time>
        <a href="/reviews/66f0a1b2c3d4e5f6a7b8c9d0"><h2 data-service-review-title-typography="true">Refund never came</h2></a>
        <p data-service-review-text-typography="true">Waited three weeks for a refund and support stopped answering.</p>
      </article>`);
    const [item] = api.extractReviews(d, "trustpilot");
    expect(item).toMatchObject({
      text: "Waited three weeks for a refund and support stopped answering.",
      title: "Refund never came",
      author: "Sam",
      rating: 1,
      externalId: "66f0a1b2c3d4e5f6a7b8c9d0",
      postedAt: "2026-09-30T08:00:00.000Z",
    });
  });

  it("reads G2 reviews from structured data", () => {
    const d = doc(`
      <div itemprop="review" id="survey-response-77">
        <div itemprop="author" itemscope><meta itemprop="name" content="Priya"></div>
        <meta itemprop="datePublished" content="2026-08-01">
        <div itemprop="reviewRating"><meta itemprop="ratingValue" content="2"><meta itemprop="bestRating" content="5"></div>
        <div itemprop="reviewBody">Reporting gets slow once the team grows past 50 people.</div>
      </div>`);
    const [item] = api.extractReviews(d, "g2");
    expect(item).toMatchObject({
      text: "Reporting gets slow once the team grows past 50 people.",
      author: "Priya",
      rating: 2,
      externalId: "survey-response-77",
    });
  });

  it("reads posts on X", () => {
    const d = doc(`
      <article data-testid="tweet">
        <div data-testid="User-Name"><span>Alex</span><span>@alex_dev</span></div>
        <a href="/alex_dev/status/1234567890"><time datetime="2026-10-02T09:00:00.000Z"></time></a>
        <div data-testid="tweetText">@acme your export is broken again</div>
      </article>`);
    const [item] = api.extractReviews(d, "x");
    expect(item).toMatchObject({
      text: "@acme your export is broken again",
      author: "@alex_dev",
      externalId: "1234567890",
      postedAt: "2026-10-02T09:00:00.000Z",
    });
    expect(item.url).toMatch(/\/alex_dev\/status\/1234567890$/);
  });

  it("drops duplicates, hidden items and very short text", () => {
    const d = doc(`
      <div class="RHo1pe"><header data-review-id="gp:1"></header><div class="h3YV2d">Login loops forever.</div></div>
      <div class="RHo1pe"><header data-review-id="gp:1"></header><div class="h3YV2d">Login loops forever.</div></div>
      <div hidden><div class="RHo1pe"><header data-review-id="gp:2"></header><div class="h3YV2d">Hidden review text.</div></div></div>
      <div class="RHo1pe"><header data-review-id="gp:3"></header><div class="h3YV2d">ok</div></div>`);
    const items = api.extractReviews(d, "playstore");
    expect(items.map((i) => i.externalId)).toEqual(["gp:1"]);
  });

  it("caps very long text at 4000 characters", () => {
    const d = doc(`<div class="RHo1pe"><header data-review-id="gp:9"></header><div class="h3YV2d">${"word ".repeat(1200)}</div></div>`);
    const [item] = api.extractReviews(d, "playstore");
    expect(item.text.length).toBeLessThanOrEqual(4000);
  });

  it("returns nothing for unsupported sites", () => {
    expect(api.extractReviews(doc("<p>Hello there, this is a page.</p>"), "other")).toEqual([]);
  });
});

describe("scan", () => {
  it("returns the selection and page details", () => {
    document.body.innerHTML = "<p id='p'>The checkout button is hidden on small screens.</p>";
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("p")!);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    const result = api.scan();
    expect(result.selection).toBe("The checkout button is hidden on small screens.");
    expect(result.site).toBe("other");
    expect(result.supported).toBe(false);
    expect(result.reviews).toEqual([]);
  });
});
