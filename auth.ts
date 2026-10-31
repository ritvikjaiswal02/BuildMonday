/**
 * Auth.js (next-auth v5) configuration.
 *
 * The config is built lazily per request so that importing this module never
 * touches the database or throws when environment variables are missing
 * (`next build` must work with no env). Providers appear only when their
 * credentials are set; the email magic link also needs the database because
 * verification tokens are stored through the adapter.
 */
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import type { Adapter } from "next-auth/adapters";
import { renderMagicLinkEmail, sendEmail } from "@/lib/auth/mailer";
import { rateLimit } from "@/lib/auth/rate-limit";
import { ensurePersonalWorkspace } from "@/lib/auth/workspace";
import { getDb } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { authProviders, env, isDbConfigured } from "@/lib/env";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

function buildProviders(): Provider[] {
  const enabled = authProviders();
  const providers: Provider[] = [];

  if (enabled.includes("github")) {
    providers.push(
      GitHub({
        clientId: env.AUTH_GITHUB_ID,
        clientSecret: env.AUTH_GITHUB_SECRET,
        authorization: { params: { scope: "read:user user:email" } },
        // Linking by email is only safe for verified addresses. The provider
        // does not check that, so the signIn callback below does
        // (githubEmailVerified) before any account is linked.
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (enabled.includes("google")) {
    providers.push(
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        // Google verifies email ownership.
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (enabled.includes("email")) {
    providers.push(
      Resend({
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM,
        maxAge: 24 * 60 * 60,
        async sendVerificationRequest({ identifier, url }) {
          // Limit where the email is sent, so posting straight to
          // /api/auth/signin/resend cannot skip the login form's limits.
          const limited = await rateLimit(`magic-link:send:${identifier.toLowerCase()}`, { limit: 3, windowSec: 15 * 60 });
          if (!limited.ok) throw new Error("rate_limited");
          // Build the link on the configured origin, never on the request's Host header.
          const safeUrl = magicLinkOnAppOrigin(url);
          const { host } = new URL(safeUrl);
          const email = renderMagicLinkEmail({ url: safeUrl, host });
          await sendEmail({
            to: identifier,
            subject: email.subject,
            html: email.html,
            text: email.text,
            tags: [{ name: "category", value: "magic_link" }],
          });
        },
      }),
    );
  }

  return providers;
}

/** The emailed sign-in link, rebuilt on NEXT_PUBLIC_APP_URL (path and query kept). */
export function magicLinkOnAppOrigin(url: string): string {
  const u = new URL(url);
  return new URL(`${u.pathname}${u.search}`, env.APP_URL).toString();
}

/**
 * True when GitHub lists `email` on the account as verified. Without this,
 * someone who adds a victim's address to their GitHub account (unverified)
 * could sign in and be linked to the victim's BuildMonday user.
 */
export async function githubEmailVerified(accessToken: string | undefined, email: string | null | undefined): Promise<boolean> {
  if (!accessToken || !email) return false;
  try {
    const res = await fetch("https://api.github.com/user/emails", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const list = (await res.json()) as Array<{ email?: string; verified?: boolean }>;
    const wanted = email.trim().toLowerCase();
    return Array.isArray(list) && list.some((e) => e.email?.trim().toLowerCase() === wanted && e.verified === true);
  } catch {
    return false;
  }
}

/**
 * The Drizzle adapter, minus the provider tokens. BuildMonday never calls
 * GitHub or Google on the user's behalf after sign-in, so access, refresh and
 * id tokens are not stored at all.
 */
function buildAdapter(): Adapter {
  const base = DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  });
  return {
    ...base,
    linkAccount: (account) =>
      base.linkAccount!({
        ...account,
        access_token: undefined,
        refresh_token: undefined,
        id_token: undefined,
      }),
  };
}

function buildConfig(): NextAuthConfig {
  const dbReady = isDbConfigured();
  return {
    adapter: dbReady ? buildAdapter() : undefined,
    secret: env.AUTH_SECRET,
    trustHost: true,
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    providers: buildProviders(),
    pages: {
      signIn: "/login",
      verifyRequest: "/login?check=email",
      error: "/login",
    },
    callbacks: {
      async signIn({ account, user }) {
        if (account?.provider === "github") {
          return githubEmailVerified(account.access_token, user?.email);
        }
        return true;
      },
      jwt({ token, user }) {
        if (user?.id) token.sub = user.id;
        return token;
      },
      session({ session, token }) {
        if (token.sub && session.user) {
          session.user.id = token.sub;
        }
        return session;
      },
    },
    events: {
      async createUser({ user }) {
        if (!user.id) return;
        try {
          await ensurePersonalWorkspace(user.id);
        } catch (err) {
          // getSessionContext retries this on the next request, so sign-in is never blocked.
          console.error("[auth] could not create the personal workspace", err);
        }
      },
    },
    logger: {
      error(error) {
        // MissingSecret and similar configuration errors are expected on
        // deployments without auth; keep them to one line.
        const name = (error as { type?: string }).type ?? error.name;
        console.error(`[auth] ${name}: ${error.message}`);
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());
