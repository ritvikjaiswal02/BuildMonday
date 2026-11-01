import type { ReactNode } from "react";
import { env } from "@/lib/env";
import { MarketingShell } from "./MarketingShell";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** "support@<domain>" from NEXT_PUBLIC_APP_URL, without a leading "www.". */
export function supportEmail(appUrl: string = env.APP_URL): string {
  let host = "buildmonday.app";
  try {
    host = new URL(appUrl).hostname.replace(/^www\./, "") || host;
  } catch {
    // Keep the fallback for a malformed URL.
  }
  return `support@${host}`;
}

export const LEGAL_UPDATED = "1 November 2026";

/** Single 68ch column: h1, last-updated date, a short contents list, then plain-language sections. */
export function LegalPage({
  title,
  intro,
  sections,
  updated = LEGAL_UPDATED,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  updated?: string;
}) {
  return (
    <MarketingShell>
      <article className="container-marketing pb-20 pt-12 sm:pb-28 sm:pt-20">
        <div className="max-w-prose">
          <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-ink-muted">Last updated {updated}</p>
          <div className="mt-6 space-y-4 text-lg text-ink-secondary">{intro}</div>

          <nav aria-labelledby="contents-title" className="mt-10 rounded-lg border border-line bg-surface px-5 py-4">
            <p id="contents-title" className="text-xs font-medium text-ink-muted">
              On this page
            </p>
            <ol className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="focus-ring rounded-sm text-sm text-ink-secondary hover:text-ink"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-12 space-y-12">
            {sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-20">
                <h2 id={`${s.id}-title`} className="text-xl font-semibold sm:text-2xl">
                  {s.title}
                </h2>
                <div className="mt-3 space-y-3 text-base text-ink-secondary [&_a]:text-brand [&_a]:underline [&_a]:decoration-brand/40 [&_a]:underline-offset-2 [&_a:hover]:decoration-brand [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </article>
    </MarketingShell>
  );
}
