import type { Issue, IssueStatus, PrdStub } from "./types";

/**
 * Markdown and HTML builders for reports, PRDs and the clipboard, plus a tiny
 * Markdown reader for chat answers. Pure and client-safe.
 */

const bullets = (arr: string[]) => arr.map((x) => `- ${x}`).join("\n");

export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const htmlList = (arr: string[]) => `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;

export const ACTION_LABEL: Record<Issue["recommended_action"], string> = {
  fix_now: "Fix now",
  investigate: "Investigate",
  monitor: "Monitor",
};

export const STATUS_LABEL: Record<IssueStatus | "ignored", string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  shipped: "Shipped",
  ignored: "Ignored",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function prdBody(prd: PrdStub): string {
  return `**Problem statement:** ${prd.problem_statement}

**Affected users:**
${bullets(prd.affected_users)}

**Acceptance criteria:**
${bullets(prd.acceptance_criteria)}

**Edge cases:**
${bullets(prd.edge_cases)}

**Success metrics:**
${bullets(prd.success_metrics)}

**Implementation notes:** ${prd.implementation_notes}

**Estimated complexity:** ${prd.estimated_complexity}`;
}

export function prdToMarkdown(issue: Issue, prd: PrdStub): string {
  return `## ${issue.title}: PRD stub

${prdBody(prd)}
`;
}

/** One issue as Markdown: meta line, evidence, ranking reason and the PRD when present. */
export function issueToMarkdown(
  issue: Issue,
  opts: { rank?: number; status?: IssueStatus | "ignored"; prd?: PrdStub | null; link?: string | null } = {},
): string {
  const status = opts.status ?? "backlog";
  const evidence = issue.evidence
    .slice(0, 3)
    .map((e) => `> "${e}"`)
    .join("\n");
  const heading = opts.rank ? `## ${opts.rank}. ${issue.title}` : `## ${issue.title}`;
  const prdBlock = opts.prd ? `\n\n### PRD stub\n\n${prdBody(opts.prd)}` : "";
  const link = opts.link ? `\n\n[Open in BuildMonday](${opts.link})` : "";
  return `${heading}

**Action:** ${ACTION_LABEL[issue.recommended_action]} | **Priority:** ${issue.priority_score} of 100 | **Severity:** ${issue.severity} | **Churn risk:** ${issue.churn_risk} | **Effort:** ${issue.effort} | **Status:** ${STATUS_LABEL[status]}
**Affected:** ${issue.affected_segment || "Not specified"}
**Frequency:** ${plural(issue.frequency, "report")}

### Why it ranks here
${issue.ranking_reason ?? "_Not provided._"}

### Evidence
${evidence || "_No quotes._"}${prdBlock}${link}
`;
}

export function buildFullReportMarkdown(
  issues: Issue[],
  prdData: Record<number, PrdStub>,
  statuses: Record<string, IssueStatus>,
  slugify: (s: string) => string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const totalComplaints = issues.reduce((s, i) => s + (i.frequency || 0), 0);
  const fixNow = issues.filter((i) => i.recommended_action === "fix_now").length;
  const investigate = issues.filter((i) => i.recommended_action === "investigate").length;
  const monitor = issues.filter((i) => i.recommended_action === "monitor").length;

  const header = `# BuildMonday report

Generated ${date}. ${plural(totalComplaints, "complaint")} grouped into ${plural(issues.length, "issue")}.

## Summary
- Fix now: ${plural(fixNow, "issue")}
- Investigate: ${plural(investigate, "issue")}
- Monitor: ${plural(monitor, "issue")}

---
`;

  const sections = issues
    .map((issue, idx) =>
      issueToMarkdown(issue, {
        rank: idx + 1,
        status: statuses[slugify(issue.title)] ?? "backlog",
        prd: prdData[idx] ?? null,
      }),
    )
    .join("\n---\n\n");

  return `${header}\n${sections}`;
}

export function buildIssueHtml(issue: Issue, prd: PrdStub | null, status: IssueStatus | "ignored"): string {
  const metaLine = `<p><strong>Action:</strong> ${escapeHtml(ACTION_LABEL[issue.recommended_action])} | <strong>Severity:</strong> ${escapeHtml(issue.severity)} | <strong>Churn risk:</strong> ${escapeHtml(issue.churn_risk)} | <strong>Effort:</strong> ${escapeHtml(issue.effort)} | <strong>Status:</strong> ${escapeHtml(STATUS_LABEL[status])}</p>`;
  const affectedLine = `<p><strong>Affected:</strong> ${escapeHtml(issue.affected_segment)}</p>`;
  const frequencyLine = `<p><strong>Frequency:</strong> ${escapeHtml(plural(issue.frequency, "report"))}</p>`;
  const rankingBlock = issue.ranking_reason
    ? `<h2>Why it ranks here</h2><p>${escapeHtml(issue.ranking_reason)}</p>`
    : "";
  const quotes = issue.evidence.slice(0, 3);
  const evidenceBlock = quotes.length
    ? `<h2>Evidence</h2><blockquote>${quotes.map((e) => `<p>&ldquo;${escapeHtml(e)}&rdquo;</p>`).join("")}</blockquote>`
    : "";
  const prdBlock = prd
    ? `<h2>PRD stub</h2>
<p><strong>Problem statement:</strong> ${escapeHtml(prd.problem_statement)}</p>
<h3>Affected users</h3>
${htmlList(prd.affected_users)}
<h3>Acceptance criteria</h3>
${htmlList(prd.acceptance_criteria)}
<h3>Edge cases</h3>
${htmlList(prd.edge_cases)}
<h3>Success metrics</h3>
${htmlList(prd.success_metrics)}
<p><strong>Implementation notes:</strong> ${escapeHtml(prd.implementation_notes)}</p>
<p><strong>Estimated complexity:</strong> ${escapeHtml(prd.estimated_complexity)}</p>`
    : "";

  return `<h1>${escapeHtml(issue.title)}</h1>
${metaLine}
${affectedLine}
${frequencyLine}
${rankingBlock}
${evidenceBlock}
${prdBlock}
<p><em>Grouped from customer feedback by BuildMonday.</em></p>`;
}

// ---------------------------------------------------------------------------
// Light Markdown reader for chat answers. Supports paragraphs, "-"/"*" and
// numbered lists, headings (rendered as strong lines), **bold** and `code`.
// Output is plain data; the UI renders it as React elements, so no HTML from
// the model ever reaches the DOM.
// ---------------------------------------------------------------------------

export interface MdSpan {
  text: string;
  bold?: boolean;
  code?: boolean;
}

export type MdBlock =
  | { type: "p"; spans: MdSpan[] }
  | { type: "h"; spans: MdSpan[] }
  | { type: "ul"; items: MdSpan[][] }
  | { type: "ol"; items: MdSpan[][]; start: number };

export function parseInline(text: string): MdSpan[] {
  const spans: MdSpan[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[4] !== undefined) spans.push({ text: m[4], code: true });
    else spans.push({ text: m[2] ?? m[3] ?? "", bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.filter((s) => s.text.length > 0);
}

export function parseLightMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ type: "p", spans: parseInline(para.join(" ")) });
      para = [];
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      flushPara();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(trimmed);
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    const numbered = /^(\d{1,3})[.)]\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      blocks.push({ type: "h", spans: parseInline(heading[1]) });
    } else if (bullet) {
      flushPara();
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "ul") prev.items.push(parseInline(bullet[1]));
      else blocks.push({ type: "ul", items: [parseInline(bullet[1])] });
    } else if (numbered) {
      flushPara();
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "ol") prev.items.push(parseInline(numbered[2]));
      else blocks.push({ type: "ol", items: [parseInline(numbered[2])], start: Number(numbered[1]) || 1 });
    } else {
      para.push(trimmed);
    }
  }
  flushPara();
  return blocks;
}
