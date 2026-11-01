import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** `md` (default) is left-aligned for wide panels; `sm` is centered for narrow cards. */
  size?: "sm" | "md";
  /** 2 (default) right under a page h1; 3 inside an h2 section or panel. */
  headingLevel?: 2 | 3;
  className?: string;
}

/** Icon, title, one sentence, one primary action. Never a blank panel. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = "md",
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const centered = size === "sm";
  const H = headingLevel === 3 ? "h3" : "h2";
  return (
    <div
      className={cn(
        "flex flex-col",
        centered ? "items-center px-4 py-8 text-center" : "items-start px-5 py-10 sm:px-8 sm:py-12",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "mb-4 inline-flex items-center justify-center rounded-md border border-line bg-sunken text-ink-muted",
            centered ? "size-10" : "size-11",
          )}
        >
          <Icon aria-hidden className="size-5" strokeWidth={1.75} />
        </span>
      ) : null}
      <H className={cn("font-display font-semibold text-ink", centered ? "text-base" : "text-lg")}>{title}</H>
      {description ? (
        <div className={cn("mt-1 text-sm text-ink-muted", centered ? "max-w-[36ch]" : "max-w-[56ch]")}>
          {description}
        </div>
      ) : null}
      {action || secondaryAction ? (
        <div className={cn("mt-5 flex flex-wrap items-center gap-2", centered && "justify-center")}>
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
