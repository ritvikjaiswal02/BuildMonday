import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionProps {
  id: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Remove body padding for edge-to-edge lists. */
  flush?: boolean;
  className?: string;
}

/** A bordered panel with a titled header, a body and an optional footer bar. */
export function Section({ id, title, description, actions, children, footer, flush = false, className }: SectionProps) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-24 rounded-lg border border-line bg-surface shadow-xs", className)}
    >
      <header className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          {description ? <div className="mt-1 max-w-[64ch] text-sm text-ink-muted">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={flush ? undefined : "px-4 py-5 sm:px-5"}>{children}</div>
      {footer ? (
        <div className="flex flex-col-reverse gap-2 rounded-b-lg border-t border-line bg-sunken/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/** Numbered sequence for install steps. */
export function Steps({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ol className={cn("divide-y divide-line", className)}>{children}</ol>;
}

export function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-soft font-display text-sm font-semibold tabular-nums text-brand-ink"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="text-sm font-semibold text-ink">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h3>
        {children ? <div className="space-y-3 text-sm text-ink-secondary">{children}</div> : null}
      </div>
    </li>
  );
}
