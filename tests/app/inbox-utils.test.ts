import { describe, expect, it } from "vitest";
import {
  applyStatusChange,
  EMPTY_COUNTS,
  feedbackQuery,
  groupIdsByStatus,
  hasActiveFilters,
  inboxKeyAction,
  inboxUrlQuery,
  isTypingTarget,
  parseInboxFilters,
  parsePastedFeedback,
  totalCount,
} from "@/components/app/inbox/inbox-utils";

describe("parseInboxFilters", () => {
  it("defaults to the new tab", () => {
    expect(parseInboxFilters({})).toEqual({ tab: "new", sourceKind: "", issueId: "", q: "" });
  });

  it("accepts known values and drops unknown ones", () => {
    expect(parseInboxFilters({ status: "spam", source: "reddit", q: "crash" })).toEqual({
      tab: "spam",
      sourceKind: "reddit",
      issueId: "",
      q: "crash",
    });
    expect(parseInboxFilters({ status: "bogus", source: "myspace" })).toMatchObject({ tab: "new", sourceKind: "" });
    expect(parseInboxFilters({ issueId: "x'; drop" }).issueId).toBe("");
  });

  it("shows every status when filtering by issue without a status", () => {
    expect(parseInboxFilters({ issueId: "abc-123" })).toMatchObject({ tab: "all", issueId: "abc-123" });
    expect(parseInboxFilters({ issueId: "abc-123", status: "new" }).tab).toBe("new");
  });
});

describe("query strings", () => {
  it("builds the API query", () => {
    const q = new URLSearchParams(
      feedbackQuery("p1", { tab: "all", sourceKind: "widget", issueId: "", q: "  slow " }, { cursor: "c1", limit: 20 }),
    );
    expect(Object.fromEntries(q)).toEqual({ productId: "p1", sourceKind: "widget", q: "slow", cursor: "c1", limit: "20" });
    expect(new URLSearchParams(feedbackQuery("p1", { tab: "new", sourceKind: "", issueId: "i1", q: "" })).get("status")).toBe("new");
  });

  it("builds the page URL with non-default values only", () => {
    expect(inboxUrlQuery({ tab: "new", sourceKind: "", issueId: "", q: "" })).toBe("");
    expect(inboxUrlQuery({ tab: "all", sourceKind: "appstore", issueId: "", q: "x" })).toBe("status=all&source=appstore&q=x");
    expect(hasActiveFilters({ tab: "all", sourceKind: "", issueId: "", q: " " })).toBe(false);
    expect(hasActiveFilters({ tab: "new", sourceKind: "", issueId: "i", q: "" })).toBe(true);
  });
});

describe("counts", () => {
  it("moves counts between statuses and never goes negative", () => {
    const counts = { ...EMPTY_COUNTS, new: 3, triaged: 1 };
    const next = applyStatusChange(counts, [{ status: "new" }, { status: "new" }, { status: "archived" }], "archived");
    expect(next).toEqual({ new: 1, triaged: 1, archived: 2, spam: 0 });
    expect(applyStatusChange(EMPTY_COUNTS, [{ status: "new" }], "spam")).toEqual({ new: 0, triaged: 0, archived: 0, spam: 1 });
    expect(totalCount(next)).toBe(4);
  });

  it("groups ids by status for undo", () => {
    const groups = groupIdsByStatus([
      { id: "a", status: "new" },
      { id: "b", status: "triaged" },
      { id: "c", status: "new" },
    ]);
    expect(groups.get("new")).toEqual(["a", "c"]);
    expect(groups.get("triaged")).toEqual(["b"]);
  });
});

describe("keyboard", () => {
  it("maps keys to actions and ignores modifier chords", () => {
    expect(inboxKeyAction({ key: "j" })).toBe("next");
    expect(inboxKeyAction({ key: "k" })).toBe("prev");
    expect(inboxKeyAction({ key: "x" })).toBe("toggle-select");
    expect(inboxKeyAction({ key: "e" })).toBe("archive");
    expect(inboxKeyAction({ key: "/" })).toBe("focus-search");
    expect(inboxKeyAction({ key: "e", metaKey: true })).toBeNull();
    expect(inboxKeyAction({ key: "q" })).toBeNull();
  });

  it("detects typing targets", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "LI" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("parsePastedFeedback", () => {
  it("keeps valid lines and reports what was skipped", () => {
    const out = parsePastedFeedback(`ok line\n\nno\n${"x".repeat(4001)}\nanother one`);
    expect(out.lines).toEqual(["ok line", "another one"]);
    expect(out.skipped).toBe(2);
    expect(out.truncated).toBe(false);
  });

  it("caps at 500 lines", () => {
    const out = parsePastedFeedback(Array.from({ length: 520 }, (_, i) => `item ${i}`).join("\n"));
    expect(out.lines).toHaveLength(500);
    expect(out.truncated).toBe(true);
  });
});
