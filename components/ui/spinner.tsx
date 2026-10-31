import { cn } from "@/lib/utils";

export interface SpinnerProps {
  size?: "sm" | "md";
  className?: string;
  /** Accessible label. When omitted the spinner is decorative (aria-hidden). */
  label?: string;
}

const SIZES = { sm: 14, md: 18 } as const;

/** A quiet ring spinner that inherits `currentColor`. */
export function Spinner({ size = "md", className, label }: SpinnerProps) {
  const px = SIZES[size];
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        className="animate-spin"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}
