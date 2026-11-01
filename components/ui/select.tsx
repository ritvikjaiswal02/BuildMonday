import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase, fieldInvalid } from "./input";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Native `<select>` with token styling. Native keeps mobile pickers and accessibility for free. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <div className={cn("relative w-full", className)}>
      <select
        ref={ref}
        aria-invalid={invalid || props["aria-invalid"] || undefined}
        className={cn(
          fieldBase,
          "h-9 cursor-pointer appearance-none truncate pl-3 pr-9",
          invalid && fieldInvalid,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
});
