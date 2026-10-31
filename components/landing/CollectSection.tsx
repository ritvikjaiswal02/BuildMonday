import Link from "next/link";
import { MessageSquareText, MousePointerClick, ScanText } from "lucide-react";
import { ChromeGlyph, SourceGlyph } from "@/components/brand/logos";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Section, SectionHeading } from "./Section";

const CAPTURE_SITES = [
  { kind: "playstore", name: "Google Play" },
  { kind: "appstore", name: "App Store" },
  { kind: "reddit", name: "Reddit" },
  { kind: "hn", name: "Hacker News" },
  { kind: "trustpilot", name: "Trustpilot" },
  { kind: "g2", name: "G2" },
  { kind: "producthunt", name: "Product Hunt" },
  { kind: "x", name: "X" },
];

/**
 * The real widget snippet, one attribute per line so it reads without scrolling.
 * Owners copy theirs, with their own key, from the Extension and widget page.
 */
export function widgetSnippet(appUrl: string, key = "pk_your_public_key"): string {
  const src = `${appUrl.replace(/\/+$/, "")}/widget.js`;
  return [`<script`, `  src="${src}"`, `  data-key="${key}"`, `  async`, `></script>`].join("\n");
}

export function CollectSection({ appUrl }: { appUrl: string }) {
  return (
    <Section aria-labelledby="collect-title">
      <SectionHeading
        id="collect-title"
        title="Collect it yourself"
        lead="Some of the best feedback never reaches a public page. Two small tools bring it into the same inbox, where it is ranked with everything else."
      />

      <div className="mt-12 grid grid-cols-1 overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-2">
        <div className="flex flex-col p-5 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-canvas text-ink">
              <MessageSquareText aria-hidden className="size-4" />
            </span>
            <h3 className="text-xl font-semibold">A feedback button for your website</h3>
          </div>
          <p className="mt-4 max-w-prose text-base text-ink-secondary">
            Add one script tag and visitors get a small Feedback button. It opens a panel that works with the
            keyboard and screen readers, and it does not touch your page styles.
          </p>
          <div className="mt-6">
            <CopyField label="Your snippet" value={widgetSnippet(appUrl)} multiline mono />
            <p className="mt-2 text-xs text-ink-muted">
              Your own public key is on the Extension and widget page after you sign up.
            </p>
          </div>
          <div className="mt-auto pt-6">
            <Button asChild variant="secondary" size="sm">
              <Link href="/widget-demo">See it on a sample page</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-col border-t border-line p-5 sm:p-8 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-canvas text-ink">
              <ChromeGlyph className="size-4" />
            </span>
            <h3 className="text-xl font-semibold">A Chrome extension for everything else</h3>
          </div>
          <p className="mt-4 max-w-prose text-base text-ink-secondary">
            Found a complaint in a support ticket, a tweet or a G2 review? Send it to BuildMonday without
            copying and pasting.
          </p>
          <ul className="mt-6 space-y-4">
            <li className="flex gap-3">
              <MousePointerClick aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
              <div>
                <p className="text-sm font-medium text-ink">Clip a selection</p>
                <p className="text-sm text-ink-muted">Select text on any page, right-click, choose Clip to BuildMonday.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <ScanText aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
              <div>
                <p className="text-sm font-medium text-ink">Capture a review page</p>
                <p className="text-sm text-ink-muted">
                  On supported sites, capture up to 100 visible reviews in one click, with ratings and links.
                </p>
              </div>
            </li>
          </ul>
          <div className="mt-6 border-t border-line pt-5">
            <p className="text-xs font-medium text-ink-muted">Captures reviews on</p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {CAPTURE_SITES.map((site) => (
                <li key={site.kind} className="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
                  <SourceGlyph kind={site.kind} className="size-3.5" />
                  {site.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
