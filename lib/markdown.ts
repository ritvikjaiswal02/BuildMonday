import type { Issue, IssueStatus, PrdStub } from "./types";

const bullets = (arr: string[]) => arr.map((x) => `- ${x}`).join("\n");

export function prdToMarkdown(issue: Issue, prd: PrdStub): string {
  return `## ${issue.title} — PRD Stub
**Problem Statement:** ${prd.problem_statement}

**Affected Users:**
${bullets(prd.affected_users)}

**Acceptance Criteria:**
${bullets(prd.acceptance_criteria)}

**Edge Cases:**
${bullets(prd.edge_cases)}

**Success Metrics:**
${bullets(prd.success_metrics)}

**Implementation Notes:** ${prd.implementation_notes}

**Estimated Complexity:** ${prd.estimated_complexity}
`;
}

const ACTION_LABEL: Record<Issue["recommended_action"], string> = {
  fix_now: "Fix Now",
  investigate: "Investigate",
  monitor: "Monitor",
};

const STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  shipped: "Shipped",
};

export function buildFullReportMarkdown(
  issues: Issue[],
  prdData: Record<number, PrdStub>,
  statuses: Record<string, IssueStatus>,
  slugify: (s: string) => string
): string {
  const date = new Date().toISOString().slice(0, 10);
  const totalComplaints = issues.reduce((s, i) => s + (i.frequency || 0), 0);
  const fixNow = issues.filter((i) => i.recommended_action === "fix_now").length;
  const investigate = issues.filter((i) => i.recommended_action === "investigate").length;
  const monitor = issues.filter((i) => i.recommended_action === "monitor").length;

  const header = `# BuildMonday Report
*Generated: ${date}*
*${totalComplaints} complaints analyzed · ${issues.length} issues found*

---

## Summary
- Fix Now: ${fixNow} issue${fixNow === 1 ? "" : "s"}
- Investigate: ${investigate} issue${investigate === 1 ? "" : "s"}
- Monitor: ${monitor} issue${monitor === 1 ? "" : "s"}

---
`;

  const issueSections = issues
    .map((issue, idx) => {
      const status = statuses[slugify(issue.title)] ?? "backlog";
      const prd = prdData[idx];
      const evidence = issue.evidence.slice(0, 3).map((e) => `> "${e}"`).join("\n");
      const prdBlock = prd
        ? `### PRD Stub
**Problem Statement:** ${prd.problem_statement}

**Affected Users:**
${bullets(prd.affected_users)}

**Acceptance Criteria:**
${bullets(prd.acceptance_criteria)}

**Edge Cases:**
${bullets(prd.edge_cases)}

**Success Metrics:**
${bullets(prd.success_metrics)}

**Implementation Notes:** ${prd.implementation_notes}

**Estimated Complexity:** ${prd.estimated_complexity}`
        : `### PRD Stub
*PRD not yet generated.*`;

      return `## Issue #${idx + 1}: ${issue.title}
**Priority:** ${ACTION_LABEL[issue.recommended_action]} | **Severity:** ${issue.severity} | **Churn Risk:** ${issue.churn_risk} | **Effort:** ${issue.effort} | **Status:** ${STATUS_LABEL[status]}
**Affected Users:** ${issue.affected_segment}
**Frequency:** ${issue.frequency} complaint${issue.frequency === 1 ? "" : "s"}

### Evidence
${evidence}

### Why This Rank
${issue.ranking_reason ?? "_Not provided._"}

${prdBlock}
`;
    })
    .join("\n---\n\n");

  return `${header}\n${issueSections}`;
}
