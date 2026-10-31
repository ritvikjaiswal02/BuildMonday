/** Auth.js `?error=` codes mapped to plain sentences. Pure. */
const MESSAGES: Record<string, string> = {
  Verification: "That sign-in link has expired or was already used. Ask for a new one below.",
  OAuthAccountNotLinked:
    "This email already signs in another way. Use the method you used the first time, or the email link.",
  AccessDenied: "Sign-in was cancelled or not allowed. Try again, or use a different method.",
  Configuration:
    "Sign-in is not set up correctly on this deployment. Try another method, or use the free analyzer for now.",
  EmailSignin: "We could not send the sign-in email. Check the address and try again.",
  OAuthSignin: "We could not start sign-in with that provider. Try again in a moment.",
  OAuthCallback: "The provider did not finish signing you in. Try again in a moment.",
  OAuthCallbackError: "The provider did not finish signing you in. Try again in a moment.",
  Callback: "Sign-in did not complete. Try again in a moment.",
  SessionRequired: "Sign in to continue.",
  MissingCSRF: "Your sign-in form expired. Reload the page and try again.",
};

export function loginErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? "Sign-in did not complete. Try again.";
}

/** Extracts `error=` from an Auth.js redirect URL, if any. */
export function errorCodeFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    return new URL(url, "http://localhost").searchParams.get("error");
  } catch {
    return null;
  }
}
