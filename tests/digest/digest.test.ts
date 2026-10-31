import { describe, expect, it } from "vitest";
import { buildSlackDigest, digestSubject, isoWeekKey, renderDigestEmail, weekLabel, type DigestData, type DigestIssue } from "@/lib/digest/render";

describe("isoWeekKey", () => {
  it("follows ISO 8601 week numbering", () => {
    expect(isoWeekKey(new Date("2026-11-02T03:30:00Z"))).toBe("2026-W45");
    expect(isoWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2024-12-30T00:00:00Z"))).toBe("2025-W01");
    expect(isoWeekKey(new Date("2026-11-08T23:59:59Z"))).toBe("2026-W45");
  });

  it("labels the Monday of the week", () => {
    expect(weekLabel(new Date("2026-11-04T10:00:00Z"))).toBe("Week of 2 Nov");
    expect(weekLabel(new Date("2026-11-02T03:30:00Z"))).toBe("Week of 2 Nov");
  });
});

const issue = (id: string, over: Partial<DigestIssue> = {}): DigestIssue => ({
  id,
  title: `Issue ${id}`,
  trend: "persistent",
  status: "backlog",
  frequency: 4,
  priorityScore: 64,
  rank: null,
  quote: "The quote",
  url: `https://app.example/issues/${id}`,
  ...over,
});

const data: DigestData = {
  workspaceName: "Acme team",
  productName: "Acme Notes",
  weekKey: "2026-W45",
  weekLabel: "Week of 2 Nov",
  topIssues: [issue("a", { rank: 1, trend: "new" }), issue("b", { rank: 2, trend: "worsened", title: "Sync & <lost> notes" })],
  newIssues: [issue("a", { trend: "new" })],
  newCount: 3,
  worsened: [issue("b", { trend: "worsened" })],
  worsenedCount: 1,
  resolved: [issue("c", { trend: "resolved", status: "shipped" })],
  feedbackBySource: { appstore: 12, widget: 3 },
  feedbackTotal: 15,
  feedbackByDay: ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"].map((label, i) => ({ label, count: i })),
  listUrl: "https://app.example/dashboard",
  settingsUrl: "https://app.example/settings/account",
};

describe("renderDigestEmail", () => {
  it("uses the subject from the spec", () => {
    expect(digestSubject(data)).toBe("Your Monday list for Acme Notes: 3 new, 1 worse");
  });

  it("renders every section, escaped, with a plain-text alternative", () => {
    const email = renderDigestEmail(data);
    expect(email.subject).toBe("Your Monday list for Acme Notes: 3 new, 1 worse");
    expect(email.html).toContain("Top issues this week");
    expect(email.html).toContain("New since last week");
    expect(email.html).toContain("Getting worse");
    expect(email.html).toContain("Resolved");
    expect(email.html).toContain("Feedback this week");
    expect(email.html).toContain("Sync &amp; &lt;lost&gt; notes");
    expect(email.html).toContain('aria-label="Priority 64 of 100"');
    expect(email.html).toContain("shipped by your team");
    expect(email.text).toContain("1. Issue a (New, 4 reports, priority 64)");
    expect(email.text).toContain("- App Store: 12");
    expect(email.text).toContain("Open your list: https://app.example/dashboard");
  });

  it("handles a quiet week", () => {
    const email = renderDigestEmail({
      ...data,
      topIssues: [],
      newIssues: [],
      newCount: 0,
      worsened: [],
      worsenedCount: 0,
      resolved: [],
      feedbackBySource: {},
      feedbackTotal: 0,
    });
    expect(email.html).toContain("No open issues right now.");
    expect(email.html).toContain("No new feedback this week.");
    expect(email.html).not.toContain("New since last week");
  });

  it("builds a short Slack version", () => {
    const msg = buildSlackDigest(data);
    expect(msg.text).toBe("Your Monday list for Acme Notes: 3 new, 1 worse");
    expect(JSON.stringify(msg.blocks)).toContain("Open your list");
  });
});
