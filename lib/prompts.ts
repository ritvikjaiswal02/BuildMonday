export const PASS_1_PROMPT = (
  complaints: Array<{ text: string; source: string }>
) => `You are a product analyst. Analyze these customer complaints and for each one extract structured data. Each complaint comes from a known source (appstore, reddit, hn, or manual) — preserve that source verbatim in your output.

Return a JSON array where each item has:
- complaint: original text (strip the leading source tag)
- category: one of [checkout, performance, billing, onboarding, ui, notifications, support, delivery, search, other]
- severity: one of [Low, Medium, High]
- affected_segment: brief description of who is affected
- churn_signal: one of [Low, Medium, High] based on language suggesting switching/cancelling/leaving
- urgency_keywords: array of key phrases that indicate urgency
- source: echo the provided source code exactly — one of [appstore, reddit, hn, manual]

Return ONLY valid JSON array, no markdown, no explanation.

Complaints:
${complaints.map((c, i) => `${i + 1}. [${c.source}] ${c.text}`).join("\n")}`;

export const PASS_2_PROMPT = (tagged: unknown) => `You are a senior product manager. Given these tagged customer complaints, cluster them into themes and create a prioritized list of engineering issues. Each tagged complaint has a "source" field indicating where it came from (appstore / reddit / hn / manual).

For each cluster return:
- title: short issue name
- frequency: number of complaints in this cluster
- severity: High/Medium/Low (based on majority)
- churn_risk: High/Medium/Low (based on churn signals)
- effort: S (1-2 days) / M (1 week) / L (multi-sprint)
- affected_segment: who is most impacted
- evidence: array of 3 best verbatim complaint snippets
- recommended_action: one of [fix_now, investigate, monitor]
- priority_score: number 1-100 (frequency * severity weight + churn weight)
- ranking_reason: ONE sentence explaining why this issue earned its priority, citing specific numbers from this cluster. Examples: "Ranked highest because 8 complaints mention checkout failure, 5 explicitly mention switching to a competitor, and severity is critical across all reports." / "Frequency is low (2 complaints) but churn risk is high — both users mentioned cancelling." Always cite concrete numbers or quoted churn signals; never use generic phrasing like "high priority due to severity".
- source_mix: object counting how many complaints in this cluster came from each source. Include only keys with non-zero counts. Example: {"appstore": 5, "reddit": 2}. The sum across keys must equal frequency.

Sort by priority_score descending. Return ONLY valid JSON array, no markdown, no explanation.

Tagged complaints:
${JSON.stringify(tagged, null, 2)}`;

export const PRD_PROMPT = (args: {
  title: string;
  evidence: string[];
  affected_segment: string;
  severity: string;
}) => `You are a senior product manager writing a PRD stub. Based on this issue, generate a structured PRD.

Issue: ${args.title}
Evidence from users: ${args.evidence.map((e) => `- ${e}`).join("\n")}
Affected users: ${args.affected_segment}
Severity: ${args.severity}

Return ONLY this JSON structure, no markdown, no explanation:
{
  "problem_statement": "clear 2-3 sentence description",
  "affected_users": ["user type 1", "user type 2"],
  "acceptance_criteria": ["criterion 1", "criterion 2", "criterion 3"],
  "edge_cases": ["edge case 1", "edge case 2"],
  "success_metrics": ["metric 1", "metric 2"],
  "implementation_notes": "brief technical considerations",
  "estimated_complexity": "S or M or L"
}`;
