import { cn } from "@/lib/utils";

export interface SkeletonProps {
  className?: string;
}

/** Placeholder block. Size it with classes shaped like the content it replaces. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn("skeleton h-4 rounded", className)} />;
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

const LINE_WIDTHS = ["w-full", "w-[92%]", "w-[84%]", "w-[96%]", "w-[70%]"];

/** A paragraph placeholder; the last line is shorter, like real text. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn(
            "skeleton h-3.5 rounded-sm",
            i === lines - 1 && lines > 1 ? "w-[58%]" : LINE_WIDTHS[i % LINE_WIDTHS.length],
          )}
        />
      ))}
    </div>
  );
}

export interface SkeletonRowsProps {
  rows?: number;
  className?: string;
}

/** List-row placeholder matching the rank/title/meta row pattern used across the app. */
export function SkeletonRows({ rows = 5, className }: SkeletonRowsProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface", className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="skeleton size-7 shrink-0 rounded" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className={cn("skeleton h-3.5 rounded-sm", i % 2 ? "w-[52%]" : "w-[68%]")} />
            <div className={cn("skeleton h-3 rounded-sm", i % 3 ? "w-[36%]" : "w-[44%]")} />
          </div>
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            {Array.from({ length: 5 }, (_, j) => (
              <div key={j} className="skeleton h-2 w-3 rounded-sm" />
            ))}
          </div>
          <div className="skeleton hidden h-6 w-16 shrink-0 rounded sm:block" />
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}
