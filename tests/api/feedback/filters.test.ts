import { describe, expect, it } from "vitest";
import { feedbackFilterSchema } from "@/app/api/feedback/_lib/query";

describe("feedbackFilterSchema", () => {
  it("parses comma lists and treats 'all' as no filter", () => {
    expect(feedbackFilterSchema.parse({ status: "new,triaged", sourceKind: "all" })).toMatchObject({
      status: ["new", "triaged"],
      sourceKind: [],
    });
  });

  it("accepts issueId none and a role", () => {
    expect(feedbackFilterSchema.parse({ issueId: "none", role: "competitor" })).toMatchObject({ issueId: "none", role: "competitor" });
  });

  it("rejects unknown statuses and kinds", () => {
    expect(() => feedbackFilterSchema.parse({ status: "deleted" })).toThrow();
    expect(() => feedbackFilterSchema.parse({ sourceKind: "myspace" })).toThrow();
  });

  it("trims search text", () => {
    expect(feedbackFilterSchema.parse({ q: "  checkout  " }).q).toBe("checkout");
  });
});
