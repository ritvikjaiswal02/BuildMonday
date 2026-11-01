import * as React from "react";
import { ClipboardPaste, MessageSquare, MessageSquareText, Puzzle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Monochrome brand glyphs drawn in `currentColor`. Size them with classes (`size-4`).
 * Decorative by default; pass `title` to expose them as images to assistive tech.
 */
export interface GlyphProps {
  className?: string;
  title?: string;
}

function Svg({
  className,
  title,
  children,
  stroke = false,
}: GlyphProps & { children: React.ReactNode; stroke?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("size-4 shrink-0", className)}
      {...(stroke
        ? {
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.75,
            strokeLinecap: "round" as const,
            strokeLinejoin: "round" as const,
          }
        : { fill: "currentColor" })}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function GitHubGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.6-4.04-1.6-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58A12 12 0 0 0 12 .3" />
    </Svg>
  );
}

export function GoogleGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </Svg>
  );
}

export function SlackGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M5.04 15.17a2.53 2.53 0 0 1-2.52 2.52A2.53 2.53 0 0 1 0 15.17a2.53 2.53 0 0 1 2.52-2.52h2.52v2.52Zm1.27 0a2.53 2.53 0 0 1 2.52-2.52 2.53 2.53 0 0 1 2.52 2.52v6.31A2.53 2.53 0 0 1 8.83 24a2.53 2.53 0 0 1-2.52-2.52v-6.31ZM8.83 5.04a2.53 2.53 0 0 1-2.52-2.52A2.53 2.53 0 0 1 8.83 0a2.53 2.53 0 0 1 2.52 2.52v2.52H8.83Zm0 1.27a2.53 2.53 0 0 1 2.52 2.52 2.53 2.53 0 0 1-2.52 2.52H2.52A2.53 2.53 0 0 1 0 8.83a2.53 2.53 0 0 1 2.52-2.52h6.31Zm10.13 2.52a2.53 2.53 0 0 1 2.52-2.52A2.53 2.53 0 0 1 24 8.83a2.53 2.53 0 0 1-2.52 2.52h-2.52V8.83Zm-1.27 0a2.53 2.53 0 0 1-2.52 2.52 2.53 2.53 0 0 1-2.52-2.52V2.52A2.53 2.53 0 0 1 15.17 0a2.53 2.53 0 0 1 2.52 2.52v6.31Zm-2.52 10.13a2.53 2.53 0 0 1 2.52 2.52A2.53 2.53 0 0 1 15.17 24a2.53 2.53 0 0 1-2.52-2.52v-2.52h2.52Zm0-1.27a2.53 2.53 0 0 1-2.52-2.52 2.53 2.53 0 0 1 2.52-2.52h6.31A2.53 2.53 0 0 1 24 15.17a2.53 2.53 0 0 1-2.52 2.52h-6.31Z" />
    </Svg>
  );
}

export function LinearGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M2.89 4.18A11.98 11.98 0 0 1 11.99 0C18.62 0 24 5.38 24 12.01c0 3.64-1.62 6.9-4.18 9.1L2.89 4.18Zm-1.07 1.45 16.55 16.55c-.52.33-1.07.62-1.65.87L.95 7.28c.25-.58.54-1.13.87-1.65ZM.32 9.16l14.52 14.52c-.71.17-1.44.28-2.2.32L0 11.36c.04-.76.15-1.49.32-2.2Zm-.17 4.86 9.83 9.83A12.02 12.02 0 0 1 .15 14.02Z" />
    </Svg>
  );
}

export function NotionGlyph(props: GlyphProps) {
  return (
    <Svg {...props} stroke>
      <path d="M5 3.5h10.5L19.5 7v13.5H5Z" />
      <path d="M15.5 3.5V7h4" />
      <path d="M9 17V9.5l6 7.5V9.5" />
    </Svg>
  );
}

export function AppStoreGlyph(props: GlyphProps) {
  return (
    <Svg {...props} stroke>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <path d="m12.6 7.2-4.9 8.6" />
      <path d="m11.4 7.2 4.9 8.6" />
      <path d="M7 13.4h5.2" />
      <path d="M14.2 13.4H17" />
    </Svg>
  );
}

export function PlayStoreGlyph(props: GlyphProps) {
  return (
    <Svg {...props} stroke>
      <path d="M5 3.6v16.8a.6.6 0 0 0 .9.52l14.3-8.4a.6.6 0 0 0 0-1.04L5.9 3.08a.6.6 0 0 0-.9.52Z" />
      <path d="m5.3 3.3 9.4 8.7-9.4 8.7" />
    </Svg>
  );
}

export function RedditGlyph(props: GlyphProps) {
  return (
    <Svg {...props} stroke>
      <ellipse cx="12" cy="14.5" rx="8" ry="5.5" />
      <path d="m12 9 1.2-5 3.6.9" />
      <circle cx="18.3" cy="5.2" r="1.4" />
      <circle cx="9" cy="14" r="0.6" fill="currentColor" />
      <circle cx="15" cy="14" r="0.6" fill="currentColor" />
      <path d="M9.5 17c1.5.9 3.5.9 5 0" />
      <path d="M5.4 11.3a2 2 0 1 1 2.3-2.6" />
      <path d="M18.6 11.3a2 2 0 1 0-2.3-2.6" />
    </Svg>
  );
}

export function HackerNewsGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M0 24V0h24v24H0ZM6.95 5.9l4.11 7.7v5.07h1.59V13.7l4.15-7.8h-1.75l-2.46 4.87c-.37.75-.69 1.44-.69 1.44s-.3-.71-.65-1.44L8.83 5.9H6.95Z" />
    </Svg>
  );
}

export function TrustpilotGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="m12 17.96 5.21-1.32 2.18 6.71L12 17.96ZM24 9.29h-9.18L12 .64 9.18 9.29H0l7.43 5.36-2.82 8.64 7.43-5.36 4.57-3.28L24 9.29Z" />
    </Svg>
  );
}

export function ChromeGlyph(props: GlyphProps) {
  return (
    <Svg {...props} stroke>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="M21.17 8H12" />
      <path d="M3.95 6.06 8.54 14" />
      <path d="M10.88 21.94 15.46 14" />
    </Svg>
  );
}

export function G2Glyph(props: GlyphProps) {
  return (
    <Svg {...props} stroke>
      <path d="M17.6 17.2A8 8 0 1 1 15.4 5" />
      <path d="M12.2 12.6h5.6l-2.2 4" />
      <path d="M17.2 4.2a1.5 1.5 0 0 1 2.9.6c0 .9-1.1 1.4-2.9 2.8h3" />
    </Svg>
  );
}

export function XGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.59-6.64 7.59H.47l8.6-9.83L0 1.15h7.59l5.25 6.94 6.06-6.94Zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41Z" />
    </Svg>
  );
}

/** A circle with a P, after the Product Hunt mark; monochrome like the others. */
export function ProductHuntGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M12 0a12 12 0 1 1 0 24 12 12 0 0 1 0-24Zm1.6 7.2H9v9.6h2.4v-2.88h2.2a3.36 3.36 0 1 0 0-6.72Zm0 2.4a.96.96 0 1 1 0 1.92h-2.2V9.6h2.2Z"
      />
    </Svg>
  );
}

const SOURCE_GLYPHS: Record<string, (props: GlyphProps) => React.ReactElement> = {
  producthunt: ProductHuntGlyph,
  appstore: AppStoreGlyph,
  playstore: PlayStoreGlyph,
  reddit: RedditGlyph,
  hackernews: HackerNewsGlyph,
  hn: HackerNewsGlyph,
  trustpilot: TrustpilotGlyph,
  g2: G2Glyph,
  x: XGlyph,
  twitter: XGlyph,
  github: GitHubGlyph,
  slack: SlackGlyph,
  linear: LinearGlyph,
  notion: NotionGlyph,
  chrome: ChromeGlyph,
};

const SOURCE_TITLES: Record<string, string> = {
  appstore: "App Store",
  playstore: "Google Play",
  reddit: "Reddit",
  hackernews: "Hacker News",
  hn: "Hacker News",
  trustpilot: "Trustpilot",
  widget: "Website widget",
  extension: "Chrome extension",
  manual: "Pasted",
  import: "Imported",
  g2: "G2",
  producthunt: "Product Hunt",
  x: "X",
  twitter: "X",
};

export interface SourceGlyphProps {
  kind: string;
  className?: string;
  /** Accessible name; pass when the glyph is the only label for the source. */
  title?: string;
}

/** Glyph for any feedback source kind. Unknown kinds fall back to a speech bubble. */
export function SourceGlyph({ kind, className, title }: SourceGlyphProps) {
  const key = kind.toLowerCase();
  const Glyph = SOURCE_GLYPHS[key];
  if (Glyph) return <Glyph className={className} title={title} />;

  const Icon =
    key === "widget"
      ? MessageSquareText
      : key === "extension"
        ? Puzzle
        : key === "manual" || key === "import"
          ? ClipboardPaste
          : MessageSquare;

  return (
    <Icon
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? "img" : undefined}
      strokeWidth={1.75}
    />
  );
}

/** Human label for a source kind, matching the glyph. */
export function sourceKindLabel(kind: string): string {
  return SOURCE_TITLES[kind.toLowerCase()] ?? kind;
}
