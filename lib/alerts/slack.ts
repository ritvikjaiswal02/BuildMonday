import { HttpError } from "@/lib/auth/http";

const SLACK_WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/?$/;

/** https://hooks.slack.com/services/T.../B.../xxxx */
export function isValidSlackWebhook(url: string): boolean {
  return typeof url === "string" && SLACK_WEBHOOK_RE.test(url.trim());
}

/** Escapes the three characters Slack mrkdwn treats as control characters. */
export function slackEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** <url|label> with the label escaped and pipes removed. */
export function slackLink(url: string, label: string): string {
  return `<${url}|${slackEscape(label).replace(/\|/g, "/")}>`;
}

export interface SlackMessage {
  text: string;
  blocks?: unknown[];
}

/**
 * Posts to a Slack incoming webhook. Throws HttpError 502 upstream_failed
 * with Slack's response text when Slack rejects the message.
 */
export async function postSlackMessage(webhookUrl: string, message: SlackMessage): Promise<void> {
  if (!isValidSlackWebhook(webhookUrl)) {
    throw new HttpError(400, "invalid_request", "That is not a Slack incoming webhook URL. It starts with https://hooks.slack.com/services/.");
  }
  let res: Response;
  try {
    res = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, "upstream_failed", "Could not reach Slack. Try again in a moment.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).trim().slice(0, 200);
    } catch {
      // ignore
    }
    const hint =
      detail === "no_service" || detail === "invalid_token" || res.status === 404
        ? "That Slack URL did not accept our message. Check the webhook is still active in Slack."
        : `Slack rejected the message${detail ? `: ${detail}` : ` (${res.status})`}.`;
    throw new HttpError(502, "upstream_failed", hint, { slackStatus: res.status, slackResponse: detail || null });
  }
}
