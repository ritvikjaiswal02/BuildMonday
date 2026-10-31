import { describe, expect, it } from "vitest";
import {
  buildFullReportMarkdown,
  buildIssueHtml,
  escapeHtml,
  issueToMarkdown,
  parseInline,
  parseLightMarkdown,
  prdToMarkdown,
} from "@/lib/markdown";
import type { Issue, PrdStub } from "@/lib/types";

const issue: Issue = {
  title: "Checkout fails at payment",
  frequency: 12,
  severity: "High",
  churn_risk: "High",
  effort: "M",
  affected_segment: "Mobile buyers",
  evidence: ["Payment failed twice", "Card declined <script>", "Lost my cart"],
  recommended_action: "fix_now",
  priority_score: 91,
  ranking_reason: "Blocks revenue for many users.",
};

const prd: PrdStub = {
  problem_statement: "Payments fail.",
  affected_users: ["Mobile buyers"],
  acceptance_criteria: ["Payment succeeds"],
  edge_cases: ["3DS"],
  success_metrics: ["Failure rate below 1%"],
  implementation_notes: "Check the gateway.",
  estimated_complexity: "M",
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

describe("issueToMarkdown", () => {
  it("includes the meta line, reason, evidence and link", () => {
    const md = issueToMarkdown(issue, { rank: 1, status: "in_progress", link: "https://x.test/issues/1" });
    expect(md).toContain("## 1. Checkout fails at payment");
    expect(md).toContain("**Action:** Fix now");
    expect(md).toContain("**Status:** In progress");
    expect(md).toContain("**Frequency:** 12 reports");
    expect(md).toContain('> "Payment failed twice"');
    expect(md).toContain("[Open in BuildMonday](https://x.test/issues/1)");
  });

  it("adds the PRD when present", () => {
    expect(issueToMarkdown(issue, { prd })).toContain("### PRD stub");
    expect(prdToMarkdown(issue, prd)).toContain("**Acceptance criteria:**\n- Payment succeeds");
  });
});

describe("buildFullReportMarkdown", () => {
  it("summarises and lists every issue with its status", () => {
    const second: Issue = { ...issue, title: "Search broken", recommended_action: "monitor", frequency: 1 };
    const md = buildFullReportMarkdown([issue, second], { 0: prd }, { "search-broken": "shipped" }, slug);
    expect(md).toContain("13 complaints grouped into 2 issues");
    expect(md).toContain("- Fix now: 1 issue");
    expect(md).toContain("## 2. Search broken");
    expect(md).toContain("**Status:** Shipped");
    expect(md.match(/### PRD stub/g)).toHaveLength(1);
  });
});

describe("HTML output", () => {
  it("escapes user text", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    const html = buildIssueHtml(issue, null, "backlog");
    expect(html).toContain("Card declined &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("parseLightMarkdown", () => {
  it("reads paragraphs, lists, headings and inline marks", () => {
    const blocks = parseLightMarkdown(
      "## Top issue\nCheckout is **broken** for `iOS`.\nStill.\n\n- one\n- two\n\n1. first\n2) second",
    );
    expect(blocks[0]).toEqual({ type: "h", spans: [{ text: "Top issue" }] });
    expect(blocks[1]).toEqual({
      type: "p",
      spans: [
        { text: "Checkout is " },
        { text: "broken", bold: true },
        { text: " for " },
        { text: "iOS", code: true },
        { text: ". Still." },
      ],
    });
    expect(blocks[2]).toEqual({ type: "ul", items: [[{ text: "one" }], [{ text: "two" }]] });
    expect(blocks[3]).toMatchObject({ type: "ol", start: 1, items: [[{ text: "first" }], [{ text: "second" }]] });
  });

  it("never produces HTML", () => {
    expect(parseInline("<b>hi</b>")).toEqual([{ text: "<b>hi</b>" }]);
    expect(parseLightMarkdown("")).toEqual([]);
  });
});
