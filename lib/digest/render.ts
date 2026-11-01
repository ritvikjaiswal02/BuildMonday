/**
 * Pure rendering for the Monday digest (email HTML, plain text and the Slack
 * summary) and the ISO week helper. No database or network access.
 */
import { EMAIL_COLORS, EMAIL_FONT_STACK, emailButton, escapeHtml, renderEmailLayout } from "@/lib/auth/mailer";
import type { FeedbackSourceKind, IssueTrend, IssueWorkflowStatus } from "@/lib/db/schema";
import { slackEscape, slackLink, type SlackMessage } from "@/lib/alerts/slack";

export interface DigestIssue {
  id: string;
  title: string;
  trend: IssueTrend;
  status: IssueWorkflowStatus;
  frequency: number;
  priorityScore: number;
  rank: number | null;
  quote: string | null;
  url: string;
}

export interface DigestData {
  workspaceName: string;
  productName: string;
  weekKey: string;
  /** "Week of 2 Nov" */
  weekLabel: string;
  topIssues: DigestIssue[];
  newIssues: DigestIssue[];
  newCount: number;
  worsened: DigestIssue[];
  worsenedCount: number;
  resolved: DigestIssue[];
  feedbackBySource: Partial<Record<FeedbackSourceKind, number>>;
  feedbackTotal: number;
  /** Seven days, oldest first: { label: "Mon", count }. */
  feedbackByDay: Array<{ label: string; count: number }>;
  listUrl: string;
  settingsUrl: string;
}

export { isoWeekKey, weekLabel } from "./week";

export const SOURCE_KIND_NAMES: Record<FeedbackSourceKind, string> = {
  appstore: "App Store",
  playstore: "Google Play",
  reddit: "Reddit",
  hackernews: "Hacker News",
  trustpilot: "Trustpilot",
  widget: "Website widget",
  extension: "Extension",
  manual: "Added by hand",
  import: "Imported",
};

export function digestSubject(d: Pick<DigestData, "productName" | "newCount" | "worsenedCount">): string {
  return `Your Monday list for ${d.productName}: ${d.newCount} new, ${d.worsenedCount} worse`;
}

const TREND_LABEL: Record<IssueTrend, string> = {
  new: "New",
  worsened: "Getting worse",
  improved: "Improving",
  resolved: "Resolved",
  persistent: "Ongoing",
};

function reports(n: number): string {
  return `${n} ${n === 1 ? "report" : "reports"}`;
}

function trendColor(t: IssueTrend): string {
  const c = EMAIL_COLORS;
  if (t === "worsened") return c.danger;
  if (t === "improved" || t === "resolved") return c.success;
  if (t === "new") return c.brand;
  return c.inkMuted;
}

/** Five-segment priority meter as an email-safe table. */
function meterHtml(score: number): string {
  const c = EMAIL_COLORS;
  const filled = Math.max(0, Math.min(5, Math.ceil(score / 20)));
  const cells = Array.from(
    { length: 5 },
    (_, i) =>
      `<td style="width:10px;height:6px;padding:0 2px 0 0;"><div style="width:10px;height:6px;border-radius:2px;background:${i < filled ? c.brand : c.line};"></div></td>`,
  ).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" aria-label="Priority ${score} of 100"><tr>${cells}</tr></table>`;
}

function weekStripHtml(days: DigestData["feedbackByDay"]): string {
  const c = EMAIL_COLORS;
  const max = Math.max(1, ...days.map((d) => d.count));
  const bars = days
    .map((d) => {
      const h = d.count === 0 ? 2 : Math.max(4, Math.round((d.count / max) * 40));
      return `<td valign="bottom" align="center" style="padding:0 3px;width:14.28%;">
<div style="height:40px;line-height:40px;font-size:0;"><div style="display:inline-block;vertical-align:bottom;width:100%;max-width:36px;height:${h}px;border-radius:3px;background:${d.count === 0 ? c.line : c.brand};"></div></div>
<div style="padding-top:6px;font-family:${EMAIL_FONT_STACK};font-size:11px;line-height:14px;color:${c.inkMuted};">${escapeHtml(d.label)}</div>
<div style="font-family:${EMAIL_FONT_STACK};font-size:12px;line-height:16px;font-weight:600;color:${c.ink};">${d.count}</div>
</td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;"><tr>${bars}</tr></table>`;
}

function rankedRowHtml(issue: DigestIssue, position: number): string {
  const c = EMAIL_COLORS;
  const rankColor = position <= 3 ? c.brand : c.ink;
  const quote = issue.quote
    ? `<p style="margin:6px 0 0;font-size:13px;line-height:20px;color:${c.inkSecondary};">"${escapeHtml(issue.quote)}"</p>`
    : "";
  return `<tr>
<td valign="top" style="width:40px;padding:14px 0;border-top:1px solid ${c.line};font-family:${EMAIL_FONT_STACK};font-size:24px;line-height:28px;font-weight:700;color:${rankColor};">${position}</td>
<td valign="top" style="padding:14px 0;border-top:1px solid ${c.line};font-family:${EMAIL_FONT_STACK};">
<p style="margin:0;font-size:15px;line-height:22px;font-weight:600;"><a href="${escapeHtml(issue.url)}" style="color:${c.ink};text-decoration:none;">${escapeHtml(issue.title)}</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;"><tr>
<td style="padding-right:10px;font-size:12px;line-height:16px;font-weight:600;color:${trendColor(issue.trend)};">${escapeHtml(TREND_LABEL[issue.trend])}</td>
<td style="padding-right:10px;font-size:12px;line-height:16px;color:${c.inkMuted};">${escapeHtml(reports(issue.frequency))}</td>
<td style="padding-right:6px;font-size:12px;line-height:16px;color:${c.inkMuted};">Priority ${issue.priorityScore}</td>
<td>${meterHtml(issue.priorityScore)}</td>
</tr></table>
${quote}
</td></tr>`;
}

function sectionTitle(text: string): string {
  return `<h2 style="margin:28px 0 8px;font-size:16px;line-height:22px;font-weight:700;color:${EMAIL_COLORS.ink};">${escapeHtml(text)}</h2>`;
}

function simpleList(items: DigestIssue[], suffix: (i: DigestIssue) => string): string {
  const c = EMAIL_COLORS;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map(
      (i) => `<tr><td style="padding:8px 0;border-top:1px solid ${c.line};font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:20px;">
<a href="${escapeHtml(i.url)}" style="color:${c.ink};text-decoration:none;font-weight:600;">${escapeHtml(i.title)}</a>
<span style="color:${c.inkMuted};"> ${escapeHtml(suffix(i))}</span></td></tr>`,
    )
    .join("")}</table>`;
}

export function renderDigestEmail(data: DigestData): { subject: string; html: string; text: string } {
  const c = EMAIL_COLORS;
  const subject = digestSubject(data);
  const sources = Object.entries(data.feedbackBySource)
    .filter(([, n]) => (n ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as Array<[FeedbackSourceKind, number]>;

  const parts: string[] = [];
  parts.push(`<p style="margin:0 0 4px;font-size:13px;line-height:20px;color:${c.inkMuted};">${escapeHtml(data.weekLabel)}</p>
<h1 style="margin:0 0 8px;font-size:22px;line-height:30px;font-weight:700;color:${c.ink};">Your Monday list for ${escapeHtml(data.productName)}</h1>
<p style="margin:0 0 4px;">${escapeHtml(
    `${data.newCount} new, ${data.worsenedCount} getting worse, ${data.resolved.length} resolved. ${data.feedbackTotal} pieces of feedback came in this week.`,
  )}</p>`);

  if (data.feedbackByDay.length === 7) parts.push(weekStripHtml(data.feedbackByDay));

  parts.push(sectionTitle("Top issues this week"));
  if (data.topIssues.length > 0) {
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${data.topIssues
        .map((i, k) => rankedRowHtml(i, i.rank ?? k + 1))
        .join("")}</table>`,
    );
  } else {
    parts.push(`<p style="margin:0;color:${c.inkMuted};">No open issues right now.</p>`);
  }

  if (data.newIssues.length > 0) {
    parts.push(sectionTitle("New since last week"));
    parts.push(simpleList(data.newIssues, (i) => `${reports(i.frequency)}, priority ${i.priorityScore}`));
  }
  if (data.worsened.length > 0) {
    parts.push(sectionTitle("Getting worse"));
    parts.push(simpleList(data.worsened, (i) => `${reports(i.frequency)}, priority ${i.priorityScore}`));
  }
  if (data.resolved.length > 0) {
    parts.push(sectionTitle("Resolved"));
    parts.push(
      simpleList(data.resolved, (i) => (i.status === "shipped" ? "shipped by your team, and the complaints stopped" : "no longer reported")),
    );
  }

  parts.push(sectionTitle("Feedback this week"));
  if (sources.length > 0) {
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${sources
        .map(
          ([k, n]) =>
            `<tr><td style="padding:4px 0;font-family:${EMAIL_FONT_STACK};font-size:14px;color:${c.inkSecondary};">${escapeHtml(
              SOURCE_KIND_NAMES[k] ?? k,
            )}</td><td align="right" style="padding:4px 0;font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:600;color:${c.ink};">${n}</td></tr>`,
        )
        .join("")}</table>`,
    );
  } else {
    parts.push(`<p style="margin:0;color:${c.inkMuted};">No new feedback this week.</p>`);
  }

  parts.push(`<div style="height:24px;"></div>${emailButton("Open your list", data.listUrl)}`);

  const html = renderEmailLayout({
    preheader: data.topIssues[0] ? `Top issue: ${data.topIssues[0].title}` : subject,
    bodyHtml: parts.join("\n"),
    footerHtml: `You get the Monday email as a member of ${escapeHtml(data.workspaceName)}. <a href="${escapeHtml(
      data.settingsUrl,
    )}" style="color:${c.inkMuted};">Change email settings</a>.`,
  });

  const lines: string[] = [
    `Your Monday list for ${data.productName}`,
    data.weekLabel,
    "",
    `${data.newCount} new, ${data.worsenedCount} getting worse, ${data.resolved.length} resolved. ${data.feedbackTotal} pieces of feedback came in this week.`,
    "",
    "Top issues this week",
  ];
  if (data.topIssues.length === 0) lines.push("No open issues right now.");
  data.topIssues.forEach((i, k) => {
    lines.push(`${i.rank ?? k + 1}. ${i.title} (${TREND_LABEL[i.trend]}, ${reports(i.frequency)}, priority ${i.priorityScore})`);
    if (i.quote) lines.push(`   "${i.quote}"`);
    lines.push(`   ${i.url}`);
  });
  const textSection = (title: string, list: DigestIssue[], suffix: (i: DigestIssue) => string) => {
    if (list.length === 0) return;
    lines.push("", title);
    for (const i of list) lines.push(`- ${i.title}: ${suffix(i)}`);
  };
  textSection("New since last week", data.newIssues, (i) => reports(i.frequency));
  textSection("Getting worse", data.worsened, (i) => reports(i.frequency));
  textSection("Resolved", data.resolved, (i) => (i.status === "shipped" ? "shipped" : "no longer reported"));
  lines.push("", "Feedback this week");
  if (sources.length === 0) lines.push("No new feedback this week.");
  for (const [k, n] of sources) lines.push(`- ${SOURCE_KIND_NAMES[k] ?? k}: ${n}`);
  lines.push("", `Open your list: ${data.listUrl}`, `Change email settings: ${data.settingsUrl}`, "");

  return { subject, html, text: lines.join("\n") };
}

export function buildSlackDigest(data: DigestData): SlackMessage {
  const top = data.topIssues
    .slice(0, 5)
    .map((i, k) => `${i.rank ?? k + 1}. ${slackLink(i.url, i.title)} (${TREND_LABEL[i.trend]}, ${reports(i.frequency)})`)
    .join("\n");
  const header = `Your Monday list for ${data.productName}: ${data.newCount} new, ${data.worsenedCount} worse`;
  return {
    text: header,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${slackEscape(header)}*\n${data.feedbackTotal} pieces of feedback this week.` } },
      ...(top ? [{ type: "section", text: { type: "mrkdwn", text: top } }] : []),
      {
        type: "actions",
        elements: [{ type: "button", text: { type: "plain_text", text: "Open your list" }, url: data.listUrl }],
      },
    ],
  };
}
