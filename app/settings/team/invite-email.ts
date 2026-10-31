import { EMAIL_COLORS, emailButton, escapeHtml, renderEmailLayout } from "@/lib/auth/mailer";

/** Subject: "<inviter> invited you to <workspace> on BuildMonday". */
export function renderInviteEmail(args: {
  inviterName: string;
  workspaceName: string;
  url: string;
  role: "admin" | "member";
  expiresInDays: number;
}): { subject: string; html: string; text: string } {
  const c = EMAIL_COLORS;
  const subject = `${args.inviterName} invited you to ${args.workspaceName} on BuildMonday`;
  const roleLine =
    args.role === "admin"
      ? "You will be an admin: you can change sources, alerts and integrations."
      : "You will see the ranked issue list, the inbox and every run.";
  const bodyHtml = `<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;font-weight:700;color:${c.ink};">Join ${escapeHtml(
    args.workspaceName,
  )} on BuildMonday</h1>
<p style="margin:0 0 12px;">${escapeHtml(args.inviterName)} invited you to the team's BuildMonday workspace. BuildMonday reads your product's reviews and feedback and keeps a ranked list of what to fix next.</p>
<p style="margin:0 0 20px;">${escapeHtml(roleLine)}</p>
${emailButton("Join workspace", args.url)}
<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:${c.inkMuted};">The invite works for ${args.expiresInDays} days. If the button does not work, paste this link into your browser:<br><a href="${escapeHtml(
    args.url,
  )}" style="color:${c.brand};word-break:break-all;">${escapeHtml(args.url)}</a></p>`;
  const html = renderEmailLayout({
    preheader: `${args.inviterName} invited you to ${args.workspaceName}.`,
    bodyHtml,
    footerHtml: "You received this because someone invited this address to a BuildMonday workspace. If you were not expecting it, ignore this email.",
  });
  const text = `${subject}

${args.inviterName} invited you to the team's BuildMonday workspace.
${roleLine}

Join here (the link works for ${args.expiresInDays} days):
${args.url}

If you were not expecting this, ignore this email.
`;
  return { subject, html, text };
}
