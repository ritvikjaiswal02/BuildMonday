"use client";

import * as React from "react";
import Link from "next/link";
import { Download, MousePointerClick } from "lucide-react";
import { UsageMeter } from "@/components/billing";
import { ChromeGlyph, SourceGlyph } from "@/components/brand/logos";
import { Button, Callout, CopyField, Kbd } from "@/components/ui";
import type { PlanId } from "@/lib/plans";
import type { ExtensionTokenRow } from "@/app/api/extension/_lib/service";
import { ConnectBrowser } from "./ConnectBrowser";
import { Section, Step, Steps } from "./Section";
import { TokenManager } from "./TokenManager";

const SITES: Array<{ kind: string; name: string; what: string }> = [
  { kind: "playstore", name: "Google Play", what: "App reviews, including the All reviews dialog" },
  { kind: "appstore", name: "App Store", what: "Ratings and reviews on app pages" },
  { kind: "reddit", name: "Reddit", what: "Posts and comments, new and old Reddit" },
  { kind: "hackernews", name: "Hacker News", what: "Every comment in a thread" },
  { kind: "trustpilot", name: "Trustpilot", what: "Reviews on company pages" },
  { kind: "g2", name: "G2", what: "Product reviews" },
  { kind: "producthunt", name: "Product Hunt", what: "Reviews and launch comments" },
  { kind: "x", name: "X", what: "Posts and replies" },
];

export interface ExtensionPanelProps {
  appUrl: string;
  plan: PlanId;
  initialTokens: ExtensionTokenRow[];
  clips: { used: number; max: number };
  hasProducts: boolean;
  /** Set when the packaged extension has a fixed id (EXTENSION_PUBLIC_KEY + NEXT_PUBLIC_EXTENSION_ID). */
  extensionId?: string | null;
}

export function ExtensionPanel({ appUrl, initialTokens, clips, hasProducts, extensionId = null }: ExtensionPanelProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0 space-y-6">
        {!hasProducts ? (
          <Callout
            tone="warning"
            title="Add a product before you clip"
            action={
              <Button asChild size="sm" variant="secondary">
                <Link href="/onboarding?new=1">Add product</Link>
              </Button>
            }
          >
            Clips are saved to a product&apos;s inbox. You can install the extension now and pick the product once it exists.
          </Callout>
        ) : null}

        <Section
          id="install"
          title="Install the extension"
          description="About two minutes. Works in Chrome, Edge, Brave and Arc."
        >
          {extensionId ? (
            <div className="mb-5">
              <ConnectBrowser extensionId={extensionId} appUrl={appUrl} />
            </div>
          ) : null}
          <Steps>
            <Step n={1} title="Download the extension">
              <p>
                Unzip it into a folder you will keep. This copy points at {hostOf(appUrl)} and is already connected to
                this workspace.
              </p>
              <Button asChild variant="primary" leftIcon={<Download />}>
                <a href="/api/extension/download" download="buildmonday-extension.zip">
                  Download extension
                </a>
              </Button>
            </Step>
            <Step n={2} title="Open your extensions page">
              <p>Browsers do not allow links to this page, so copy the address into a new tab. Then turn on Developer mode in the top right corner.</p>
              <div className="max-w-[360px]">
                <CopyField value="chrome://extensions" label="Address" />
              </div>
            </Step>
            <Step n={3} title="Load it">
              <p>
                Click Load unpacked and choose the unzipped <span className="font-mono text-[12.5px]">buildmonday-extension</span> folder.
                Its settings open and show which workspace it is connected to. That is it.
              </p>
            </Step>
          </Steps>
          <details className="group mt-5 rounded-md border border-line px-4 py-3 text-sm">
            <summary className="focus-ring cursor-pointer rounded-sm font-medium text-ink-secondary marker:text-ink-muted hover:text-ink">
              Installed a copy from somewhere else?
            </summary>
            <div className="mt-3 space-y-3 text-ink-muted">
              <p>Create a token below, paste it into the extension&apos;s settings with this server address, and click Connect.</p>
              <div className="max-w-[420px]">
                <CopyField value={appUrl} label="Server address" />
              </div>
            </div>
          </details>
        </Section>

        <TokenManager appUrl={appUrl} initialTokens={initialTokens} />
      </div>

      <aside className="min-w-0 space-y-6 lg:sticky lg:top-24">
        <Section id="clips" title="This month">
          <div className="space-y-4">
            <UsageMeter label="Extension clips" used={clips.used} limit={clips.max} unit="clips" />
            <p className="text-sm text-ink-muted">
              Clipping the same review twice stores it once and counts once.
            </p>
          </div>
        </Section>

        <Section id="sites" title="What you can clip" flush>
          <ul className="divide-y divide-line">
            <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <MousePointerClick aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-ink">Any page</p>
                <p className="text-ink-muted">
                  Select text, right-click, Clip to BuildMonday. Or press <Kbd>Alt</Kbd> <Kbd>Shift</Kbd> <Kbd>B</Kbd>.
                  Works in support inboxes, email and docs.
                </p>
              </div>
            </li>
            {SITES.map((s) => (
              <li key={s.kind} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <SourceGlyph kind={s.kind} className="mt-0.5 size-4 shrink-0 text-ink-secondary" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-ink">{s.name}</p>
                  <p className="text-ink-muted">{s.what}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <p className="flex items-start gap-2 px-1 text-xs text-ink-muted">
          <ChromeGlyph className="mt-0.5 size-3.5 shrink-0" />
          The extension reads a page only when you clip or capture, and keeps its token in this browser only.
        </p>
      </aside>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
