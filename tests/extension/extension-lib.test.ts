import { afterEach, describe, expect, it, vi } from "vitest";
// Plain JS modules shipped in the extension (no build step).
import {
  ApiError,
  acceptExternalConnect,
  clampText,
  describeClipResult,
  describeClipUsage,
  filterReviews,
  isTokenShape,
  normalizeServer,
  request,
  resolveProduct,
  siteFromUrl,
} from "../../extension/lib/api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeServer", () => {
  it("accepts https addresses with or without a scheme", () => {
    expect(normalizeServer("build-monday.vercel.app")).toBe("https://build-monday.vercel.app");
    expect(normalizeServer("https://feedback.acme.dev/extension")).toBe("https://feedback.acme.dev");
    expect(normalizeServer("  https://acme.dev/  ")).toBe("https://acme.dev");
  });

  it("allows plain http only for local development", () => {
    expect(normalizeServer("localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeServer("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(normalizeServer("http://acme.dev")).toBeNull();
  });

  it("rejects things that are not web addresses", () => {
    expect(normalizeServer("")).toBeNull();
    expect(normalizeServer("ftp://acme.dev")).toBeNull();
    expect(normalizeServer(undefined)).toBeNull();
  });
});

describe("helpers", () => {
  it("checks token shape", () => {
    expect(isTokenShape("bm_ext_abcdefghijklmnopqrstuvwx")).toBe(true);
    expect(isTokenShape(" bm_ext_abcdefghijklmnopqrstuvwx ")).toBe(true);
    expect(isTokenShape("pk_abcdefghijklmnopqrstuvwx")).toBe(false);
    expect(isTokenShape("bm_ext_short")).toBe(false);
  });

  it("detects sites like the content script", () => {
    expect(siteFromUrl("https://www.reddit.com/r/x")).toBe("reddit");
    expect(siteFromUrl("https://news.ycombinator.com/item?id=1")).toBe("hackernews");
    expect(siteFromUrl("https://mail.google.com/")).toBe("other");
  });

  it("filters to low-star reviews only when ratings exist", () => {
    const rated = [
      { text: "a", rating: 1 },
      { text: "b", rating: 5 },
      { text: "c", rating: 3 },
      { text: "d", rating: null },
    ];
    expect(filterReviews(rated, { lowStarOnly: true }).map((r: { text: string }) => r.text)).toEqual(["a", "c", "d"]);
    expect(filterReviews(rated, { lowStarOnly: false })).toHaveLength(4);
    const unrated = [{ text: "x", rating: null }];
    expect(filterReviews(unrated, { lowStarOnly: true })).toHaveLength(1);
    const many = Array.from({ length: 150 }, (_, i) => ({ text: `r${i}`, rating: null }));
    expect(filterReviews(many, { lowStarOnly: false })).toHaveLength(100);
  });

  it("clamps text", () => {
    expect(clampText("  hello  ")).toBe("hello");
    expect(clampText("x".repeat(5000))).toHaveLength(4000);
  });

  it("resolves the chosen product or falls back to the first", () => {
    const account = { products: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }] };
    expect(resolveProduct(account, "p2")?.name).toBe("Two");
    expect(resolveProduct(account, "gone")?.name).toBe("One");
    expect(resolveProduct({ products: [] }, "p1")).toBeNull();
  });

  it("describes clip results in plain words", () => {
    expect(describeClipResult({ inserted: 12, duplicates: 3, rejected: 0 }, "Acme Notes")).toEqual({
      title: "Saved 12 items to Acme Notes",
      detail: "3 items were already in your inbox.",
    });
    expect(describeClipResult({ inserted: 1, duplicates: 0, rejected: 0 }, "Acme")).toEqual({
      title: "Saved 1 item to Acme",
      detail: "It will be grouped into issues on the next run.",
    });
    expect(describeClipResult({ inserted: 0, duplicates: 1, rejected: 1 }, "Acme").title).toBe("Nothing new for Acme");
  });

  it("describes clip usage", () => {
    expect(describeClipUsage({ used: 42, max: 100 })).toBe("42 of 100 clips used this month");
    expect(describeClipUsage({ used: 4200, max: -1 })).toBe("Unlimited clips on your plan");
  });
});

describe("request", () => {
  const settings = { server: "https://acme.dev", token: "bm_ext_abcdefghijklmnopqrstuvwx" };

  it("sends the bearer token and returns JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(request(settings, "/api/extension/me")).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://acme.dev/api/extension/me");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${settings.token}`);
    expect(init.credentials).toBe("omit");
  });

  it("surfaces the server's error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "This token is not valid.", code: "unauthorized" }), { status: 401 })),
    );
    const err = await request(settings, "/api/extension/me").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: "unauthorized", message: "This token is not valid." });
  });

  it("explains network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const err = await request(settings, "/api/extension/me").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 0, code: "network" });
    expect((err as Error).message).toContain("acme.dev");
  });

  it("refuses to call without a token", async () => {
    const err = await request({ server: "https://acme.dev", token: "" }, "/x").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 401, code: "not_connected" });
  });
});

describe("acceptExternalConnect", () => {
  const token = "bm_ext_abcdefghijklmnopqrstuvwx";

  it("accepts a connect message from the server it names", () => {
    expect(acceptExternalConnect({ type: "bm:connect", token, server: "https://app.acme.dev" }, "https://app.acme.dev")).toEqual({
      server: "https://app.acme.dev",
      token,
    });
  });

  it("refuses other origins, bad tokens and other messages", () => {
    expect(acceptExternalConnect({ type: "bm:connect", token, server: "https://app.acme.dev" }, "https://evil.example")).toBeNull();
    expect(acceptExternalConnect({ type: "bm:connect", token: "nope", server: "https://app.acme.dev" }, "https://app.acme.dev")).toBeNull();
    expect(acceptExternalConnect({ type: "other" }, "https://app.acme.dev")).toBeNull();
  });
});
