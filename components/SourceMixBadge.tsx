import { SourceGlyph } from "@/components/brand/logos";
import { SOURCE_LABELS, isSource, type SourceMix } from "@/lib/types";
import { sourceMixEntries } from "@/components/app/adapters";
import { cn } from "@/lib/utils";

/**
 * Where an issue's reports came from, as glyph and count chips. Used in
 * analyzer rows; the issue page uses the fuller SourceMixBar.
 */
export function SourceMixBadge({ mix, className }: { mix: SourceMix; className?: string }) {
  const entries = sourceMixEntries(mix);
  if (entries.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="Reports by source">
      {entries.map(({ kind, count }) => {
        const label = isSource(kind) ? SOURCE_LABELS[kind] : kind;
        return (
          <li
            key={kind}
            className="inline-flex h-6 items-center gap-1.5 rounded border border-line bg-surface px-1.5 text-xs text-ink-secondary"
          >
            <SourceGlyph kind={kind} className="size-3.5 text-ink-muted" />
            <span className="sr-only">{label}:</span>
            <span aria-hidden className="hidden sm:inline">
              {label}
            </span>
            <span className="tabular-nums text-ink">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}
