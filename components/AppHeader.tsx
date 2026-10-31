"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export interface AppHeaderProps {
  /** Page actions (Share, Copy Markdown, ...). Shown before the account links from 1024px; on a second row below that. */
  actions?: React.ReactNode;
  /** @deprecated Use `actions`. Kept so older call sites keep compiling. */
  right?: React.ReactNode;
}

type SessionState = "loading" | "signed-in" | "signed-out";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/app", label: "Analyzer" },
  { href: "/pricing", label: "Pricing" },
];

/** Reads the Auth.js session once. Any failure (auth not configured, offline) counts as signed out. */
function useSessionState(): SessionState {
  const [state, setState] = React.useState<SessionState>("loading");

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("application/json")) return null;
        return (await res.json()) as { user?: { email?: string | null } } | null;
      })
      .then((session) => {
        setState(session && session.user ? "signed-in" : "signed-out");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("signed-out");
      });
    return () => controller.abort();
  }, []);

  return state;
}

/** Header for public tool pages such as /app. The root layout renders no header. */
export function AppHeader({ actions, right }: AppHeaderProps) {
  const pathname = usePathname();
  const session = useSessionState();
  const pageActions = actions ?? right;

  return (
    <header className="sticky top-0 z-topbar border-b border-line bg-topbar">
      <div className="container-app flex h-[var(--topbar-height)] items-center gap-3">
        <Link href="/" className="focus-ring -mx-1 shrink-0 rounded-md px-1 py-1" aria-label="BuildMonday home">
          <Wordmark />
        </Link>

        <nav aria-label="Site" className="ml-2 hidden items-center gap-1 sm:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-120",
                  active ? "text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {pageActions ? (
            <div className="hidden items-center gap-1.5 lg:flex">{pageActions}</div>
          ) : null}
          {pageActions ? <span aria-hidden className="mx-1 hidden h-5 w-px bg-line lg:block" /> : null}
          <AccountLinks session={session} />
        </div>
      </div>

      {pageActions ? (
        <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto border-t border-line px-4 py-2 lg:hidden">
          {pageActions}
        </div>
      ) : null}
    </header>
  );
}

function AccountLinks({ session }: { session: SessionState }) {
  if (session === "loading") {
    return <div aria-hidden className="skeleton h-[30px] w-[150px] rounded-md" />;
  }

  if (session === "signed-in") {
    return (
      <Button asChild variant="primary" size="sm" leftIcon={<LayoutDashboard aria-hidden />}>
        <Link href="/dashboard">Open dashboard</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button asChild variant="ghost" size="sm" className="hidden min-[400px]:inline-flex">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild variant="primary" size="sm">
        <Link href="/login?next=/onboarding">Start free</Link>
      </Button>
    </div>
  );
}
