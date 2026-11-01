import "server-only";

import { createSign } from "node:crypto";
import { absoluteUrl, env } from "@/lib/env";

/**
 * One-click connections for the integrations people pay for:
 *
 * - Slack: "Add to Slack" with the `incoming-webhook` scope. Slack asks the
 *   user to pick a channel and returns a webhook URL for it.
 * - Linear: OAuth with `actor=application`, so issues are created by the
 *   BuildMonday app rather than by whoever connected it.
 * - GitHub: a GitHub App installed on the repositories the user chooses. The
 *   app mints short-lived installation tokens; nothing long-lived is stored.
 *
 * Each provider is offered only when its variables are set. The paste flows
 * (webhook URL, personal API key, fine-grained token) stay as the fallback.
 */

export type OAuthAvailability = { slack: boolean; linear: boolean; github: boolean };

export function oauthAvailability(): OAuthAvailability {
  return {
    slack: Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET),
    linear: Boolean(env.LINEAR_CLIENT_ID && env.LINEAR_CLIENT_SECRET),
    github: Boolean(
      env.GITHUB_APP_ID &&
        env.GITHUB_APP_SLUG &&
        env.GITHUB_APP_CLIENT_ID &&
        env.GITHUB_APP_CLIENT_SECRET &&
        env.GITHUB_APP_PRIVATE_KEY,
    ),
  };
}

const TIMEOUT_MS = 15_000;

function signal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS);
}

export function callbackUrl(provider: "slack" | "linear" | "github"): string {
  return absoluteUrl(`/api/integrations/${provider}/oauth/callback`);
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

export function slackAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID ?? "",
    scope: "incoming-webhook",
    redirect_uri: callbackUrl("slack"),
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeSlackCode(code: string): Promise<{ webhookUrl: string; channelName: string | null; teamName: string | null }> {
  let res: Response;
  try {
    res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID ?? "",
        client_secret: env.SLACK_CLIENT_SECRET ?? "",
        code,
        redirect_uri: callbackUrl("slack"),
      }),
      signal: signal(),
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not reach Slack. Try again in a moment.");
  }
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    incoming_webhook?: { url?: string; channel?: string };
    team?: { name?: string };
  } | null;
  if (!body?.ok || !body.incoming_webhook?.url) {
    throw new Error(
      body?.error === "access_denied"
        ? "Slack was not connected because the request was cancelled."
        : "Slack did not finish connecting. Try again, or paste a webhook URL instead.",
    );
  }
  return {
    webhookUrl: body.incoming_webhook.url,
    channelName: body.incoming_webhook.channel?.replace(/^#/, "") || null,
    teamName: body.team?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Linear
// ---------------------------------------------------------------------------

export function linearAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.LINEAR_CLIENT_ID ?? "",
    redirect_uri: callbackUrl("linear"),
    response_type: "code",
    scope: "read,issues:create",
    actor: "application",
    prompt: "consent",
    state,
  });
  return `https://linear.app/oauth/authorize?${params.toString()}`;
}

/** What is stored, encrypted, as the secret of an OAuth Linear integration. */
export interface LinearOAuthToken {
  access: string;
  refresh: string | null;
  /** Unix ms when the access token expires; null when it does not. */
  expiresAt: number | null;
}

async function linearTokenRequest(params: Record<string, string>): Promise<LinearOAuthToken> {
  let res: Response;
  try {
    res = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.LINEAR_CLIENT_ID ?? "",
        client_secret: env.LINEAR_CLIENT_SECRET ?? "",
        ...params,
      }),
      signal: signal(),
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not reach Linear. Try again in a moment.");
  }
  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  } | null;
  if (!res.ok || !body?.access_token) {
    throw new Error("Linear did not finish connecting. Connect Linear again.");
  }
  return {
    access: body.access_token,
    refresh: body.refresh_token ?? null,
    expiresAt: typeof body.expires_in === "number" ? Date.now() + body.expires_in * 1000 : null,
  };
}

export function exchangeLinearCode(code: string): Promise<LinearOAuthToken> {
  return linearTokenRequest({ code, redirect_uri: callbackUrl("linear"), grant_type: "authorization_code" });
}

export function refreshLinearToken(refreshToken: string): Promise<LinearOAuthToken> {
  return linearTokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

export function serializeLinearToken(token: LinearOAuthToken): string {
  return JSON.stringify(token);
}

export function parseLinearToken(secret: string): LinearOAuthToken | null {
  try {
    const parsed = JSON.parse(secret) as Partial<LinearOAuthToken>;
    if (typeof parsed.access !== "string" || !parsed.access) return null;
    return {
      access: parsed.access,
      refresh: typeof parsed.refresh === "string" ? parsed.refresh : null,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GitHub App
// ---------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";

export function githubInstallUrl(state: string): string {
  const params = new URLSearchParams({ state });
  return `https://github.com/apps/${encodeURIComponent(env.GITHUB_APP_SLUG ?? "")}/installations/new?${params.toString()}`;
}

function privateKey(): string {
  // Vercel and .env files often store the PEM with literal "\n".
  return (env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}

/** RS256 JWT that authenticates as the GitHub App itself (valid for 9 minutes). */
export function githubAppJwt(now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000) - 60;
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat, exp: iat + 540, iss: env.GITHUB_APP_ID ?? "" })).toString(
    "base64url",
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer.sign(privateKey()).toString("base64url");
  return `${header}.${payload}.${sig}`;
}

async function githubJson<T>(path: string, init: { token: string; method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${init.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: signal(),
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not reach GitHub. Try again in a moment.");
  }
  if (!res.ok) {
    if (res.status === 404) throw new Error("The BuildMonday GitHub App is no longer installed there. Install it again.");
    throw new Error(`GitHub returned ${res.status}. Try connecting GitHub again.`);
  }
  return (await res.json()) as T;
}

/** A one-hour token for an installation of the app. */
export async function githubInstallationToken(installationId: number): Promise<string> {
  const data = await githubJson<{ token: string }>(`/app/installations/${installationId}/access_tokens`, {
    token: githubAppJwt(),
    method: "POST",
  });
  return data.token;
}

/** Repositories the installation can reach, with issues turned on, sorted by name. */
export async function githubInstallationRepos(
  installationId: number,
): Promise<Array<{ owner: string; repo: string; fullName: string; private: boolean }>> {
  const token = await githubInstallationToken(installationId);
  const data = await githubJson<{
    repositories: Array<{ name: string; full_name: string; private: boolean; has_issues?: boolean; owner: { login: string } }>;
  }>("/installation/repositories?per_page=100", { token });
  return data.repositories
    .filter((r) => r.has_issues !== false)
    .map((r) => ({ owner: r.owner.login, repo: r.name, fullName: r.full_name, private: r.private }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * Exchanges the user authorization code GitHub sends with the installation
 * redirect, and confirms that this user can access `installationId`. Without
 * this check, anyone could finish the flow with someone else's installation id.
 */
export async function verifyGitHubInstallationForUser(code: string, installationId: number): Promise<void> {
  let res: Response;
  try {
    res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_APP_CLIENT_ID,
        client_secret: env.GITHUB_APP_CLIENT_SECRET,
        code,
      }),
      signal: signal(),
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not reach GitHub. Try again in a moment.");
  }
  const body = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!body?.access_token) throw new Error("GitHub did not confirm who installed the app. Install it again.");
  const installs = await githubJson<{ installations: Array<{ id: number }> }>("/user/installations?per_page=100", {
    token: body.access_token,
  });
  if (!installs.installations.some((i) => i.id === installationId)) {
    throw new Error("That GitHub App installation does not belong to your GitHub account.");
  }
}
