/**
 * Issue export to CSV and JSON. Pure; works on DTOs.
 */
import type { IssueDTO } from "@/lib/db/dto";

export const CSV_COLUMNS = [
  "rank",
  "title",
  "status",
  "trend",
  "priority_score",
  "frequency",
  "severity",
  "churn_risk",
  "effort",
  "recommended_action",
  "affected_segment",
  "category",
  "scope",
  "competitor",
  "ranking_reason",
  "evidence",
  "sources",
  "first_seen",
  "last_seen",
  "resolved_at",
  "filed_url",
] as const;

/**
 * Quotes a CSV cell (RFC 4180) and neutralises spreadsheet formulas: cells
 * starting with = + - @ tab or carriage return get a leading apostrophe.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function issueRow(i: IssueDTO): unknown[] {
  return [
    i.rank,
    i.title,
    i.status,
    i.trend,
    i.priorityScore,
    i.frequency,
    i.severity,
    i.churnRisk,
    i.effort,
    i.recommendedAction,
    i.affectedSegment,
    i.category,
    i.scope,
    i.competitorName,
    i.rankingReason,
    i.evidence.join(" | "),
    Object.entries(i.sourceMix)
      .map(([k, n]) => `${k}:${n}`)
      .join(" "),
    i.firstSeenAt,
    i.lastSeenAt,
    i.resolvedAt,
    i.externalUrl,
  ];
}

export function issuesToCsv(list: IssueDTO[]): string {
  const lines = [CSV_COLUMNS.join(","), ...list.map((i) => issueRow(i).map(csvCell).join(","))];
  // BOM so Excel opens UTF-8 correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function issuesToJson(productName: string, list: IssueDTO[], now = new Date()): string {
  return JSON.stringify({ product: productName, exportedAt: now.toISOString(), issues: list }, null, 2);
}

/** "buildmonday-issues-acme-notes-2026-11-02.csv" */
export function exportFilename(productName: string, format: "csv" | "json", now = new Date()): string {
  const slug =
    productName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "product";
  return `buildmonday-issues-${slug}-${now.toISOString().slice(0, 10)}.${format}`;
}
