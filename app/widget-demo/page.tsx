import type { Metadata } from "next";
import Link from "next/link";
import { Code2, CornerDownLeft, Keyboard, MousePointerClick } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button, Callout, CopyField, Kbd } from "@/components/ui";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { widgetSnippet } from "@/app/extension/_lib/snippet";
import { EXAMPLE_ISSUES, EXAMPLE_PRODUCT } from "@/components/landing/example-data";
import { DemoWidget, OpenWidgetButton } from "./_components/DemoWidget";

export const metadata: Metadata = {
  title: "Feedback widget demo",
  description:
    "See the BuildMonday feedback widget on a sample page: one script tag, keyboard accessible, and messages go straight to your inbox.",
};

const RANKED_EXAMPLES = EXAMPLE_ISSUES.slice(0, 3).map((issue) => ({
  title: issue.title,
  meta: `Example, ${issue.mentions} mentions`,
}));

const EXAMPLE_SETTINGS = [
  { label: "Sync on mobile data", on: true },
  { label: "Sync attachments", on: false },
  { label: "Keep offline copies", on: true },
];

export default function WidgetDemoPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <AppHeader />
      <DemoWidget />

      <main id="main" className="mx-auto w-full max-w-[1160px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="space-y-6 lg:col-span-5">
            <div className="space-y-3">
              <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
                The feedback widget, on a sample page
              </h1>
              <p className="max-w-[60ch] text-lg text-ink-secondary">
                One script tag adds a Feedback button to your site. What visitors write lands in your BuildMonday inbox
                and is grouped into issues with your app reviews and Reddit threads.
              </p>
            </div>

            <div className="flex flex-wrap items-start gap-3">
              <OpenWidgetButton />
              <Button asChild variant="secondary" size="lg" leftIcon={<Code2 />}>
                <Link href="/extension?tab=widget">Add it to your site</Link>
              </Button>
            </div>

            <Callout tone="neutral" title="This is a demo">
              Messages sent from this page are not stored anywhere. Try the whole flow freely.
            </Callout>

            <div className="rounded-lg border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Things to try</h2>
              <ul className="divide-y divide-line text-sm">
                <li className="flex items-start gap-3 px-4 py-3">
                  <MousePointerClick aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span className="text-ink-secondary">Click Feedback in the bottom right corner of this window.</span>
                </li>
                <li className="flex items-start gap-3 px-4 py-3">
                  <Keyboard aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span className="text-ink-secondary">
                    Use <Kbd>Tab</Kbd> to move through the form. Focus stays inside until you close it with <Kbd>Esc</Kbd>.
                  </span>
                </li>
                <li className="flex items-start gap-3 px-4 py-3">
                  <CornerDownLeft aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span className="text-ink-secondary">Send a message to see the confirmation your visitors get.</span>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">The whole install</h2>
              <CopyField value={widgetSnippet(env.APP_URL, "pk_your_product_key")} multiline mono />
              <p className="text-xs text-ink-muted">
                Your real key is under Extension and widget once you sign in. The script is under 15 KB, runs in its own
                shadow DOM so it never inherits your styles, and loads after your page.
              </p>
            </div>
          </div>

          <div className="lg:col-span-7">
            <figure className="overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
              <div className="flex items-center gap-3 border-b border-line bg-sunken px-4 py-2.5">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="size-2.5 rounded-full bg-line-strong" />
                  <span className="size-2.5 rounded-full bg-line-strong" />
                  <span className="size-2.5 rounded-full bg-line-strong" />
                </span>
                <span className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-3 py-1 text-xs text-ink-muted">
                  acmenotes.example.com/settings/sync
                </span>
              </div>
              <div className="grid min-h-[440px] grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div aria-hidden className="hidden border-r border-line p-4 sm:block">
                  <p className="mb-3 font-display text-sm font-semibold text-ink">{EXAMPLE_PRODUCT}</p>
                  <ul className="space-y-1 text-sm text-ink-muted">
                    <li className="rounded-md px-2 py-1.5">All notes</li>
                    <li className="rounded-md px-2 py-1.5">Shared</li>
                    <li className="rounded-md bg-brand-soft px-2 py-1.5 font-medium text-brand-ink">Sync settings</li>
                    <li className="rounded-md px-2 py-1.5">Billing</li>
                  </ul>
                </div>
                <div className="space-y-6 p-5 sm:p-6">
                  <div>
                    <p className="text-xs font-medium text-ink-muted">Example product page</p>
                    <h2 className="mt-1 font-display text-xl font-semibold text-ink">Sync settings</h2>
                    <p className="mt-1 text-sm text-ink-secondary">Choose how notes sync between your devices.</p>
                  </div>
                  <div className="divide-y divide-line rounded-lg border border-line">
                    {EXAMPLE_SETTINGS.map((s) => (
                      <div key={s.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                        <span className="text-ink">{s.label}</span>
                        <span className="sr-only">{s.on ? "On" : "Off"}</span>
                        <span
                          aria-hidden
                          className={cn("inline-flex h-5 w-9 items-center rounded-full p-0.5", s.on ? "bg-brand" : "bg-line-strong")}
                        >
                          <span className={cn("size-4 rounded-full bg-surface shadow-sm", s.on && "translate-x-4")} />
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-line bg-sunken p-4">
                    <p className="text-sm font-medium text-ink">What BuildMonday would rank from messages like these</p>
                    <ol className="mt-3 space-y-2">
                      {RANKED_EXAMPLES.map((issue, i) => (
                        <li key={issue.title} className="flex items-baseline gap-3">
                          <span className="w-5 shrink-0 font-display text-lg font-semibold tabular-nums text-brand">{i + 1}</span>
                          <span className="min-w-0">
                            <span className="block text-sm text-ink">{issue.title}</span>
                            <span className="block text-xs text-ink-muted">{issue.meta}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
              <figcaption className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">
                Example page. The live widget is the button floating over this whole window.
              </figcaption>
            </figure>
          </div>
        </div>
      </main>
    </div>
  );
}
