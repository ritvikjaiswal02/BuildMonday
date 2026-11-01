import * as React from "react";
import { SourceGlyph, sourceKindLabel } from "@/components/brand/logos";
import { cn, formatNumber } from "@/lib/utils";
import { sourceMixEntries } from "./adapters";

/** Literal class names so Tailwind keeps them (data colours from the design tokens). */
const SOURCE_BG: Record<string, string> = {
  appstore: "bg-source-appstore",
  playstore: "bg-source-playstore",
  reddit: "bg-source-reddit",
  hn: "bg-source-hn",
  hackernews: "bg-source-hackernews",
  trustpilot: "bg-source-trustpilot",
  widget: "bg-source-widget",
  extension: "bg-source-extension",
  manual: "bg-source-manual",
  import: "bg-source-import",
};

export function sourceDotClass(kind: string): string {
  return SOURCE_BG[kind] ?? "bg-ink-faint";
}

/** Stacked bar of where an issue's reports came from, with a labelled legend. */
export function SourceMixBar({
  mix,
  className,
}: {
  mix: Partial<Record<string, number>> | null | undefined;
  className?: string;
}) {
  const entries = sourceMixEntries(mix ?? {});
  if (entries.length === 0) {
    return <p className={cn("text-sm text-ink-muted", className)}>No source breakdown yet.</p>;
  }
  return (
    <div className={cn("space-y-3", className)}>
      <div aria-hidden className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-sunken">
        {entries.map((e) => (
          <span key={e.kind} className={cn("h-full", sourceDotClass(e.kind))} style={{ width: `${Math.max(2, e.share * 100)}%` }} />
        ))}
      </div>
      <ul className="space-y-1.5">
        {entries.map((e) => (
          <li key={e.kind} className="flex items-center gap-2 text-sm">
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", sourceDotClass(e.kind))} />
            <SourceGlyph kind={e.kind} className="size-3.5 text-ink-muted" />
            <span className="flex-1 text-ink-secondary">{sourceKindLabel(e.kind)}</span>
            <span className="tabular-nums text-ink">{formatNumber(e.count)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-ink-muted">{Math.round(e.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
