import type { Issue, IssueStatus, PrdStub } from "./types";

const bullets = (arr: string[]) => arr.map((x) => `- ${x}`).join("\n");

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const htmlList = (arr: string[]) =>
  `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;

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

export function buildIssueHtml(
  issue: Issue,
  prd: PrdStub | null,
  status: IssueStatus
): string {
  const priorityLabel = ACTION_LABEL[issue.recommended_action];
  const statusLabel = STATUS_LABEL[status];

  const metaLine = `<p><strong>Priority:</strong> ${escapeHtml(priorityLabel)} | <strong>Severity:</strong> ${escapeHtml(issue.severity)} | <strong>Churn Risk:</strong> ${escapeHtml(issue.churn_risk)} | <strong>Effort:</strong> ${escapeHtml(issue.effort)} | <strong>Status:</strong> ${escapeHtml(statusLabel)}</p>`;

  const affectedLine = `<p><strong>Affected:</strong> ${escapeHtml(issue.affected_segment)}</p>`;
  const frequencyLine = `<p><strong>Frequency:</strong> ${issue.frequency} complaint${issue.frequency === 1 ? "" : "s"}</p>`;

  const rankingBlock = issue.ranking_reason
    ? `<h2>Why this ranks here</h2><p>${escapeHtml(issue.ranking_reason)}</p>`
    : "";

  const evidenceBlock = issue.evidence.slice(0, 3).length
    ? `<h2>Evidence</h2><blockquote>${issue.evidence
        .slice(0, 3)
        .map((e) => `<p>&ldquo;${escapeHtml(e)}&rdquo;</p>`)
        .join("")}</blockquote>`
    : "";

  const prdBlock = prd
    ? `<h2>PRD Stub</h2>
<p><strong>Problem Statement:</strong> ${escapeHtml(prd.problem_statement)}</p>
<h3>Affected Users</h3>
${htmlList(prd.affected_users)}
<h3>Acceptance Criteria</h3>
${htmlList(prd.acceptance_criteria)}
<h3>Edge Cases</h3>
${htmlList(prd.edge_cases)}
<h3>Success Metrics</h3>
${htmlList(prd.success_metrics)}
<p><strong>Implementation Notes:</strong> ${escapeHtml(prd.implementation_notes)}</p>
<p><strong>Estimated Complexity:</strong> ${escapeHtml(prd.estimated_complexity)}</p>`
    : `<h2>PRD Stub</h2><p><em>PRD not yet generated.</em></p>`;

  return `<h1>${escapeHtml(issue.title)}</h1>
${metaLine}
${affectedLine}
${frequencyLine}
${rankingBlock}
${evidenceBlock}
${prdBlock}
<p><em>Generated by BuildMonday from customer complaints.</em></p>`;
}
