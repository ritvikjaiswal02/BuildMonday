import { beforeEach, describe, expect, it, vi } from "vitest";

const callGeminiJson = vi.fn();
vi.mock("@/lib/gemini", () => ({ callGeminiJson: (...args: unknown[]) => callGeminiJson(...args) }));

import { analyzeItems, chunk, normalizeIssues, normalizePass1, PASS_1_CHUNK } from "@/lib/monitor/analyze";
import type { Source } from "@/lib/types";

const items: Array<{ text: string; source: Source }> = [
  { text: "Checkout fails with a promo code", source: "appstore" },
  { text: "Promo codes break the payment page", source: "reddit" },
  { text: "Dark mode please", source: "widget" },
  { text: "Buy cheap watches at spam dot com", source: "widget" },
];

beforeEach(() => {
  callGeminiJson.mockReset();
});

describe("normalizePass1", () => {
  it("joins by index, fills defaults and sanitises enums", () => {
    const tags = normalizePass1(
      [
        { index: 2, category: "Checkout", severity: "critical", churn_signal: "high", affected_segment: "Mobile buyers", urgency_keywords: ["fails", 3] },
        { index: 1, category: "made-up", severity: "Low", churn_signal: "Low", relevant: false },
        { index: 99, category: "ui" },
      ],
      3,
    );
    expect(tags[0]).toMatchObject({ category: "other", severity: "Low", relevant: false });
    expect(tags[1]).toMatchObject({ category: "checkout", severity: "High", churn_signal: "High", urgency_keywords: ["fails"] });
    expect(tags[2]).toMatchObject({ category: "other", severity: "Medium", relevant: true });
  });

  it("accepts an object wrapper and falls back to array position", () => {
    const tags = normalizePass1({ items: [{ category: "billing" }] }, 1);
    expect(tags[0].category).toBe("billing");
  });

  it("returns defaults for garbage", () => {
    expect(normalizePass1("nope", 2)).toHaveLength(2);
  });
});

describe("normalizeIssues", () => {
  it("recomputes frequency and source mix from members and dedupes members across issues", () => {
    const issues = normalizeIssues(
      [
        {
          title: "Promo codes break checkout",
          member_indices: [1, 2, 2, 9],
          frequency: 10,
          severity: "High",
          churn_risk: "Medium",
          effort: "small",
          recommended_action: "fix now",
          priority_score: 140,
          evidence: ["Checkout fails with a promo code"],
          source_mix: { appstore: 9 },
          ranking_reason: "2 reports say checkout fails.",
        },
        { title: "Duplicate of the above", member_indices: [1, 2], priority_score: 90 },
        { title: "Dark mode", member_indices: [3], priority_score: 20, severity: "Low" },
        { title: "" },
      ],
      items,
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      title: "Promo codes break checkout",
      frequency: 2,
      member_indices: [1, 2],
      source_mix: { appstore: 1, reddit: 1 },
      priority_score: 100,
      effort: "S",
      recommended_action: "fix_now",
      ranking_reason: "2 reports say checkout fails.",
    });
    expect(issues[1]).toMatchObject({ title: "Dark mode", frequency: 1, recommended_action: "monitor", evidence: ["Dark mode please"] });
  });

  it("keeps issues without member indices using the model's frequency", () => {
    const issues = normalizeIssues([{ title: "Slow sync", frequency: 4, source_mix: { hn: 4, bogus: 2 } }], items);
    expect(issues[0]).toMatchObject({ frequency: 4, source_mix: { hn: 4 }, member_indices: [] });
  });

  it("sorts by priority then frequency", () => {
    const issues = normalizeIssues(
      [
        { title: "A", member_indices: [1], priority_score: 50 },
        { title: "B", member_indices: [2, 3], priority_score: 50 },
        { title: "C", member_indices: [4], priority_score: 80 },
      ],
      items,
    );
    expect(issues.map((i) => i.title)).toEqual(["C", "B", "A"]);
  });
});

describe("chunk", () => {
  it("splits evenly with a remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("analyzeItems", () => {
  it("tags, drops irrelevant items from clustering and returns ranked issues", async () => {
    callGeminiJson
      .mockResolvedValueOnce([
        { index: 1, category: "checkout", severity: "High", churn_signal: "Medium", affected_segment: "Buyers", urgency_keywords: [] },
        { index: 2, category: "checkout", severity: "High", churn_signal: "Low", affected_segment: "Buyers", urgency_keywords: [] },
        { index: 3, category: "ui", severity: "Low", churn_signal: "Low", affected_segment: "All", urgency_keywords: [] },
        { index: 4, category: "other", severity: "Low", churn_signal: "Low", relevant: false },
      ])
      .mockResolvedValueOnce([
        { title: "Promo codes break checkout", member_indices: [1, 2], priority_score: 88, severity: "High", churn_risk: "Medium" },
        { title: "Dark mode", member_indices: [3], priority_score: 12 },
      ]);

    const result = await analyzeItems(items, { productName: "Acme" });
    expect(result.tagged).toHaveLength(4);
    expect(result.tagged[0]).toMatchObject({ complaint: items[0].text, category: "checkout", source: "appstore" });
    expect(result.relevant).toEqual([true, true, true, false]);
    expect(result.issues.map((i) => i.title)).toEqual(["Promo codes break checkout", "Dark mode"]);

    const pass2Prompt = String(callGeminiJson.mock.calls[1][0]);
    expect(pass2Prompt).toContain("Product: Acme");
    expect(pass2Prompt).not.toContain("spam dot com");
  });

  it("runs pass 1 in chunks", async () => {
    const many = Array.from({ length: PASS_1_CHUNK + 5 }, (_, i) => ({ text: `complaint ${i}`, source: "manual" as Source }));
    callGeminiJson.mockImplementation(async (prompt: string) => (prompt.includes("Tag each piece") ? [] : []));
    const result = await analyzeItems(many);
    const pass1Calls = callGeminiJson.mock.calls.filter((c) => String(c[0]).includes("Tag each piece"));
    expect(pass1Calls).toHaveLength(2);
    expect(result.tagged).toHaveLength(PASS_1_CHUNK + 5);
  });

  it("skips clustering when nothing is relevant", async () => {
    callGeminiJson.mockResolvedValueOnce([{ index: 1, relevant: false }]);
    const result = await analyzeItems([{ text: "lol", source: "manual" }]);
    expect(result.issues).toEqual([]);
    expect(callGeminiJson).toHaveBeenCalledTimes(1);
  });

  it("returns empty for no input", async () => {
    expect(await analyzeItems([])).toEqual({ tagged: [], issues: [], relevant: [] });
    expect(callGeminiJson).not.toHaveBeenCalled();
  });
});
