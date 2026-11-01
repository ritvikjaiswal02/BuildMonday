"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { ArrowLeft, Mail, MailCheck } from "lucide-react";
import { GitHubGlyph, GoogleGlyph } from "@/components/brand/logos";
import { Button, Callout, Field, Input } from "@/components/ui";
import { emailSignInAction, oauthSignInAction, type EmailSignInState } from "./actions";

export interface LoginPanelProps {
  providers: Array<"github" | "google" | "email">;
  next: string;
  error: string | null;
  /** Arrived from Auth.js verifyRequest (`?check=email`). */
  checkEmail: boolean;
  /** Where the user is headed after sign-in, in words, e.g. "set up your first product". */
  intent: string | null;
}

function ProviderButton({ provider, next }: { provider: "github" | "google"; next: string }) {
  const action = oauthSignInAction.bind(null, provider, next);
  return (
    <form action={action}>
      <ProviderSubmit provider={provider} />
    </form>
  );
}

function ProviderSubmit({ provider }: { provider: "github" | "google" }) {
  const { pending } = useFormStatus();
  const label = provider === "github" ? "Continue with GitHub" : "Continue with Google";
  return (
    <Button
      type="submit"
      variant="secondary"
      size="lg"
      className="w-full justify-center"
      loading={pending}
      leftIcon={provider === "github" ? <GitHubGlyph className="size-4" /> : <GoogleGlyph className="size-4" />}
    >
      {label}
    </Button>
  );
}

function EmailSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={pending}>
      {pending ? "Sending link…" : label}
    </Button>
  );
}

const INITIAL: EmailSignInState = { status: "idle" };

export function LoginPanel({ providers, next, error, checkEmail, intent }: LoginPanelProps) {
  const [state, formAction] = useFormState(emailSignInAction, INITIAL);
  const [dismissedSentAt, setDismissedSentAt] = React.useState<number | null>(null);
  const [showGenericCheck, setShowGenericCheck] = React.useState(checkEmail);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const sent = state.status === "sent" && state.sentAt !== dismissedSentAt;
  const oauth = providers.filter((p): p is "github" | "google" => p === "github" || p === "google");
  const hasEmail = providers.includes("email");

  React.useEffect(() => {
    if (sent) headingRef.current?.focus();
  }, [sent, state.sentAt]);

  if (sent || showGenericCheck) {
    return (
      <div className="animate-slide-up-sm" aria-live="polite">
        <span className="mb-6 inline-flex size-11 items-center justify-center rounded-md border border-line bg-surface text-brand shadow-xs">
          <MailCheck aria-hidden className="size-5" strokeWidth={1.75} />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold text-ink outline-none">
          Check your inbox
        </h1>
        <p className="mt-2 text-base text-ink-secondary">
          {sent && state.email ? (
            <>
              We sent a sign-in link to <span className="font-medium text-ink">{state.email}</span>. It works once and
              expires in 24 hours.
            </>
          ) : (
            "We sent you a sign-in link. It works once and expires in 24 hours."
          )}
        </p>
        <p className="mt-4 text-sm text-ink-muted">
          Nothing after a minute? Check your spam folder, or send the link again.
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          {sent && state.email ? (
            <form action={formAction} className="sm:flex-none">
              <input type="hidden" name="email" value={state.email} />
              <input type="hidden" name="next" value={next} />
              <ResendButton />
            </form>
          ) : null}
          <Button
            variant="ghost"
            leftIcon={<ArrowLeft />}
            onClick={() => {
              setDismissedSentAt(state.sentAt ?? null);
              setShowGenericCheck(false);
            }}
          >
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Sign in to BuildMonday</h1>
      <p className="mt-2 text-base text-ink-secondary">
        {intent ?? "New here? Signing in creates your free account. No card needed."}
      </p>

      {error ? (
        <Callout tone="danger" className="mt-6">
          {error}
        </Callout>
      ) : null}

      <div className="mt-8 space-y-3">
        {oauth.map((provider) => (
          <ProviderButton key={provider} provider={provider} next={next} />
        ))}
      </div>

      {oauth.length > 0 && hasEmail ? (
        <div className="my-6 flex items-center gap-3 text-xs text-ink-muted" role="separator" aria-label="or">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}

      {hasEmail ? (
        <form action={formAction} className={oauth.length === 0 ? "mt-8 space-y-4" : "space-y-4"} noValidate>
          <input type="hidden" name="next" value={next} />
          <Field
            label="Email"
            htmlFor="login-email"
            error={state.status === "error" ? (state.error ?? null) : null}
          >
            <Input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@company.com"
              defaultValue={state.email ?? ""}
              leftIcon={<Mail />}
              required
              className="h-11"
            />
          </Field>
          <EmailSubmit label="Email me a sign-in link" />
        </form>
      ) : null}

      <p className="mt-8 text-xs text-ink-muted">
        By continuing you agree to the{" "}
        <Link href="/terms" className="focus-ring rounded-sm text-ink-secondary underline underline-offset-2 hover:text-ink">
          Terms
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="focus-ring rounded-sm text-ink-secondary underline underline-offset-2 hover:text-ink">
          Privacy policy
        </Link>
        .
      </p>
    </div>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending} className="w-full sm:w-auto">
      {pending ? "Sending…" : "Send the link again"}
    </Button>
  );
}
