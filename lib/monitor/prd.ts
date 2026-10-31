import type { Effort, PrdStub } from "@/lib/types";

function strings(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, max);
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 2000) : fallback;
}

/** Coerces model output into a complete PrdStub so the UI never sees missing fields. */
export function normalizePrd(raw: unknown): PrdStub {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const complexity = typeof r.estimated_complexity === "string" ? r.estimated_complexity.trim().toUpperCase().charAt(0) : "M";
  return {
    problem_statement: text(r.problem_statement, "Not provided."),
    affected_users: strings(r.affected_users),
    acceptance_criteria: strings(r.acceptance_criteria, 12),
    edge_cases: strings(r.edge_cases),
    success_metrics: strings(r.success_metrics),
    implementation_notes: text(r.implementation_notes, "Not provided."),
    estimated_complexity: (["S", "M", "L"].includes(complexity) ? complexity : "M") as Effort,
  };
}
