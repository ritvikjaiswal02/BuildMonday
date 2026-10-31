import * as React from "react";
import { cn } from "@/lib/utils";

export interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * The BuildMonday mark: a cobalt tile holding a ranked list, three rows that get
 * shorter as priority drops, with the top row's rank marker set apart.
 */
export function LogoMark({ size = 24, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <rect width="24" height="24" rx="6" className="fill-brand" />
      <rect x="5.5" y="6.5" width="2.5" height="2.5" rx="0.75" className="fill-on-brand" />
      <rect x="9.5" y="6.5" width="9" height="2.5" rx="1.25" className="fill-on-brand" />
      <rect x="5.5" y="10.75" width="2.5" height="2.5" rx="0.75" className="fill-on-brand" opacity="0.7" />
      <rect x="9.5" y="10.75" width="6.5" height="2.5" rx="1.25" className="fill-on-brand" opacity="0.7" />
      <rect x="5.5" y="15" width="2.5" height="2.5" rx="0.75" className="fill-on-brand" opacity="0.45" />
      <rect x="9.5" y="15" width="4" height="2.5" rx="1.25" className="fill-on-brand" opacity="0.45" />
    </svg>
  );
}

export interface WordmarkProps {
  className?: string;
  showMark?: boolean;
}

/** "BuildMonday" in the display face, one weight, one colour. */
export function Wordmark({ className, showMark = true }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      {showMark ? <LogoMark size={22} /> : null}
      <span className="font-display text-[17px] font-semibold leading-none tracking-[-0.02em]">
        BuildMonday
      </span>
    </span>
  );
}
