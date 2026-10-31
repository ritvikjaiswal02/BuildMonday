/**
 * Edge middleware for signed-in app routes.
 *
 * Cookie-presence check only: no database and no Auth.js import, so it stays
 * edge-safe and fast. Pages still verify the session with requirePageContext;
 * this just sends obviously signed-out visitors to /login without rendering.
 *
 * It never runs on "/", "/app", "/pricing", "/terms", "/privacy", "/login",
 * "/widget-demo" or any "/api/**" route (API routes authenticate themselves).
 */
import { NextResponse, type NextRequest } from "next/server";
import { PATH_HEADER, hasSessionCookie } from "@/lib/auth/cookies";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const pathWithSearch = `${pathname}${search}`;
  const cookieNames = req.cookies.getAll().map((c) => c.name);

  if (!hasSessionCookie(cookieNames)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathWithSearch);
    return NextResponse.redirect(url);
  }

  // Let server components know where the request was going, so
  // requirePageContext can build a precise /login?next= when the cookie turns
  // out to be expired or invalid.
  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, pathWithSearch);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/inbox/:path*",
    "/issues/:path*",
    "/runs/:path*",
    "/settings/:path*",
    "/billing/:path*",
    "/extension/:path*",
    "/onboarding/:path*",
  ],
};
