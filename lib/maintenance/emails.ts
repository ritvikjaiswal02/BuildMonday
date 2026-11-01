/** Pure rendering for lifecycle emails (the trial reminder). */
import { EMAIL_COLORS, emailButton, escapeHtml, renderEmailLayout } from "@/lib/auth/mailer";

export function renderTrialEndingEmail(args: {
  workspaceName: string;
  daysLeft: number;
  endsOn: string;
  billingUrl: string;
  issuesFound: number;
  alertsSent: number;
}): { subject: string; html: string; text: string } {
  const c = EMAIL_COLORS;
  const when = args.daysLeft <= 1 ? "tomorrow" : `in ${args.daysLeft} days`;
  const subject = `Your BuildMonday Pro trial ends ${when}`;
  const facts: string[] = [];
  if (args.issuesFound > 0) facts.push(`${args.issuesFound} issue${args.issuesFound === 1 ? "" : "s"} ranked`);
  if (args.alertsSent > 0) facts.push(`${args.alertsSent} alert${args.alertsSent === 1 ? "" : "s"} sent`);
  const recap = facts.length > 0 ? `So far on Pro: ${facts.join(", ")}.` : "";

  const bodyHtml = `<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;font-weight:700;color:${c.ink};">Your Pro trial ends ${escapeHtml(when)}</h1>
<p style="margin:0 0 12px;">${escapeHtml(args.workspaceName)} has been on Pro since you signed up: daily checks, same-day alerts in email and Slack, and issues filed to Linear or GitHub.</p>
${recap ? `<p style="margin:0 0 12px;">${escapeHtml(recap)}</p>` : ""}
<p style="margin:0 0 20px;">On ${escapeHtml(args.endsOn)} the workspace moves to Free: a weekly check and the Monday email. Nothing you collected is deleted. Keep Pro to keep the daily checks and automation.</p>
${emailButton("Keep Pro", args.billingUrl)}`;
  const html = renderEmailLayout({ preheader: `Pro stays on until ${args.endsOn}. Nothing is deleted after that.`, bodyHtml });
  const text = `Your Pro trial ends ${when}

${args.workspaceName} has been on Pro since you signed up: daily checks, same-day alerts in email and Slack, and issues filed to Linear or GitHub.
${recap ? `\n${recap}\n` : ""}
On ${args.endsOn} the workspace moves to Free: a weekly check and the Monday email. Nothing you collected is deleted.

Keep Pro: ${args.billingUrl}
`;
  return { subject, html, text };
}
