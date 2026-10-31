import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionProps {
  id?: string;
  /** "plain" sits on the canvas; "raised" uses the surface colour with hairlines top and bottom. */
  tone?: "plain" | "raised";
  className?: string;
  children: React.ReactNode;
  "aria-labelledby"?: string;
}

/** Marketing section wrapper: consistent vertical rhythm (py-20 / sm:py-28) and container. */
export function Section({ id, tone = "plain", className, children, ...rest }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={rest["aria-labelledby"]}
      className={cn(
        "scroll-mt-14 py-20 sm:py-28",
        tone === "raised" && "border-y border-line bg-surface",
        className,
      )}
    >
      <div className="container-marketing">{children}</div>
    </section>
  );
}

export interface SectionHeadingProps {
  id: string;
  title: string;
  lead?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/** Left-aligned section heading with an optional lead paragraph and a trailing action on wide screens. */
export function SectionHeading({ id, title, lead, action, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="max-w-[640px]">
        <h2 id={id} className="text-2xl font-semibold sm:text-3xl">
          {title}
        </h2>
        {lead ? <p className="mt-3 max-w-prose text-lg text-ink-secondary">{lead}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
