import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const KEYS = ["DATABASE_URL", "AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "RESEND_API_KEY"];
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

describe("auth without configuration", () => {
  it("imports without touching the database or env", async () => {
    const mod = await import("@/auth");
    expect(typeof mod.auth).toBe("function");
    expect(typeof mod.handlers.GET).toBe("function");
  });

  it("answers the session endpoint as signed out", async () => {
    const route = await import("@/app/api/auth/[...nextauth]/route");
    const res = await route.GET(new NextRequest("http://localhost:3000/api/auth/session"));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("refuses sign-in requests clearly", async () => {
    const route = await import("@/app/api/auth/[...nextauth]/route");
    const res = await route.POST(new NextRequest("http://localhost:3000/api/auth/signin/github", { method: "POST" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "not_configured" });
  });

  it("returns a null session context", async () => {
    const { getSessionContext, requireUser } = await import("@/lib/auth/session");
    await expect(getSessionContext()).resolves.toBeNull();
    await expect(requireUser()).rejects.toMatchObject({ status: 503, code: "not_configured" });
  });

  it("throws not_configured from the lazy db proxy only on use", async () => {
    const { db, getDb } = await import("@/lib/db");
    expect(() => getDb()).toThrowError("Database is not configured");
    expect(() => db.select).toThrowError("Database is not configured");
  });
});

describe("auth hardening", () => {
  it("builds the emailed sign-in link on the configured origin, not the request host", async () => {
    const savedUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.buildmonday.test";
    try {
      const { magicLinkOnAppOrigin } = await import("@/auth");
      expect(
        magicLinkOnAppOrigin("https://attacker.example/api/auth/callback/resend?token=abc&email=a%40b.c"),
      ).toBe("https://app.buildmonday.test/api/auth/callback/resend?token=abc&email=a%40b.c");
    } finally {
      if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = savedUrl;
    }
  });

  it("only links GitHub sign-ins whose email GitHub lists as verified", async () => {
    const { githubEmailVerified } = await import("@/auth");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          { email: "victim@acme.com", verified: false, primary: true },
          { email: "me@acme.com", verified: true, primary: false },
        ]),
        { status: 200 },
      )) as typeof fetch;
    try {
      expect(await githubEmailVerified("gho_x", "victim@acme.com")).toBe(false);
      expect(await githubEmailVerified("gho_x", "ME@acme.com")).toBe(true);
      expect(await githubEmailVerified(undefined, "me@acme.com")).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
