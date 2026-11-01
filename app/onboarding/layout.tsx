import Link from "next/link";
import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { signOutAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

/** Onboarding has no sidebar: a minimal top bar with the wordmark and "Sign out". */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-topbar border-b border-line bg-topbar">
        <div className="mx-auto flex h-14 w-full max-w-[1040px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="focus-ring -mx-1 rounded-md px-1 py-1" aria-label="BuildMonday home">
            <Wordmark />
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-secondary transition-colors duration-120 hover:bg-sunken hover:text-ink"
            >
              <LogOut aria-hidden className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1040px] flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {children}
      </main>
    </div>
  );
}
