import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RAZORPAY_PLAN_ENV_NAMES,
  absoluteUrl,
  authProviders,
  env,
  isAuthConfigured,
  isBillingConfigured,
  isDbConfigured,
  isEmailConfigured,
  requireEnv,
} from "@/lib/env";

const KEYS = [
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_EMBEDDING_MODEL",
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "NEXT_PUBLIC_APP_URL",
  "CRON_SECRET",
  "ENCRYPTION_KEY",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  ...RAZORPAY_PLAN_ENV_NAMES,
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("env", () => {
  it("applies defaults when nothing is set", () => {
    expect(env.GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(env.GEMINI_EMBEDDING_MODEL).toBe("gemini-embedding-001");
    expect(env.EMAIL_FROM).toBe("BuildMonday <onboarding@resend.dev>");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("reads lazily and trims", () => {
    process.env.GEMINI_MODEL = "  gemini-x  ";
    expect(env.GEMINI_MODEL).toBe("gemini-x");
    process.env.GEMINI_MODEL = "   ";
    expect(env.GEMINI_MODEL).toBe("gemini-2.5-flash");
  });

  it("strips the trailing slash from the app URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://buildmonday.app/";
    expect(env.APP_URL).toBe("https://buildmonday.app");
    expect(absoluteUrl("/dashboard")).toBe("https://buildmonday.app/dashboard");
    expect(absoluteUrl("issues/1")).toBe("https://buildmonday.app/issues/1");
    expect(absoluteUrl("https://other.example/x")).toBe("https://other.example/x");
  });

  it("requireEnv throws not_configured", () => {
    expect(() => requireEnv("CRON_SECRET")).toThrowError("CRON_SECRET is not set");
    try {
      requireEnv("CRON_SECRET");
    } catch (err) {
      expect(err).toMatchObject({ status: 503, code: "not_configured" });
    }
    process.env.CRON_SECRET = "s";
    expect(requireEnv("CRON_SECRET")).toBe("s");
  });
});

describe("feature detection", () => {
  it("detects the database and email", () => {
    expect(isDbConfigured()).toBe(false);
    expect(isEmailConfigured()).toBe(false);
    process.env.DATABASE_URL = "postgres://x";
    process.env.RESEND_API_KEY = "re_x";
    expect(isDbConfigured()).toBe(true);
    expect(isEmailConfigured()).toBe(true);
  });

  it("lists providers only when fully configured", () => {
    expect(authProviders()).toEqual([]);
    process.env.AUTH_GITHUB_ID = "id";
    expect(authProviders()).toEqual([]);
    process.env.AUTH_GITHUB_SECRET = "secret";
    process.env.AUTH_GOOGLE_ID = "gid";
    process.env.AUTH_GOOGLE_SECRET = "gsecret";
    expect(authProviders()).toEqual(["github", "google"]);
    process.env.RESEND_API_KEY = "re_x";
    expect(authProviders()).toEqual(["github", "google"]);
    process.env.DATABASE_URL = "postgres://x";
    expect(authProviders()).toEqual(["github", "google", "email"]);
  });

  it("needs a database, a secret and a provider for auth", () => {
    process.env.DATABASE_URL = "postgres://x";
    process.env.AUTH_SECRET = "s";
    expect(isAuthConfigured()).toBe(false);
    process.env.RESEND_API_KEY = "re_x";
    expect(isAuthConfigured()).toBe(true);
    delete process.env.AUTH_SECRET;
    expect(isAuthConfigured()).toBe(false);
  });

  it("needs keys, webhook secret and all eight plan ids for billing", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
    expect(isBillingConfigured()).toBe(false);
    for (const name of RAZORPAY_PLAN_ENV_NAMES) process.env[name] = `plan_${name}`;
    expect(isBillingConfigured()).toBe(true);
    delete process.env.RAZORPAY_PLAN_TEAM_YEARLY_USD;
    expect(isBillingConfigured()).toBe(false);
  });
});
