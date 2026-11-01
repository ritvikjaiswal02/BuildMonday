import { describe, expect, it } from "vitest";
import { allocateSources, normalizeCompetitorName, type ConfigValidator } from "@/app/api/sources/_lib/allocate";
import { describeSource } from "@/components/onboarding/source-input";
import type { SourceConfig } from "@/lib/db/schema";

const validate: ConfigValidator = (kind, config) => {
  const c = config as Record<string, unknown>;
  if (kind === "trustpilot" && typeof c.domain !== "string") return { ok: false, error: "Trustpilot needs a domain." };
  return { ok: true, config: config as SourceConfig };
};

const tp = (domain: string, role: "own" | "competitor" = "own", competitorName: string | null = null) => ({
  kind: "trustpilot" as const,
  config: { domain },
  role,
  competitorName,
});

const free = { sourceLimit: 3, competitorTracking: false, competitorLimit: 0 };
const pro = { sourceLimit: 10, competitorTracking: true, competitorLimit: 2 };

describe("allocateSources", () => {
  it("enables sources up to the plan limit and pauses the rest", () => {
    const { toInsert, skipped } = allocateSources(
      [tp("a.com"), tp("b.com"), tp("c.com"), tp("d.com")],
      free,
      validate,
      describeSource,
    );
    expect(toInsert.map((s) => [s.config, s.enabled])).toEqual([
      [{ domain: "a.com" }, true],
      [{ domain: "b.com" }, true],
      [{ domain: "c.com" }, true],
      [{ domain: "d.com" }, false],
    ]);
    expect(skipped).toEqual([
      expect.objectContaining({ kind: "trustpilot", reason: "limit", label: "Trustpilot d.com" }),
    ]);
    expect(skipped[0].message).toMatch(/Saved but paused/);
  });

  it("does not save competitor sources without competitor tracking", () => {
    const { toInsert, skipped } = allocateSources([tp("x.com", "competitor", "Rival")], free, validate, describeSource);
    expect(toInsert).toEqual([]);
    expect(skipped).toEqual([expect.objectContaining({ reason: "plan" })]);
  });

  it("gives own sources the slots before competitors", () => {
    const { toInsert } = allocateSources(
      [tp("rival.com", "competitor", "Rival"), tp("a.com"), tp("b.com")],
      { ...pro, sourceLimit: 2 },
      validate,
      describeSource,
    );
    expect(toInsert.map((s) => [s.role, s.enabled])).toEqual([
      ["own", true],
      ["own", true],
      ["competitor", false],
    ]);
  });

  it("limits distinct competitor names, not sources per competitor", () => {
    const { toInsert, skipped } = allocateSources(
      [
        tp("one.com", "competitor", "One"),
        tp("one-2.com", "competitor", " one "),
        tp("two.com", "competitor", "Two"),
        tp("three.com", "competitor", "Three"),
      ],
      pro,
      validate,
      describeSource,
    );
    expect(toInsert.map((s) => s.competitorName)).toEqual(["One", "one", "Two"]);
    expect(skipped).toEqual([expect.objectContaining({ reason: "limit", label: "Trustpilot three.com" })]);
  });

  it("counts existing sources and competitors and drops duplicates", () => {
    const { toInsert } = allocateSources(
      [tp("a.com"), tp("a.com"), tp("b.com"), tp("c.com", "competitor", "Known")],
      {
        ...pro,
        sourceLimit: 3,
        existingEnabled: 1,
        existingFingerprints: ["trustpilot:{\"domain\":\"b.com\"}"],
        existingCompetitors: ["known", "other"],
      },
      validate,
      describeSource,
    );
    expect(toInsert.map((s) => [s.config, s.enabled])).toEqual([
      [{ domain: "a.com" }, true],
      [{ domain: "c.com" }, true],
    ]);
  });

  it("reports invalid configs and competitor sources without a name", () => {
    const { toInsert, skipped } = allocateSources(
      [{ kind: "trustpilot", config: {}, role: "own" }, tp("x.com", "competitor", "  ")],
      pro,
      validate,
      describeSource,
    );
    expect(toInsert).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["invalid", "invalid"]);
    expect(skipped[0].message).toBe("Trustpilot needs a domain.");
  });

  it("treats -1 as unlimited", () => {
    const many = Array.from({ length: 30 }, (_, i) => tp(`s${i}.com`));
    const { toInsert, skipped } = allocateSources(
      many,
      { sourceLimit: -1, competitorTracking: true, competitorLimit: -1 },
      validate,
      describeSource,
    );
    expect(toInsert.every((s) => s.enabled)).toBe(true);
    expect(skipped).toEqual([]);
  });

  it("normalises competitor names", () => {
    expect(normalizeCompetitorName("  Big   Rival ")).toBe("Big Rival");
    expect(normalizeCompetitorName("")).toBeNull();
    expect(normalizeCompetitorName(null)).toBeNull();
  });
});
