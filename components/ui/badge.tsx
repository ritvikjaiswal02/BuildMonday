import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";
export type BadgeVariant = "soft" | "outline" | "solid";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  /** Small leading dot in the tone colour. */
  dot?: boolean;
  size?: "sm" | "md";
  icon?: LucideIcon;
}

const STYLES: Record<BadgeVariant, Record<BadgeTone, string>> = {
  soft: {
    neutral: "bg-sunken text-ink-secondary",
    brand: "bg-brand-soft text-brand-ink",
    success: "bg-success-soft text-success-ink",
    warning: "bg-warning-soft text-warning-ink",
    danger: "bg-danger-soft text-danger-ink",
  },
  outline: {
    neutral: "border border-line-strong text-ink-secondary",
    brand: "border border-brand/40 text-brand",
    success: "border border-success/40 text-success",
    warning: "border border-warning/40 text-warning",
    danger: "border border-danger/40 text-danger",
  },
  solid: {
    neutral: "bg-ink text-canvas",
    brand: "bg-brand text-on-brand",
    success: "bg-success text-on-brand",
    warning: "bg-warning text-on-brand",
    danger: "bg-danger text-on-brand",
  },
};

const DOT: Record<BadgeTone, string> = {
  neutral: "bg-ink-faint",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const SIZES = {
  sm: "h-5 gap-1 px-1.5 text-xs [&_svg]:size-3",
  md: "h-6 gap-1.5 px-2 text-xs [&_svg]:size-3.5",
} as const;

/** Small status label. Always carries a word: colour is never the only signal. */
export function Badge({
  tone = "neutral",
  variant = "soft",
  dot = false,
  size = "md",
  icon: Icon,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded font-medium leading-none",
        SIZES[size],
        STYLES[variant][tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            variant === "solid" ? "bg-current" : DOT[tone],
          )}
        />
      ) : null}
      {Icon ? <Icon aria-hidden className="shrink-0" /> : null}
      {children}
    </span>
  );
}
