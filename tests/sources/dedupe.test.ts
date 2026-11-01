import { describe, expect, it } from "vitest";
import { dedupeKey, normalizeText } from "@/lib/sources/dedupe";

describe("normalizeText", () => {
  it("ignores case, whitespace, punctuation runs, smart quotes and links", () => {
    expect(normalizeText("  The app  CRASHES!!! on   login ")).toBe("the app crashes on login");
    expect(normalizeText("It’s broken")).toBe(normalizeText("It's broken"));
    expect(normalizeText("Broken, see https://example.com/x?y=1 for details")).toBe("broken see for details");
  });

  it("keeps letters from other scripts", () => {
    expect(normalizeText("ऐप बंद हो जाता है!")).toBe("ऐप बंद हो जाता है");
  });
});

describe("dedupeKey", () => {
  it("is a stable sha256 hex", () => {
    const k = dedupeKey("p1", "appstore", { text: "Crashes on login" });
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(dedupeKey("p1", "appstore", { text: "crashes   on LOGIN!" })).toBe(k);
  });

  it("uses the external id when there is one", () => {
    const a = dedupeKey("p1", "reddit", { externalId: "t1_abc", text: "first wording" });
    const b = dedupeKey("p1", "reddit", { externalId: "t1_abc", text: "edited wording" });
    expect(a).toBe(b);
    expect(dedupeKey("p1", "reddit", { externalId: "t1_xyz", text: "first wording" })).not.toBe(a);
  });

  it("differs by product and by source kind", () => {
    const base = dedupeKey("p1", "widget", { text: "same text" });
    expect(dedupeKey("p2", "widget", { text: "same text" })).not.toBe(base);
    expect(dedupeKey("p1", "manual", { text: "same text" })).not.toBe(base);
  });

  it("treats a blank external id as missing", () => {
    expect(dedupeKey("p1", "appstore", { externalId: "  ", text: "x y z" })).toBe(dedupeKey("p1", "appstore", { text: "x y z" }));
  });
});
