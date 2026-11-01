import { SourceGlyph } from "@/components/brand/logos";
import { Section, SectionHeading } from "./Section";

const SOURCES = [
  {
    kind: "appstore",
    name: "App Store",
    text: "One to three star reviews from the country stores your users are in.",
  },
  {
    kind: "playstore",
    name: "Google Play",
    text: "Recent low-star reviews, including the ones that mention a specific release.",
  },
  {
    kind: "reddit",
    name: "Reddit",
    text: "New posts in the subreddits you choose that mention your product or keywords.",
  },
  {
    kind: "hn",
    name: "Hacker News",
    text: "Stories and comments that match your keywords, from launch threads to Ask HN.",
  },
  {
    kind: "trustpilot",
    name: "Trustpilot",
    text: "Reviews on your Trustpilot page, which often describe billing and support problems.",
  },
  {
    kind: "widget",
    name: "Your website",
    text: "A small feedback button you add with one script tag. Messages go straight to your inbox.",
  },
  {
    kind: "extension",
    name: "Chrome extension",
    text: "Clip a selection or capture a whole review page from G2, X, Product Hunt and more.",
  },
  {
    kind: "manual",
    name: "Anything you paste",
    text: "Support emails, sales call notes or a spreadsheet export. Paste it into the inbox.",
  },
];

export function SourcesSection() {
  return (
    <Section aria-labelledby="sources-title" tone="raised">
      <SectionHeading
        id="sources-title"
        title="Where it listens"
        lead="Your users already told you what is broken. It is spread across stores, forums and your own website, and nobody has time to read all of it every week."
      />
      <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {SOURCES.map((source) => (
          <li key={source.kind} className="flex gap-3 border-t border-line pt-5">
            <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink">
              <SourceGlyph kind={source.kind} className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="font-sans text-base font-medium text-ink">{source.name}</h3>
              <p className="mt-1 text-sm text-ink-muted">{source.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
