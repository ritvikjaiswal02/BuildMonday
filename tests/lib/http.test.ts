import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpError, corsHeaders, errorResponse, handleRouteError, json, parseJson, withRoute } from "@/lib/auth/http";

function jsonRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("json and errorResponse", () => {
  it("serialises data with a status", async () => {
    const res = json({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("uses the standard error body", async () => {
    const res = errorResponse(402, "limit_reached", "Your plan includes 1 product.", { limit: "products", max: 1 });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "Your plan includes 1 product.", code: "limit_reached", limit: "products", max: 1 });
  });

  it("never lets extra fields override error or code", async () => {
    const res = errorResponse(400, "invalid_request", "Real message", { error: "spoofed", code: "internal" });
    expect(await res.json()).toEqual({ error: "Real message", code: "invalid_request" });
  });
});

describe("handleRouteError", () => {
  it("maps HttpError", async () => {
    const res = handleRouteError(new HttpError(404, "not_found", "Product not found."));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Product not found.", code: "not_found" });
  });

  it("adds Retry-After for rate limits", () => {
    const res = handleRouteError(new HttpError(429, "rate_limited", "Slow down.", { retryAfter: 42.2 }));
    expect(res.headers.get("Retry-After")).toBe("43");
  });

  it("maps ZodError to 400 with issues", async () => {
    const parsed = z.object({ name: z.string() }).safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const res = handleRouteError(parsed.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_request");
    expect(body.error).toContain("name");
    expect(body.issues).toHaveLength(1);
  });

  it("hides unknown errors behind a 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = handleRouteError(new Error("db password leaked here"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("internal");
    expect(body.error).not.toContain("password");
    expect(spy).toHaveBeenCalled();
  });
});

describe("withRoute", () => {
  it("passes through successful responses", async () => {
    const handler = withRoute(async () => json({ ok: true }));
    const res = await handler(new Request("http://localhost"), { params: {} });
    expect(res.status).toBe(200);
  });

  it("converts thrown errors", async () => {
    const handler = withRoute(async () => {
      throw new HttpError(401, "unauthorized", "Sign in to continue.");
    });
    const res = await handler(new Request("http://localhost"), { params: {} });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Sign in to continue.");
  });

  it("rethrows Next.js redirects", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    const handler = withRoute(async () => {
      throw redirectError;
    });
    await expect(handler(new Request("http://localhost"), { params: {} })).rejects.toBe(redirectError);
  });
});

describe("parseJson", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("parses valid bodies", async () => {
    await expect(parseJson(jsonRequest('{"name":"Acme"}'), schema)).resolves.toEqual({ name: "Acme" });
  });

  it("rejects invalid JSON with 400", async () => {
    await expect(parseJson(jsonRequest("{nope"), schema)).rejects.toMatchObject({ status: 400, code: "invalid_request" });
  });

  it("rejects empty bodies with 400", async () => {
    await expect(parseJson(jsonRequest(""), schema)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects schema failures with issues", async () => {
    try {
      await parseJson(jsonRequest('{"name":""}'), schema);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
      expect((err as HttpError).extra?.issues).toBeDefined();
    }
  });

  it("enforces maxBytes on the actual body", async () => {
    const big = JSON.stringify({ name: "x".repeat(2000) });
    await expect(parseJson(jsonRequest(big), schema, { maxBytes: 1024 })).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });

  it("enforces maxBytes from content-length before reading", async () => {
    const req = jsonRequest('{"name":"a"}', { "content-length": "999999" });
    await expect(parseJson(req, schema)).rejects.toMatchObject({ status: 413 });
  });

  it("counts bytes, not characters", async () => {
    const body = JSON.stringify({ name: "₹".repeat(400) }); // 3 bytes each
    await expect(parseJson(jsonRequest(body), schema, { maxBytes: 1000 })).rejects.toMatchObject({ status: 413 });
  });
});

describe("corsHeaders", () => {
  it("echoes the origin by default", () => {
    const h = corsHeaders("https://acme.com");
    expect(h["Access-Control-Allow-Origin"]).toBe("https://acme.com");
    expect(h["Access-Control-Allow-Methods"]).toBe("GET, POST, OPTIONS");
    expect(h["Access-Control-Allow-Headers"]).toBe("Content-Type");
    expect(h["Access-Control-Max-Age"]).toBe("86400");
    expect(h.Vary).toBe("Origin");
  });

  it("falls back to * without an origin and accepts overrides", () => {
    expect(corsHeaders(null)["Access-Control-Allow-Origin"]).toBe("*");
    const h = corsHeaders("chrome-extension://abc", { methods: "POST, OPTIONS", headers: "Authorization, Content-Type" });
    expect(h["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(h["Access-Control-Allow-Headers"]).toBe("Authorization, Content-Type");
  });
});
