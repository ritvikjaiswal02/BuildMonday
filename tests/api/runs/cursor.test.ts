import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, intParam } from "@/lib/monitor/cursor";

describe("keyset cursors", () => {
  it("round-trips a timestamp and id", () => {
    const c = encodeCursor(new Date("2026-11-01T05:00:00.123Z"), "run-1");
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(c)).toEqual({ at: new Date("2026-11-01T05:00:00.123Z"), id: "run-1" });
  });

  it("accepts ISO strings", () => {
    expect(decodeCursor(encodeCursor("2026-11-01T00:00:00Z", "x"))?.id).toBe("x");
  });

  it("ignores garbage", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from("nodate|id").toString("base64url"))).toBeNull();
    expect(decodeCursor("x".repeat(500))).toBeNull();
  });
});

describe("intParam", () => {
  it("clamps and falls back", () => {
    expect(intParam(null, 20, 1, 100)).toBe(20);
    expect(intParam("500", 20, 1, 100)).toBe(100);
    expect(intParam("0", 20, 1, 100)).toBe(1);
    expect(intParam("abc", 20, 1, 100)).toBe(20);
    expect(intParam("7.9", 20, 1, 100)).toBe(7);
  });
});
