import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceGlyph, sourceKindLabel } from "@/components/brand/logos";
import { MondayListArtifact } from "./MondayListArtifact";
import { START_FREE_HREF } from "./pricing";

const HERO_SOURCES = ["appstore", "playstore", "reddit", "hn", "trustpilot", "widget"];

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="pb-20 pt-12 sm:pb-28 sm:pt-20">
      <div className="container-marketing grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <h1
            id="hero-title"
            className="text-[40px] font-semibold leading-[44px] tracking-[-0.03em] sm:text-5xl"
          >
            Know what to build on Monday.
          </h1>
          <p className="mt-5 max-w-[52ch] text-lg text-ink-secondary">
            BuildMonday reads your app reviews, Reddit threads, Hacker News comments and website feedback every
            day, groups them into ranked engineering issues, and sends your team the list every Monday morning.
          </p>

          <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            {signedIn ? (
              <Button asChild variant="primary" size="lg">
                <Link href="/dashboard">Open your dashboard</Link>
              </Button>
            ) : (
              <Button asChild variant="primary" size="lg">
                <Link href={START_FREE_HREF}>Start free</Link>
              </Button>
            )}
            <Button asChild variant="secondary" size="lg" leftIcon={<FlaskConical aria-hidden />}>
              <Link href="/app">Try it without an account</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-ink-muted">Includes 14 days of Pro. No card needed.</p>

          <div className="mt-10 border-t border-line pt-5">
            <p className="text-xs font-medium text-ink-muted">Reads feedback from</p>
            <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-ink-secondary">
              {HERO_SOURCES.map((kind) => (
                <li key={kind} className="inline-flex items-center gap-1.5 text-sm">
                  <SourceGlyph kind={kind} className="size-4" />
                  {kind === "widget" ? "Your website" : sourceKindLabel(kind)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="lg:col-span-7">
          <MondayListArtifact />
        </div>
      </div>
    </section>
  );
}
