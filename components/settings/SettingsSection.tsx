import * as React from "react";
import { cn } from "@/lib/utils";

export interface SettingsSectionProps {
  id: string;
  title: string;
  description?: React.ReactNode;
  /** Right side of the header, e.g. an "Add source" button. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Bottom bar, e.g. the Save button. */
  footer?: React.ReactNode;
  tone?: "default" | "danger";
  /** Remove body padding for edge-to-edge lists. */
  flush?: boolean;
  className?: string;
}

/** One settings panel: a header with title and description, a body and an optional footer bar. */
export function SettingsSection({
  id,
  title,
  description,
  actions,
  children,
  footer,
  tone = "default",
  flush = false,
  className,
}: SettingsSectionProps) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "scroll-mt-24 rounded-lg border bg-surface shadow-xs",
        tone === "danger" ? "border-danger/30" : "border-line",
        className,
      )}
    >
      <header className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 id={headingId} className={cn("font-display text-lg font-semibold", tone === "danger" ? "text-danger-ink" : "text-ink")}>
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

/** Label + description on the left, control on the right; used for switches and single settings. */
export function SettingRow({
  title,
  description,
  htmlFor,
  control,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  htmlFor?: string;
  control: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-6", className)}>
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
            {title}
          </label>
        ) : (
          <p className="text-sm font-medium text-ink">{title}</p>
        )}
        {description ? <div className="mt-0.5 text-sm text-ink-muted">{description}</div> : null}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}
