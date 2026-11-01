import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Header, skip link, main landmark and footer shared by every marketing page. */
export function MarketingShell({ children, signedIn }: { children: ReactNode; signedIn?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a
        href="#main"
        className="focus-ring sr-only z-toast rounded-md bg-surface px-3 py-2 text-sm font-medium text-ink shadow-md focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <SiteHeader signedIn={signedIn} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
