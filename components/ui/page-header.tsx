import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
  /** Quiet line under the title, e.g. "Last run 3 h ago". */
  meta?: React.ReactNode;
  className?: string;
}

/** Renders the page `h1`, optional breadcrumb, description, meta and right-aligned actions. */
export function PageHeader({ title, description, actions, breadcrumb, meta, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
              {breadcrumb.map((item, i) => {
                const last = i === breadcrumb.length - 1;
                return (
                  <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
                    {item.href && !last ? (
                      <Link
                        href={item.href}
                        className="focus-ring rounded-sm transition-colors duration-120 hover:text-ink"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span aria-current={last ? "page" : undefined} className="max-w-[32ch] truncate">
                        {item.label}
                      </span>
                    )}
                    {!last ? <ChevronRight aria-hidden className="size-3.5 text-ink-faint" /> : null}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}
        <h1 className="break-words font-display text-2xl font-semibold text-ink">{title}</h1>
        {description ? (
          <div className="max-w-[72ch] text-base text-ink-secondary">{description}</div>
        ) : null}
        {meta ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">{meta}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </header>
  );
}
