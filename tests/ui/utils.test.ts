import { describe, expect, it } from "vitest";
import {
  cn,
  formatDate,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  initials,
  pluralize,
  truncate,
} from "@/lib/utils";
import { prioritySegments } from "@/components/ui/meter";
import { sparklinePoints } from "@/components/ui/sparkline";
import { APP_NAV, isNavActive } from "@/components/shell/nav";

describe("cn", () => {
  it("merges conflicting Tailwind classes, last wins", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });

  it("keeps custom token colours and sizes apart", () => {
    // text-sm is a size, text-ink-muted is a colour: both must survive.
    expect(cn("text-sm text-ink", "text-ink-muted")).toBe("text-sm text-ink-muted");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date(2026, 10, 1, 12, 0, 0); // 1 Nov 2026, 12:00 local

  it("says just now under a minute", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 20_000), now)).toBe("just now");
  });

  it("uses minutes under an hour", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 5 * 60_000), now)).toBe("5 min ago");
  });

  it("uses hours under a day", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3 h ago");
  });

  it("says yesterday for the previous calendar day", () => {
    expect(formatRelativeTime(new Date(2026, 9, 31, 8, 0), now)).toBe("yesterday");
  });

  it("uses days within a week", () => {
    expect(formatRelativeTime(new Date(2026, 9, 28, 12, 0), now)).toBe("4 days ago");
  });

  it("falls back to a short date after a week", () => {
    expect(formatRelativeTime(new Date(2026, 9, 12, 12, 0), now)).toBe("12 Oct");
  });

  it("includes the year for other years", () => {
    expect(formatRelativeTime(new Date(2025, 9, 12, 12, 0), now)).toBe("12 Oct 2025");
  });

  it("handles future times", () => {
    expect(formatRelativeTime(new Date(now.getTime() + 10 * 60_000), now)).toBe("in 10 min");
    expect(formatRelativeTime(new Date(now.getTime() + 5 * 3_600_000), now)).toBe("in 5 h");
    expect(formatRelativeTime(new Date(2026, 10, 2, 18, 0), now)).toBe("tomorrow");
  });

  it("accepts ISO strings and returns empty for invalid input", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 120_000).toISOString(), now)).toBe("2 min ago");
    expect(formatRelativeTime("not a date", now)).toBe("");
  });
});

describe("formatDate", () => {
  it("formats day and month", () => {
    expect(formatDate(new Date(2026, 0, 3), new Date(2026, 5, 1))).toBe("3 Jan");
  });
});

describe("formatNumber", () => {
  it("groups thousands", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(9999)).toBe("9,999");
  });

  it("abbreviates from ten thousand", () => {
    expect(formatNumber(10_000)).toBe("10k");
    expect(formatNumber(12_345)).toBe("12.3k");
    expect(formatNumber(1_250_000)).toBe("1.3M");
  });

  it("handles negatives and non-finite values", () => {
    expect(formatNumber(-12_345)).toBe("-12.3k");
    expect(formatNumber(Number.NaN)).toBe("0");
  });
});

describe("pluralize", () => {
  it("picks singular or plural", () => {
    expect(pluralize(1, "issue")).toBe("1 issue");
    expect(pluralize(3, "issue")).toBe("3 issues");
    expect(pluralize(0, "issue")).toBe("0 issues");
    expect(pluralize(2, "reply", "replies")).toBe("2 replies");
    expect(pluralize(1500, "item")).toBe("1,500 items");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("Checkout fails", 40)).toBe("Checkout fails");
  });

  it("cuts long text and adds an ellipsis within the limit", () => {
    const out = truncate("Checkout fails on Android when the card has 3-D Secure", 24);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(24);
  });

  it("handles tiny limits", () => {
    expect(truncate("abc", 0)).toBe("");
    expect(truncate("abc", 1)).toBe("…");
  });
});

describe("formatDuration", () => {
  it("formats run durations", () => {
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(12_000)).toBe("12 s");
    expect(formatDuration(72_000)).toBe("1 min 12 s");
    expect(formatDuration(120_000)).toBe("2 min");
    expect(formatDuration(3_840_000)).toBe("1 h 4 min");
    expect(formatDuration(null)).toBe("");
  });
});

describe("initials", () => {
  it("derives initials from names and emails", () => {
    expect(initials("Ritvik Jaiswal")).toBe("RJ");
    expect(initials("sam@example.com")).toBe("S");
    expect(initials("ada.lovelace@example.com")).toBe("AL");
    expect(initials(null)).toBe("?");
  });
});

describe("prioritySegments", () => {
  it("fills ceil(score / 20) of five segments", () => {
    expect(prioritySegments(0)).toBe(0);
    expect(prioritySegments(1)).toBe(1);
    expect(prioritySegments(20)).toBe(1);
    expect(prioritySegments(21)).toBe(2);
    expect(prioritySegments(82)).toBe(5);
    expect(prioritySegments(100)).toBe(5);
    expect(prioritySegments(140)).toBe(5);
    expect(prioritySegments(Number.NaN)).toBe(0);
  });
});

describe("sparklinePoints", () => {
  it("spans the width and maps the max to the top", () => {
    const pts = sparklinePoints([0, 5, 10], 64, 20);
    expect(pts).toHaveLength(3);
    expect(pts[0]![0]).toBe(2);
    expect(pts[2]![0]).toBe(62);
    expect(pts[2]![1]).toBe(2); // max at top padding
    expect(pts[0]![1]).toBe(18); // min at bottom padding
  });

  it("centres a flat or single-point series", () => {
    expect(sparklinePoints([4, 4], 64, 20).every(([, y]) => y === 10)).toBe(true);
    expect(sparklinePoints([7], 64, 20)).toEqual([[32, 10]]);
    expect(sparklinePoints([], 64, 20)).toEqual([]);
  });
});

describe("app navigation", () => {
  it("has the contracted items in order", () => {
    expect(APP_NAV.map((i) => i.href)).toEqual([
      "/dashboard",
      "/inbox",
      "/issues",
      "/runs",
      "/settings",
      "/extension",
      "/billing",
    ]);
  });

  it("marks parents of nested routes active but not siblings with a shared prefix", () => {
    expect(isNavActive("/issues/abc", "/issues")).toBe(true);
    expect(isNavActive("/issues", "/issues")).toBe(true);
    expect(isNavActive("/settings/sources", "/settings")).toBe(true);
    expect(isNavActive("/app", "/apples")).toBe(false);
    expect(isNavActive("/applications", "/app")).toBe(false);
    expect(isNavActive(null, "/app")).toBe(false);
  });
});
