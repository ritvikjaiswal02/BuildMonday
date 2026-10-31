/** Pure request schemas and helpers for the integration routes. */
import { z } from "zod";
import type { IntegrationKind } from "@/lib/db/schema";

export const INTEGRATION_NAMES: Record<IntegrationKind, string> = {
  slack: "Slack",
  linear: "Linear",
  github: "GitHub",
};

/** "#product-feedback" -> "product-feedback"; null when empty. */
export function normalizeChannelName(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase();
  return v ? v.slice(0, 80) : null;
}

/** Strict shape check for Slack incoming webhooks; lib/alerts `isValidSlackWebhook` is the server's final word. */
export function looksLikeSlackWebhook(url: string): boolean {
  return /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+\/?$/.test(url.trim());
}

export const slackSchema = z
  .object({
    webhookUrl: z.string().trim().min(1, "Paste the webhook URL from Slack.").max(500),
    channelName: z
      .string()
      .max(120)
      .nullish()
      .transform((v) => normalizeChannelName(v)),
  })
  .strict();

export const linearTeamsSchema = z.object({ apiKey: z.string().trim().min(10, "Paste a Linear API key.").max(200) }).strict();

export const linearSchema = z
  .object({
    apiKey: z.string().trim().min(10, "Paste a Linear API key.").max(200),
    teamId: z.string().trim().min(1, "Choose a team.").max(100),
    labelName: z
      .string()
      .max(80)
      .nullish()
      .transform((v) => {
        const t = (v ?? "").trim();
        return t ? t.slice(0, 50) : null;
      }),
  })
  .strict();

/** "bug, from-users ,bug" -> ["bug", "from-users"]. */
export function normalizeLabels(input: string[] | string | null | undefined): string[] {
  const list = Array.isArray(input) ? input : (input ?? "").split(",");
  const out: string[] = [];
  for (const raw of list) {
    const label = raw.trim().slice(0, 50);
    if (!label || out.some((l) => l.toLowerCase() === label.toLowerCase())) continue;
    out.push(label);
    if (out.length >= 5) break;
  }
  return out;
}

export const githubSchema = z
  .object({
    token: z.string().trim().min(10, "Paste a GitHub token.").max(300),
    repo: z.string().trim().min(3, "Enter the repository as owner/name.").max(300),
    labels: z
      .array(z.string().max(100))
      .max(10)
      .optional()
      .transform((v) => normalizeLabels(v ?? [])),
  })
  .strict();

/** Owner/name from "owner/name", "github.com/owner/name(.git)" or a full URL. */
export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const v = input.trim();
  const url = /github\.com[/:]([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/?#]|$)/i.exec(v);
  if (url) return { owner: url[1], repo: url[2] };
  const slash = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(v);
  if (slash) return { owner: slash[1], repo: slash[2] };
  return null;
}

export const linearUpdateSchema = z
  .object({
    teamId: z.string().trim().min(1, "Choose a team.").max(100),
    labelName: z
      .string()
      .max(80)
      .nullish()
      .transform((v) => {
        if (v === undefined) return undefined;
        const t = (v ?? "").trim();
        return t ? t.slice(0, 50) : null;
      }),
  })
  .strict();

export const githubUpdateSchema = z
  .object({
    repo: z.string().trim().min(3).max(300).optional(),
    labels: z
      .array(z.string().max(100))
      .max(10)
      .optional()
      .transform((v) => (v === undefined ? undefined : normalizeLabels(v))),
  })
  .strict();
