import { describe, expect, it } from "vitest";
import type { IssueDTO } from "@/lib/db/dto";
import { CSV_COLUMNS, csvCell, exportFilename, issuesToCsv, issuesToJson } from "@/lib/monitor/export";

const dto: IssueDTO = {
  id: "i1",
  productId: "p1",
  scope: "own",
  competitorName: null,
  title: 'Checkout "fails", sometimes',
  rankingReason: "=HYPERLINK(evil)",
  category: "checkout",
  severity: "High",
  churnRisk: "Medium",
  effort: "S",
  affectedSegment: "Buyers\non mobile",
  recommendedAction: "fix_now",
  priorityScore: 91,
  frequency: 12,
  rank: 1,
  evidence: ["a", "b"],
  sourceMix: { appstore: 8, reddit: 4 },
  status: "backlog",
  trend: "worsened",
  prd: null,
  prdGeneratedAt: null,
  externalTarget: null,
  externalUrl: null,
  filedAt: null,
  firstSeenAt: "2026-10-01T00:00:00.000Z",
  lastSeenAt: "2026-11-01T00:00:00.000Z",
  resolvedAt: null,
  updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});

describe("issuesToCsv", () => {
  it("writes a header and one row per issue with a BOM", () => {
    const csv = issuesToCsv([dto]);
    expect(csv.startsWith("﻿")).toBe(true);
    const [header] = csv.slice(1).split("\r\n");
    expect(header).toBe(CSV_COLUMNS.join(","));
    expect(csv).toContain('"Checkout ""fails"", sometimes"');
    expect(csv).toContain("'=HYPERLINK(evil)");
    expect(csv).toContain("appstore:8 reddit:4");
  });

  it("exports JSON with metadata", () => {
    const parsed = JSON.parse(issuesToJson("Acme", [dto], new Date("2026-11-02T00:00:00Z")));
    expect(parsed).toMatchObject({ product: "Acme", exportedAt: "2026-11-02T00:00:00.000Z" });
    expect(parsed.issues).toHaveLength(1);
  });

  it("builds a safe filename", () => {
    expect(exportFilename("Acme Notes / Beta!", "csv", new Date("2026-11-02T10:00:00Z"))).toBe(
      "buildmonday-issues-acme-notes-beta-2026-11-02.csv",
    );
    expect(exportFilename("???", "json", new Date("2026-11-02T10:00:00Z"))).toBe("buildmonday-issues-product-2026-11-02.json");
  });
});
