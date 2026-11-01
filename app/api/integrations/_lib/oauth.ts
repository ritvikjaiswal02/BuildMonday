import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { HttpError } from "@/lib/auth/http";
import { requireRole, requireUser, type SessionContext } from "@/lib/auth/session";
import { absoluteUrl } from "@/lib/env";
import { oauthAvailability } from "@/lib/oauth/providers";
import {
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  createOAuthState,
  safeOAuthReturn,
  verifyOAuthState,
  withQuery,
  type OAuthProvider,
} from "@/lib/oauth/state";
import { INTEGRATION_NAMES } from "./rules";
import { assertIntegrationFeature } from "./service";

/**
 * Browser-navigation halves of the one-click connect flows. Errors never
 * return JSON here: the browser is sent back to the page it came from with
 * `?integration_error=<message>`, and success adds `?connected=<provider>`.
 */

function redirectTo(path: string): NextResponse {
  return NextResponse.redirect(absoluteUrl(path), { status: 303 });
}

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof HttpError) return err.message;
  if (err instanceof Error && err.message && !(err instanceof TypeError)) return err.message;
  return fallback;
}

/** GET /api/integrations/<provider>/oauth?returnTo=/settings/integrations */
export async function startOAuth(
  req: Request,
  provider: OAuthProvider,
  authorizeUrl: (state: string) => string,
): Promise<NextResponse> {
  const returnTo = safeOAuthReturn(new URL(req.url).searchParams.get("returnTo"));
  let ctx: SessionContext;
  try {
    ctx = await requireUser();
  } catch {
    return redirectTo(`/login?next=${encodeURIComponent(returnTo)}`);
  }
  try {
    requireRole(ctx, "admin");
    await assertIntegrationFeature(ctx, provider);
    if (!oauthAvailability()[provider]) {
      throw new HttpError(
        503,
        "not_configured",
        `One-click ${INTEGRATION_NAMES[provider]} is not set up on this deployment. Use the manual option instead.`,
      );
    }
    const { state, nonce } = createOAuthState({
      provider,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      returnTo,
    });
    const res = NextResponse.redirect(authorizeUrl(state), { status: 303 });
    res.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/integrations",
      maxAge: OAUTH_STATE_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    return redirectTo(
      withQuery(returnTo, { integration_error: messageOf(err, `Could not start connecting ${INTEGRATION_NAMES[provider]}.`) }),
    );
  }
}

/**
 * GET /api/integrations/<provider>/oauth/callback. Verifies the state against
 * the cookie and the current session, then runs `complete` to exchange the
 * code and save the integration.
 */
export async function finishOAuth(
  req: Request,
  provider: OAuthProvider,
  complete: (ctx: SessionContext, params: URLSearchParams) => Promise<void>,
): Promise<NextResponse> {
  const params = new URL(req.url).searchParams;
  const nonce = cookies().get(OAUTH_NONCE_COOKIE)?.value ?? null;
  const payload = verifyOAuthState(params.get("state"), provider, nonce);
  const fallbackReturn = "/settings/integrations";
  const name = INTEGRATION_NAMES[provider];

  const done = (path: string) => {
    const res = redirectTo(path);
    res.cookies.set(OAUTH_NONCE_COOKIE, "", { path: "/api/integrations", maxAge: 0 });
    return res;
  };

  if (!payload) {
    return done(
      withQuery(fallbackReturn, {
        integration_error: `The ${name} connection expired or came from another browser. Start again from this page.`,
      }),
    );
  }
  const returnTo = payload.r;

  if (params.get("error")) {
    return done(withQuery(returnTo, { integration_error: `${name} was not connected because the request was cancelled.` }));
  }

  let ctx: SessionContext;
  try {
    ctx = await requireUser();
  } catch {
    return done(`/login?next=${encodeURIComponent(returnTo)}`);
  }
  if (ctx.user.id !== payload.u || ctx.workspace.id !== payload.w) {
    return done(
      withQuery(returnTo, {
        integration_error: `You switched account or workspace while connecting ${name}. Start again from this page.`,
      }),
    );
  }

  try {
    requireRole(ctx, "admin");
    await assertIntegrationFeature(ctx, provider);
    await complete(ctx, params);
    return done(withQuery(returnTo, { connected: provider }));
  } catch (err) {
    console.warn(`[oauth] ${provider} connect failed`, err instanceof Error ? err.message : err);
    return done(withQuery(returnTo, { integration_error: messageOf(err, `${name} did not finish connecting. Try again.`) }));
  }
}
