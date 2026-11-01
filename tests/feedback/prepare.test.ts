import { describe, expect, it } from "vitest";
import {
  countUrls,
  isLinkSpam,
  normalizeFeedbackText,
  prepareIngestItems,
  sanitizeDate,
  sanitizeMeta,
  sanitizeUrl,
} from "@/lib/feedback/prepare";

describe("prepareIngestItems", () => {
  it("rejects too short and too long text and drops in-batch duplicates", () => {
    const r = prepareIngestItems("p1", [
      { text: "  ok ", sourceKind: "manual" },
      { text: "x".repeat(4001), sourceKind: "manual" },
      { text: "The app crashes", sourceKind: "manual" },
      { text: "the APP crashes!", sourceKind: "manual" },
      { text: "The app crashes", sourceKind: "widget" },
    ]);
    expect(r.rejected).toBe(2);
    expect(r.batchDuplicates).toBe(1);
    expect(r.rows.map((x) => [x.text, x.sourceKind])).toEqual([
      ["The app crashes", "manual"],
      ["The app crashes", "widget"],
    ]);
  });

  it("sanitises fields", () => {
    const [row] = prepareIngestItems("p1", [
      {
        text: "Line one\r\n\r\n\r\n   Line two   ",
        sourceKind: "extension",
        rating: 4.6,
        authorEmail: "Person@Example.COM",
        url: "javascript:alert(1)",
        postedAt: "not a date",
        role: "competitor",
        competitorName: "  Notion ",
        meta: { site: "g2" },
        externalId: "ext-1",
      },
    ]).rows;
    expect(row).toMatchObject({
      text: "Line one\n\nLine two",
      rating: 5,
      authorEmail: "person@example.com",
      url: null,
      postedAt: null,
      role: "competitor",
      competitorName: "Notion",
      meta: { site: "g2" },
      externalId: "ext-1",
      status: "new",
    });
    expect(row.dedupeKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("drops competitor names on own feedback and honours an explicit status", () => {
    const [row] = prepareIngestItems("p1", [{ text: "spammy", sourceKind: "widget", competitorName: "X", status: "spam" }]).rows;
    expect(row.competitorName).toBeNull();
    expect(row.status).toBe("spam");
  });
});

describe("helpers", () => {
  it("counts links and flags link spam above three", () => {
    const text = "see https://a.com https://b.com www.c.com and https://d.com/x";
    expect(countUrls(text)).toBe(4);
    expect(isLinkSpam(text)).toBe(true);
    expect(isLinkSpam("one https://a.com link")).toBe(false);
  });

  it("only keeps http(s) URLs", () => {
    expect(sanitizeUrl("https://acme.com/a?b=1")).toBe("https://acme.com/a?b=1");
    expect(sanitizeUrl("ftp://acme.com")).toBeNull();
    expect(sanitizeUrl("not a url")).toBeNull();
  });

  it("ignores far-future dates", () => {
    expect(sanitizeDate(new Date(Date.now() + 3 * 86400000))).toBeNull();
    expect(sanitizeDate("2026-01-01T00:00:00Z")?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("drops oversized or non-object meta", () => {
    expect(sanitizeMeta([1, 2])).toEqual({});
    expect(sanitizeMeta({ big: "x".repeat(5000) })).toEqual({});
    expect(sanitizeMeta({ a: 1, when: undefined })).toEqual({ a: 1 });
  });

  it("normalises whitespace but keeps paragraphs", () => {
    expect(normalizeFeedbackText("  a \t b \n\n\n\n c  ")).toBe("a b\n\nc");
  });
});
