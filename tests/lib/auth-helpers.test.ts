import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {}, getDb: () => ({}) }));

const { EXTENSION_TOKEN_PREFIX, generateInviteToken, generatePublicKey, parseBearerToken } = await import("@/lib/auth/tokens");
const { personalWorkspaceName, workspaceSlug } = await import("@/lib/auth/workspace");
const { __resetMemoryRateLimits, clientIp, rateLimit, rateLimitHeaders, windowStartFor } = await import("@/lib/auth/rate-limit");
const { sha256Hex } = await import("@/lib/auth/crypto");
const { escapeHtml, renderMagicLinkEmail, sendEmail } = await import("@/lib/auth/mailer");

describe("tokens", () => {
  it("generates public keys and invite tokens", () => {
    expect(generatePublicKey()).toMatch(/^pk_[0-9A-Za-z]{24}$/);
    const invite = generateInviteToken();
    expect(invite.token).toMatch(/^[0-9A-Za-z]{32}$/);
    expect(invite.hash).toBe(sha256Hex(invite.token));
  });

  it("parses extension bearer tokens", () => {
    const token = `${EXTENSION_TOKEN_PREFIX}AbCdEfGhIjKlMnOpQrStUvWx`;
    expect(parseBearerToken(`Bearer ${token}`)).toBe(token);
    expect(parseBearerToken(`bearer   ${token}  `)).toBe(token);
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken("Bearer pk_AbCdEfGhIjKlMnOpQrStUvWx")).toBeNull();
    expect(parseBearerToken(`Basic ${token}`)).toBeNull();
    expect(parseBearerToken("Bearer bm_ext_short")).toBeNull();
    expect(parseBearerToken(`Bearer ${token}'--`)).toBeNull();
  });
});

describe("workspace naming", () => {
  it("uses the first name", () => {
    expect(personalWorkspaceName({ name: "Ritvik Jaiswal", email: "r@x.com" })).toBe("Ritvik's workspace");
    expect(personalWorkspaceName({ name: "James", email: null })).toBe("James' workspace");
  });

  it("falls back to the email local part", () => {
    expect(personalWorkspaceName({ name: null, email: "ana.lopez@acme.com" })).toBe("Ana's workspace");
    expect(personalWorkspaceName({ name: "  ", email: "dev+bm@acme.com" })).toBe("Dev's workspace");
    expect(personalWorkspaceName({ name: null, email: null })).toBe("My workspace");
  });

  it("builds URL-safe slugs with a suffix", () => {
    expect(workspaceSlug("Ritvik's workspace")).toMatch(/^ritvik-s-workspace-[0-9a-z]{6}$/);
    expect(workspaceSlug("Café Ünïcode")).toMatch(/^cafe-unicode-[0-9a-z]{6}$/);
    expect(workspaceSlug("!!!")).toMatch(/^workspace-[0-9a-z]{6}$/);
  });
});

describe("rate limiting without a database", () => {
  const saved = process.env.DATABASE_URL;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    __resetMemoryRateLimits();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  it("allows up to the limit per window", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("analyze:1.2.3.4", { limit: 3, windowSec: 60 }));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
  });

  it("keeps keys and window lengths separate", async () => {
    await rateLimit("a", { limit: 1, windowSec: 60 });
    expect((await rateLimit("b", { limit: 1, windowSec: 60 })).ok).toBe(true);
    expect((await rateLimit("a", { limit: 1, windowSec: 3600 })).ok).toBe(true);
    expect((await rateLimit("a", { limit: 1, windowSec: 60 })).ok).toBe(false);
  });

  it("resets on the next window", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-01T10:00:30Z"));
      expect((await rateLimit("k", { limit: 1, windowSec: 60 })).ok).toBe(true);
      expect((await rateLimit("k", { limit: 1, windowSec: 60 })).ok).toBe(false);
      vi.setSystemTime(new Date("2026-11-01T10:01:00Z"));
      expect((await rateLimit("k", { limit: 1, windowSec: 60 })).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aligns windows to fixed boundaries", () => {
    expect(windowStartFor(Date.parse("2026-11-01T10:00:59Z"), 60).toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(windowStartFor(Date.parse("2026-11-01T10:59:59Z"), 3600).toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(windowStartFor(Date.parse("2026-11-01T23:59:59Z"), 86400).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("builds headers", () => {
    const h = rateLimitHeaders({ remaining: 0, resetAt: new Date(Date.now() + 30_500) });
    expect(Number(h["Retry-After"])).toBeGreaterThanOrEqual(30);
    expect(Number(h["Retry-After"])).toBeLessThanOrEqual(31);
    expect(h["X-RateLimit-Remaining"]).toBe("0");
  });
});

describe("clientIp", () => {
  it("prefers the first forwarded address", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } }))).toBe("203.0.113.5");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "198.51.100.7" } }))).toBe("198.51.100.7");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("mailer", () => {
  const saved = process.env.RESEND_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = saved;
  });

  it("skips sending without RESEND_API_KEY", async () => {
    delete process.env.RESEND_API_KEY;
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" })).resolves.toEqual({ id: null, skipped: true });
    expect(info).toHaveBeenCalled();
  });

  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("renders the magic link email with plain text", () => {
    const email = renderMagicLinkEmail({ url: "https://bm.test/api/auth/callback/resend?token=a&b=1", host: "bm.test" });
    expect(email.subject).toBe("Your BuildMonday sign-in link");
    expect(email.html).toContain("https://bm.test/api/auth/callback/resend?token=a&amp;b=1");
    expect(email.text).toContain("https://bm.test/api/auth/callback/resend?token=a&b=1");
    expect(email.html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});
