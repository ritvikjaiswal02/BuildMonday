import Link from "next/link";
import { ClipboardPaste, FlaskConical, Link2, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";

const POINTS = [
  { icon: ClipboardPaste, text: "Paste reviews, tickets or survey answers" },
  { icon: Link2, text: "Or paste an App Store, Reddit, Hacker News or Trustpilot link" },
  { icon: ListOrdered, text: "Get ranked issues with evidence, a PRD and a share link" },
];

export function TryBand() {
  return (
    <section aria-labelledby="try-title" className="pb-20 sm:pb-28">
      <div className="container-marketing">
        <div className="grid grid-cols-1 gap-8 rounded-xl border border-brand/20 bg-brand-soft p-6 sm:p-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <h2 id="try-title" className="text-2xl font-semibold text-ink sm:text-3xl">
              Try it now, without an account
            </h2>
            <p className="mt-3 max-w-prose text-lg text-ink-secondary">
              The free analyzer runs the same ranking on whatever you paste. Your text is sent to Google Gemini for analysis and not stored. Results stay in this browser.
            </p>
            <ul className="mt-6 space-y-2.5">
              {POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2.5 text-sm text-ink-secondary">
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 lg:col-span-5 lg:items-end">
            <Button asChild variant="primary" size="lg" leftIcon={<FlaskConical aria-hidden />}>
              <Link href="/app">Open the analyzer</Link>
            </Button>
            <p className="text-sm text-ink-muted lg:text-right">Load a demo dataset if you have nothing to paste.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
