import "server-only";

import { Resend } from "resend";
import { env } from "@/lib/env";

let client: { key: string; resend: Resend } | null = null;

function getResend(key: string): Resend {
  if (!client || client.key !== key) {
    client = { key, resend: new Resend(key) };
  }
  return client.resend;
}

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

/** Resend tag names and values allow ASCII letters, numbers, underscores and dashes only. */
function sanitizeTag(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) || "_";
}

/**
 * Sends one email through Resend. Without RESEND_API_KEY it logs and returns
 * `{ id: null, skipped: true }`, so local development never needs email.
 * Throws on a Resend API error.
 */
export async function sendEmail(args: SendEmailArgs): Promise<{ id: string | null; skipped: boolean }> {
  const recipients = (Array.isArray(args.to) ? args.to : [args.to]).map((r) => r.trim()).filter(Boolean);
  if (recipients.length === 0) return { id: null, skipped: true };

  const key = env.RESEND_API_KEY;
  if (!key) {
    console.info(`[mailer] RESEND_API_KEY is not set; skipped "${args.subject}" to ${recipients.length} recipient(s).`);
    return { id: null, skipped: true };
  }

  const { data, error } = await getResend(key).emails.send({
    from: env.EMAIL_FROM,
    to: recipients,
    subject: args.subject,
    html: args.html,
    text: args.text,
    ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    ...(args.tags && args.tags.length > 0
      ? { tags: args.tags.map((t) => ({ name: sanitizeTag(t.name), value: sanitizeTag(t.value) })) }
      : {}),
  });

  if (error) {
    throw new Error(`Resend rejected the email: ${error.message}`);
  }
  return { id: data?.id ?? null, skipped: false };
}

// ---------------------------------------------------------------------------
// Shared email layout. Email clients cannot use CSS variables, so this uses
// the light token hex values from the design system.
// ---------------------------------------------------------------------------

export const EMAIL_COLORS = {
  canvas: "#F6F7F9",
  surface: "#FFFFFF",
  sunken: "#EEF0F3",
  line: "#E2E5EA",
  ink: "#0F1419",
  inkSecondary: "#404854",
  inkMuted: "#69717E",
  brand: "#2340D9",
  onBrand: "#FFFFFF",
  danger: "#C8251B",
  warning: "#B25E09",
  success: "#0B7A4B",
} as const;

export const EMAIL_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A primary button that renders in every major client. */
export function emailButton(label: string, href: string): string {
  const c = EMAIL_COLORS;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background:${c.brand};"><a href="${escapeHtml(
    href,
  )}" style="display:inline-block;padding:11px 18px;font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:600;line-height:20px;color:${c.onBrand};text-decoration:none;border-radius:8px;">${escapeHtml(
    label,
  )}</a></td></tr></table>`;
}

/**
 * Wraps body HTML in the BuildMonday email frame: a plain wordmark, a white
 * panel on the canvas colour and a quiet footer.
 */
export function renderEmailLayout(args: { preheader?: string; bodyHtml: string; footerHtml?: string }): string {
  const c = EMAIL_COLORS;
  const preheader = args.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(args.preheader)}</div>`
    : "";
  const footer =
    args.footerHtml ??
    `You are receiving this because you have a BuildMonday account at ${escapeHtml(env.APP_URL.replace(/^https?:\/\//, ""))}.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>BuildMonday</title>
</head>
<body style="margin:0;padding:0;background:${c.canvas};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.canvas};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font-family:${EMAIL_FONT_STACK};font-size:16px;font-weight:700;letter-spacing:-0.01em;color:${c.ink};">BuildMonday</td></tr>
<tr><td style="background:${c.surface};border:1px solid ${c.line};border-radius:12px;padding:28px 28px 24px;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:24px;color:${c.inkSecondary};">
${args.bodyHtml}
</td></tr>
<tr><td style="padding:16px 4px 0;font-family:${EMAIL_FONT_STACK};font-size:12px;line-height:18px;color:${c.inkMuted};">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The magic-link sign-in email used by the Auth.js Resend provider. */
export function renderMagicLinkEmail(args: { url: string; host: string }): { subject: string; html: string; text: string } {
  const c = EMAIL_COLORS;
  const subject = "Your BuildMonday sign-in link";
  const bodyHtml = `<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;font-weight:700;color:${c.ink};">Sign in to BuildMonday</h1>
<p style="margin:0 0 20px;">Use the button below to sign in. The link works once and expires in 24 hours.</p>
${emailButton("Sign in", args.url)}
<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:${c.inkMuted};">If the button does not work, paste this link into your browser:<br><a href="${escapeHtml(
    args.url,
  )}" style="color:${c.brand};word-break:break-all;">${escapeHtml(args.url)}</a></p>`;
  const html = renderEmailLayout({
    preheader: "Your sign-in link for BuildMonday.",
    bodyHtml,
    footerHtml: `Someone asked to sign in to ${escapeHtml(args.host)} with this address. If it was not you, ignore this email.`,
  });
  const text = `Sign in to BuildMonday

Open this link to sign in. It works once and expires in 24 hours:
${args.url}

Someone asked to sign in to ${args.host} with this address. If it was not you, ignore this email.
`;
  return { subject, html, text };
}
