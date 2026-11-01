/**
 * Pure alert logic: which issues alert, and how the email and Slack message
 * read. No database or network access.
 */
import { EMAIL_COLORS, EMAIL_FONT_STACK, emailButton, escapeHtml, renderEmailLayout } from "@/lib/auth/mailer";
import type { RecommendedAction, TrackerTarget } from "@/lib/db/schema";
import { slackEscape, slackLink, type SlackMessage } from "./slack";

export interface AlertCandidate {
  id: string;
  title: string;
  kind: "new_issue" | "worsened";
  priorityScore: number;
  recommendedAction: RecommendedAction;
  frequency: number;
  /** Frequency in the previous run, for worsened issues. */
  previousFrequency?: number | null;
  quote: string | null;
  url: string;
}

export interface AlertSelection {
  /** Threshold-crossing issues: for "serious" members and Slack. */
  serious: AlertCandidate[];
  /** Every new or worsened issue that is not suppressed: for "all" members. */
  all: AlertCandidate[];
}

/**
 * Applies the alert rules:
 * - new_issue alerts when priority >= threshold or the action is fix_now; never twice for one issue.
 * - worsened alerts when priority >= threshold; suppressed if one was sent in the last 72 hours.
 * - "all" includes every new or worsened issue that is not suppressed.
 */
export function selectAlertIssues(args: {
  candidates: AlertCandidate[];
  threshold: number;
  alreadyAlertedNew: Set<string>;
  recentlyAlertedWorsened: Set<string>;
}): AlertSelection {
  const all = args.candidates.filter((c) =>
    c.kind === "new_issue" ? !args.alreadyAlertedNew.has(c.id) : !args.recentlyAlertedWorsened.has(c.id),
  );
  const serious = all.filter((c) =>
    c.kind === "new_issue"
      ? c.priorityScore >= args.threshold || c.recommendedAction === "fix_now"
      : c.priorityScore >= args.threshold,
  );
  const order = (a: AlertCandidate, b: AlertCandidate) => b.priorityScore - a.priorityScore || b.frequency - a.frequency;
  return { serious: [...serious].sort(order), all: [...all].sort(order) };
}

function kindLabel(c: AlertCandidate): string {
  return c.kind === "new_issue" ? "New" : "Getting worse";
}

function reportsLabel(n: number): string {
  return `${n} ${n === 1 ? "report" : "reports"}`;
}

function changeText(c: AlertCandidate): string {
  if (c.kind === "worsened" && c.previousFrequency != null) {
    return `${reportsLabel(c.frequency)} (was ${c.previousFrequency})`;
  }
  return reportsLabel(c.frequency);
}

export function alertSubject(productName: string, issues: AlertCandidate[]): string {
  if (issues.length === 1) {
    const only = issues[0];
    return only.kind === "new_issue"
      ? `New issue in ${productName}: ${only.title}`
      : `Getting worse in ${productName}: ${only.title}`;
  }
  return `${issues.length} issues need attention in ${productName}`;
}

export function renderAlertEmail(args: {
  productName: string;
  issues: AlertCandidate[];
  dashboardUrl: string;
  settingsUrl: string;
}): { subject: string; html: string; text: string } {
  const c = EMAIL_COLORS;
  const subject = alertSubject(args.productName, args.issues);
  const intro =
    args.issues.length === 1
      ? `BuildMonday found an issue in ${args.productName} that needs a look.`
      : `BuildMonday found ${args.issues.length} issues in ${args.productName} that need a look.`;

  const rows = args.issues
    .map((i) => {
      const tone = i.kind === "new_issue" ? c.brand : c.danger;
      const quote = i.quote
        ? `<p style="margin:8px 0 0;padding-left:10px;border-left:2px solid ${c.line};font-size:14px;line-height:21px;color:${c.inkSecondary};">"${escapeHtml(i.quote)}"</p>`
        : "";
      return `<tr><td style="padding:14px 0;border-top:1px solid ${c.line};font-family:${EMAIL_FONT_STACK};">
<p style="margin:0 0 4px;font-size:12px;line-height:16px;font-weight:600;color:${tone};">${escapeHtml(kindLabel(i))}</p>
<p style="margin:0;font-size:16px;line-height:22px;font-weight:600;"><a href="${escapeHtml(i.url)}" style="color:${c.ink};text-decoration:none;">${escapeHtml(i.title)}</a></p>
<p style="margin:4px 0 0;font-size:13px;line-height:20px;color:${c.inkMuted};">${escapeHtml(changeText(i))}, priority ${i.priorityScore} of 100</p>
${quote}
</td></tr>`;
    })
    .join("");

  const bodyHtml = `<h1 style="margin:0 0 8px;font-size:20px;line-height:28px;font-weight:700;color:${c.ink};">${escapeHtml(subject)}</h1>
<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
<div style="height:20px;"></div>
${emailButton("Open your list", args.dashboardUrl)}`;

  const html = renderEmailLayout({
    preheader: args.issues.map((i) => i.title).slice(0, 3).join("; "),
    bodyHtml,
    footerHtml: `You get these alerts because of your alert settings in BuildMonday. <a href="${escapeHtml(
      args.settingsUrl,
    )}" style="color:${c.inkMuted};">Change alert settings</a>.`,
  });

  const text = [
    subject,
    "",
    intro,
    "",
    ...args.issues.flatMap((i) => [
      `${kindLabel(i)}: ${i.title}`,
      `${changeText(i)}, priority ${i.priorityScore} of 100`,
      ...(i.quote ? [`"${i.quote}"`] : []),
      i.url,
      "",
    ]),
    `Open your list: ${args.dashboardUrl}`,
    `Change alert settings: ${args.settingsUrl}`,
    "",
  ].join("\n");

  return { subject, html, text };
}

const SLACK_MAX_ISSUES = 5;

export function buildSlackAlert(args: { productName: string; issues: AlertCandidate[]; dashboardUrl: string }): SlackMessage {
  const shown = args.issues.slice(0, SLACK_MAX_ISSUES);
  const header =
    args.issues.length === 1
      ? `${args.issues[0].kind === "new_issue" ? "New issue" : "Getting worse"} in ${args.productName}`
      : `${args.issues.length} issues need attention in ${args.productName}`;

  const issueBlocks = shown.map((i) => {
    const quote = i.quote ? `\n>${slackEscape(i.quote.slice(0, 280))}` : "";
    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${slackLink(i.url, i.title)}*\n${kindLabel(i)}, ${changeText(i)}, priority ${i.priorityScore}${quote}`,
      },
    };
  });

  const more =
    args.issues.length > shown.length
      ? [{ type: "context", elements: [{ type: "mrkdwn", text: `${args.issues.length - shown.length} more in BuildMonday` }] }]
      : [];

  return {
    text: `${header}: ${shown.map((i) => i.title).join("; ")}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${slackEscape(header)}*` } },
      ...issueBlocks,
      ...more,
      {
        type: "actions",
        elements: [{ type: "button", text: { type: "plain_text", text: "View in BuildMonday" }, url: args.dashboardUrl }],
      },
    ],
  };
}

export function buildSlackAutofiled(args: {
  productName: string;
  filed: Array<{ title: string; issueUrl: string; externalUrl: string; target: TrackerTarget }>;
}): SlackMessage {
  const target = (t: TrackerTarget) => (t === "linear" ? "Linear" : "GitHub");
  const lines = args.filed
    .slice(0, 10)
    .map((f) => `${slackLink(f.issueUrl, f.title)}: filed to ${slackLink(f.externalUrl, target(f.target))}`);
  const header =
    args.filed.length === 1
      ? `BuildMonday filed an issue for ${args.productName}`
      : `BuildMonday filed ${args.filed.length} issues for ${args.productName}`;
  return {
    text: `${header}.`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${slackEscape(header)}*` } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
    ],
  };
}
