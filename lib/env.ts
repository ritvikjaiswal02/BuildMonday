/**
 * The single place that reads server environment variables.
 *
 * Every value is read lazily through a getter so that `next build` works with
 * no environment at all, and so tests can change `process.env` between cases.
 * Missing optional variables disable a feature; they never throw at import.
 */
import { HttpError } from "@/lib/auth/http";

const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_EMAIL_FROM = "BuildMonday <onboarding@resend.dev>";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

/** Returns the trimmed value, or undefined for missing or blank strings. */
function read(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export const env = {
  get GEMINI_API_KEY() {
    return read("GEMINI_API_KEY");
  },
  get GEMINI_MODEL() {
    return read("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;
  },
  get GEMINI_EMBEDDING_MODEL() {
    return read("GEMINI_EMBEDDING_MODEL") ?? DEFAULT_GEMINI_EMBEDDING_MODEL;
  },
  get DATABASE_URL() {
    return read("DATABASE_URL");
  },
  get AUTH_SECRET() {
    return read("AUTH_SECRET");
  },
  get AUTH_GITHUB_ID() {
    return read("AUTH_GITHUB_ID");
  },
  get AUTH_GITHUB_SECRET() {
    return read("AUTH_GITHUB_SECRET");
  },
  get AUTH_GOOGLE_ID() {
    return read("AUTH_GOOGLE_ID");
  },
  get AUTH_GOOGLE_SECRET() {
    return read("AUTH_GOOGLE_SECRET");
  },
  get RESEND_API_KEY() {
    return read("RESEND_API_KEY");
  },
  get EMAIL_FROM() {
    return read("EMAIL_FROM") ?? DEFAULT_EMAIL_FROM;
  },
  /** NEXT_PUBLIC_APP_URL without a trailing slash. */
  get APP_URL() {
    return stripTrailingSlash(read("NEXT_PUBLIC_APP_URL") ?? DEFAULT_APP_URL);
  },
  get CRON_SECRET() {
    return read("CRON_SECRET");
  },
  /** "weekly" (default, one Monday 03:30 UTC send) or "local" (hourly ticks, 9:00 in each workspace's zone). */
  get DIGEST_SCHEDULE() {
    return read("DIGEST_SCHEDULE");
  },
  get ENCRYPTION_KEY() {
    return read("ENCRYPTION_KEY");
  },
  // One-click integrations. Each is optional; the paste flows work without them.
  get SLACK_CLIENT_ID() {
    return read("SLACK_CLIENT_ID");
  },
  get SLACK_CLIENT_SECRET() {
    return read("SLACK_CLIENT_SECRET");
  },
  get LINEAR_CLIENT_ID() {
    return read("LINEAR_CLIENT_ID");
  },
  get LINEAR_CLIENT_SECRET() {
    return read("LINEAR_CLIENT_SECRET");
  },
  get GITHUB_APP_ID() {
    return read("GITHUB_APP_ID");
  },
  get GITHUB_APP_SLUG() {
    return read("GITHUB_APP_SLUG");
  },
  get GITHUB_APP_CLIENT_ID() {
    return read("GITHUB_APP_CLIENT_ID");
  },
  get GITHUB_APP_CLIENT_SECRET() {
    return read("GITHUB_APP_CLIENT_SECRET");
  },
  get GITHUB_APP_PRIVATE_KEY() {
    return read("GITHUB_APP_PRIVATE_KEY");
  },
  /** Chrome extension id, fixed by the `key` in the packaged manifest; enables "Connect this browser". */
  get NEXT_PUBLIC_EXTENSION_ID() {
    return read("NEXT_PUBLIC_EXTENSION_ID");
  },
  /** Base64 public key written into the downloaded manifest as `key`, which fixes the extension id. */
  get EXTENSION_PUBLIC_KEY() {
    return read("EXTENSION_PUBLIC_KEY");
  },
  get RAZORPAY_KEY_ID() {
    return read("RAZORPAY_KEY_ID");
  },
  get RAZORPAY_KEY_SECRET() {
    return read("RAZORPAY_KEY_SECRET");
  },
  get RAZORPAY_WEBHOOK_SECRET() {
    return read("RAZORPAY_WEBHOOK_SECRET");
  },
} as const;

export type EnvName = keyof typeof env;

/** Throws a 503 `not_configured` error when the variable is missing. */
export function requireEnv(name: EnvName): string {
  const value = env[name];
  if (!value) {
    throw new HttpError(503, "not_configured", `${name} is not set`);
  }
  return value;
}

export function isDbConfigured(): boolean {
  return Boolean(env.DATABASE_URL);
}

/**
 * Sign-in providers that are usable on this deployment.
 * The email magic link needs both Resend and the database (Auth.js stores
 * verification tokens through the adapter).
 */
export function authProviders(): Array<"github" | "google" | "email"> {
  const providers: Array<"github" | "google" | "email"> = [];
  if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET) providers.push("github");
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) providers.push("google");
  if (env.RESEND_API_KEY && env.DATABASE_URL) providers.push("email");
  return providers;
}

export function isAuthConfigured(): boolean {
  return Boolean(env.DATABASE_URL && env.AUTH_SECRET && authProviders().length > 0);
}

export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

export type RazorpayPlanEnvName =
  | "RAZORPAY_PLAN_PRO_MONTHLY_INR"
  | "RAZORPAY_PLAN_PRO_YEARLY_INR"
  | "RAZORPAY_PLAN_TEAM_MONTHLY_INR"
  | "RAZORPAY_PLAN_TEAM_YEARLY_INR"
  | "RAZORPAY_PLAN_PRO_MONTHLY_USD"
  | "RAZORPAY_PLAN_PRO_YEARLY_USD"
  | "RAZORPAY_PLAN_TEAM_MONTHLY_USD"
  | "RAZORPAY_PLAN_TEAM_YEARLY_USD";

export const RAZORPAY_PLAN_ENV_NAMES: readonly RazorpayPlanEnvName[] = [
  "RAZORPAY_PLAN_PRO_MONTHLY_INR",
  "RAZORPAY_PLAN_PRO_YEARLY_INR",
  "RAZORPAY_PLAN_TEAM_MONTHLY_INR",
  "RAZORPAY_PLAN_TEAM_YEARLY_INR",
  "RAZORPAY_PLAN_PRO_MONTHLY_USD",
  "RAZORPAY_PLAN_PRO_YEARLY_USD",
  "RAZORPAY_PLAN_TEAM_MONTHLY_USD",
  "RAZORPAY_PLAN_TEAM_YEARLY_USD",
];

/** Reads one of the eight Razorpay plan id variables. */
export function razorpayPlanEnv(name: RazorpayPlanEnvName): string | undefined {
  return read(name);
}

export function isBillingConfigured(): boolean {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) return false;
  return RAZORPAY_PLAN_ENV_NAMES.every((name) => Boolean(read(name)));
}

/** `env.APP_URL + path`, tolerating a missing leading slash. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${env.APP_URL}${normalized}`;
}
