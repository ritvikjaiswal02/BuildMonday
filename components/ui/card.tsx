import * as React from "react";
import { cn } from "@/lib/utils";

type CardElement = "div" | "section" | "article" | "li";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "sunken" | "outline";
  padding?: "none" | "sm" | "md" | "lg";
  as?: CardElement;
}

const VARIANTS = {
  default: "border border-line bg-surface shadow-xs",
  sunken: "border border-line bg-sunken",
  outline: "border border-line bg-transparent",
} as const;

const PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
} as const;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = "default", padding = "md", as = "div", ...props },
  ref,
) {
  const Comp = as as React.ElementType;
  return (
    <Comp
      ref={ref}
      className={cn("rounded-lg text-ink", VARIANTS[variant], PADDING[padding], className)}
      {...props}
    />
  );
});

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}
      {...props}
    />
  );
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h2" | "h3" | "h4" | "p";
}

export function CardTitle({ className, as = "h3", ...props }: CardTitleProps) {
  const Comp = as;
  return (
    <Comp className={cn("font-display text-base font-semibold text-ink", className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("max-w-[72ch] text-sm text-ink-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4",
        className,
      )}
      {...props}
    />
  );
}
