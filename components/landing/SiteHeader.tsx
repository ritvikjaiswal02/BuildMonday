"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { START_FREE_HREF } from "./pricing";

const NAV = [
  { href: "/#how-it-works", label: "How it works", match: null },
  { href: "/pricing", label: "Pricing", match: "/pricing" },
  { href: "/app", label: "Analyzer", match: "/app" },
] as const;

type SessionState = "loading" | "signed-in" | "signed-out";

/**
 * When the server already knows (it saw the session cookie), use that. Otherwise
 * ask Auth.js once; any failure, including auth not being configured, counts as signed out.
 */
function useSessionState(initial: boolean | undefined): SessionState {
  const [state, setState] = React.useState<SessionState>(
    initial === undefined ? "loading" : initial ? "signed-in" : "signed-out",
  );

  React.useEffect(() => {
    if (initial !== undefined) return;
    const controller = new AbortController();
    fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) return null;
        return (await res.json()) as { user?: unknown } | null;
      })
      .then((session) => setState(session && session.user ? "signed-in" : "signed-out"))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("signed-out");
      });
    return () => controller.abort();
  }, [initial]);

  return state;
}

export interface SiteHeaderProps {
  /** Pass when the server checked the session cookie; omit on static pages to check in the browser. */
  signedIn?: boolean;
}

/** Sticky marketing header: Wordmark left, links centre-right, account actions right, menu on mobile. */
export function SiteHeader({ signedIn }: SiteHeaderProps) {
  const pathname = usePathname();
  const session = useSessionState(signedIn);
  const [open, setOpen] = React.useState(false);
  const menuId = React.useId();
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  // Close the mobile menu on navigation and on Escape.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-topbar border-b border-line bg-topbar">
      <div className="container-marketing flex h-14 items-center gap-4">
        <Link href="/" className="focus-ring -mx-1 shrink-0 rounded-md px-1 py-1" aria-label="BuildMonday home">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = item.match !== null && (pathname === item.match || pathname?.startsWith(`${item.match}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-120",
                  active ? "text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-4">
          <AccountActions session={session} />
          <Button
            ref={buttonRef}
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </div>

      <div
        id={menuId}
        hidden={!open}
        className="border-t border-line bg-surface md:hidden"
      >
        <nav aria-label="Main" className="container-marketing flex flex-col py-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="focus-ring rounded-md px-1 py-3 text-base font-medium text-ink"
            >
              {item.label}
            </Link>
          ))}
          {session !== "signed-in" ? (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="focus-ring rounded-md px-1 py-3 text-base font-medium text-ink"
            >
              Sign in
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

function AccountActions({ session }: { session: SessionState }) {
  if (session === "loading") {
    return <div aria-hidden className="skeleton h-[30px] w-[88px] rounded-md md:w-[150px]" />;
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
      <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild variant="primary" size="sm">
        <Link href={START_FREE_HREF}>Start free</Link>
      </Button>
    </div>
  );
}
