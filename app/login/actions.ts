"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { safeNextPath } from "@/lib/auth/cookies";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { authProviders } from "@/lib/env";
import { errorCodeFromUrl, loginErrorMessage } from "./errors";

/** Starts GitHub or Google sign-in; Auth.js redirects to the provider. */
export async function oauthSignInAction(provider: "github" | "google", next: string): Promise<void> {
  if (!authProviders().includes(provider)) redirect("/login?error=Configuration");
  await signIn(provider, { redirectTo: safeNextPath(next, "/dashboard") });
}

export interface EmailSignInState {
  status: "idle" | "sent" | "error";
  email?: string;
  error?: string;
  /** Changes on every send so the client can tell repeated sends apart. */
  sentAt?: number;
}

const emailSchema = z.string().trim().toLowerCase().email().max(254);

function isRedirectError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** Sends a magic link without leaving the page, so the form can show "Check your inbox". */
export async function emailSignInAction(_prev: EmailSignInState, formData: FormData): Promise<EmailSignInState> {
  const parsed = emailSchema.safeParse(formData.get("email") ?? "");
  if (!parsed.success) {
    return { status: "error", error: "Enter a valid email address, like you@company.com." };
  }
  const email = parsed.data;
  const next = safeNextPath(String(formData.get("next") ?? ""), "/dashboard");

  if (!authProviders().includes("email")) {
    return { status: "error", email, error: "Email sign-in is not set up on this deployment." };
  }

  const ip = clientIp(new Request("http://localhost", { headers: headers() }));
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`magic-link:ip:${ip}`, { limit: 10, windowSec: 15 * 60 }),
    rateLimit(`magic-link:email:${email}`, { limit: 3, windowSec: 15 * 60 }),
  ]);
  if (!byIp.ok || !byEmail.ok) {
    return {
      status: "error",
      email,
      error: "We have sent several links recently. Check your inbox and spam folder, or try again in 15 minutes.",
    };
  }

  try {
    const url = await signIn("resend", { email, redirect: false, redirectTo: next });
    const code = errorCodeFromUrl(url);
    if (code) return { status: "error", email, error: loginErrorMessage(code) ?? undefined };
    return { status: "sent", email, sentAt: Date.now() };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("[login] magic link failed", err);
    return { status: "error", email, error: loginErrorMessage("EmailSignin") ?? undefined };
  }
}
