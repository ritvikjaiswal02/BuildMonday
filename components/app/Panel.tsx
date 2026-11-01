import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Titled section of an app page. `framed` wraps the body in the standard
 * bordered surface; unframed sections let their own list provide the frame.
 */
export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
  headingLevel = 2,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <Heading id={headingId} className="font-display text-xl font-semibold text-ink">
            {title}
          </Heading>
          {description ? <p className="mt-0.5 max-w-[72ch] text-sm text-ink-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Bordered side-column panel with a small header row. */
export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-line bg-surface shadow-xs", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
