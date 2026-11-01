import * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line border-b-line-strong bg-surface px-1",
        "font-mono text-[11px] font-medium leading-none text-ink-secondary",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
