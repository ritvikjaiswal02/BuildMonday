import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "@/middleware";
import { PATH_HEADER, hasSessionCookie, safeNextPath } from "@/lib/auth/cookies";

function request(path: string, cookie?: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : {},
  });
}

describe("hasSessionCookie", () => {
  it("accepts plain, secure and chunked cookies", () => {
    expect(hasSessionCookie(["authjs.session-token"])).toBe(true);
    expect(hasSessionCookie(["__Secure-authjs.session-token"])).toBe(true);
    expect(hasSessionCookie(["__Secure-authjs.session-token.0", "__Secure-authjs.session-token.1"])).toBe(true);
  });

  it("ignores other cookies", () => {
    expect(hasSessionCookie([])).toBe(false);
    expect(hasSessionCookie(["authjs.csrf-token", "bm_product", "authjs.session-tokenX"])).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths only", () => {
    expect(safeNextPath("/issues/1?x=2")).toBe("/issues/1?x=2");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(null, "/app")).toBe("/app");
  });
});

describe("middleware", () => {
  it("redirects signed-out visitors to /login with next", () => {
    const res = middleware(request("/issues/abc?status=new"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/issues/abc?status=new");
  });

  it("lets signed-in visitors through and forwards the path", () => {
    const res = middleware(request("/dashboard?first=1", "authjs.session-token=abc"));
    expect(res.headers.get("location")).toBeNull();
    // NextResponse.next({ request: { headers } }) exposes overridden request headers like this:
    expect(res.headers.get(`x-middleware-request-${PATH_HEADER}`)).toBe("/dashboard?first=1");
  });

  it("only matches signed-in app routes", () => {
    const matchers = config.matcher;
    expect(matchers).toEqual([
      "/dashboard/:path*",
      "/inbox/:path*",
      "/issues/:path*",
      "/runs/:path*",
      "/settings/:path*",
      "/billing/:path*",
      "/extension/:path*",
      "/onboarding/:path*",
    ]);
    const publicPaths = ["/", "/app", "/pricing", "/terms", "/privacy", "/login", "/widget-demo", "/api/ingest", "/api/cron/monitor"];
    for (const p of publicPaths) {
      expect(matchers.some((m) => p === m.replace("/:path*", "") || p.startsWith(m.replace(":path*", "")))).toBe(false);
    }
  });
});
