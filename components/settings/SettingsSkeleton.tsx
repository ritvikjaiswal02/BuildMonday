import { Skeleton, SkeletonRows, SkeletonText } from "@/components/ui";

/** Placeholder shaped like settings panels: a header, then form fields or list rows. */
export function SettingsSkeleton({ sections = 2, variant = "form" }: { sections?: number; variant?: "form" | "list" }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface shadow-xs">
          <div className="space-y-2 border-b border-line px-5 py-4">
            <Skeleton className="h-5 w-40" />
            <SkeletonText lines={1} className="max-w-[48ch]" />
          </div>
          {variant === "list" ? (
            <SkeletonRows rows={3} />
          ) : (
            <div className="space-y-5 px-5 py-5">
              {Array.from({ length: 2 }, (_, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
