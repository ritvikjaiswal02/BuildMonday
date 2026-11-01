import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { Button, Callout, PriorityMeter, RankNumber } from "@/components/ui";
import { EXAMPLE_ISSUES, EXAMPLE_PRODUCT } from "@/components/landing/example-data";
import { onboardingPath, safeNextPath } from "@/lib/auth/cookies";
import { getSessionContext } from "@/lib/auth/session";
import { authProviders, isAuthConfigured } from "@/lib/env";
import { loginErrorMessage } from "./errors";
import { LoginPanel } from "./LoginPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to BuildMonday with GitHub, Google or an email link.",
};

type SearchParams = { next?: string | string[]; check?: string | string[]; error?: string | string[] };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function intentFor(next: string): string | null {
  if (next.startsWith("/onboarding/invite/")) return "Sign in with the address your invite was sent to.";
  if (next.startsWith("/onboarding?source=") || next.startsWith("/onboarding%3Fsource"))
    return "Create your free account. We keep checking that source, keep the history and email you the list every Monday.";
  if (next.startsWith("/onboarding")) return "Create your free account, then set up your first product. Includes 14 days of Pro, no card needed.";
  if (next.startsWith("/billing"))
    return "Create your free account and set up your product. Then you can pick your plan.";
  return null;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNextPath(first(searchParams.next), "/dashboard");
  const configured = isAuthConfigured();

  if (configured) {
    const ctx = await getSessionContext();
    if (ctx) {
      if (ctx.user.onboardedAt || next.startsWith("/onboarding")) redirect(next);
      redirect(onboardingPath(next));
    }
  }

  const providers = configured ? authProviders() : [];
  const error = loginErrorMessage(first(searchParams.error));
  const checkEmail = first(searchParams.check) === "email";

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-h-dvh flex-col px-4 sm:px-8 lg:px-12">
        <header className="flex h-16 items-center">
          <Link href="/" className="focus-ring -mx-1 rounded-md px-1 py-1" aria-label="BuildMonday home">
            <Wordmark />
          </Link>
        </header>

        <main className="flex flex-1 items-center py-10">
          <div className="mx-auto w-full max-w-[380px]">
            {configured && providers.length > 0 ? (
              <LoginPanel
                providers={providers}
                next={next}
                error={error}
                checkEmail={checkEmail}
                intent={intentFor(next)}
              />
            ) : (
              <NotConfigured />
            )}
          </div>
        </main>

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 py-6 text-sm text-ink-muted">
          <Link href="/app" className="focus-ring inline-flex items-center gap-1.5 rounded-sm hover:text-ink">
            <FlaskConical aria-hidden className="size-4" />
            Try the analyzer without an account
          </Link>
          <Link href="/pricing" className="focus-ring rounded-sm hover:text-ink">
            Pricing
          </Link>
        </footer>
      </div>

      <WhatHappensNext />
    </div>
  );
}

function NotConfigured() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Sign in to BuildMonday</h1>
      <Callout tone="neutral" title="Sign-in is not set up on this deployment yet." className="mt-6">
        You can still use the free analyzer: paste reviews or a link and get a ranked list of issues.
      </Callout>
      <Button asChild variant="primary" size="lg" className="mt-6 w-full justify-center">
        <Link href="/app">Open the free analyzer</Link>
      </Button>
    </div>
  );
}

const STEPS = [
  {
    title: "Answer three short questions",
    body: "Your product, where people talk about it, and who should hear about problems. It takes about two minutes.",
  },
  {
    title: "We check your sources",
    body: "The first check starts as soon as you finish. After that BuildMonday reads them on your plan's schedule.",
  },
  {
    title: "Your Monday list arrives",
    body: "A ranked list of what to fix, with quotes from real users, in your inbox every Monday morning.",
  },
];

const EXAMPLE = EXAMPLE_ISSUES.slice(0, 3).map((issue) => ({ title: issue.title, score: issue.priority }));

function WhatHappensNext() {
  return (
    <aside
      aria-labelledby="next-heading"
      className="hidden border-l border-line bg-sunken lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-20"
    >
      <div className="max-w-[440px]">
        <h2 id="next-heading" className="font-display text-xl font-semibold text-ink">
          What happens next
        </h2>
        <ol className="mt-6 space-y-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-4">
              <span className="font-display text-2xl font-semibold leading-none tabular-nums text-brand">{i + 1}</span>
              <div>
                <p className="font-medium text-ink">{step.title}</p>
                <p className="mt-1 text-sm text-ink-secondary">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <figure className="mt-10 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
          <figcaption className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-ink-muted">
            <span className="font-medium text-ink-secondary">{EXAMPLE_PRODUCT}: this week&apos;s list</span>
            <span>Example</span>
          </figcaption>
          <ul className="divide-y divide-line">
            {EXAMPLE.map((row, i) => (
              <li key={row.title} className="flex items-center gap-3 px-4 py-3">
                <RankNumber rank={i + 1} className="w-7 text-xl" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.title}</span>
                <PriorityMeter score={row.score} />
              </li>
            ))}
          </ul>
        </figure>
      </div>
    </aside>
  );
}
