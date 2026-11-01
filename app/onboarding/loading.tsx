import { Skeleton, SkeletonText } from "@/components/ui";

export default function OnboardingLoading() {
  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,640px)] lg:gap-16" aria-busy="true" aria-label="Loading setup">
      <div className="hidden space-y-3 lg:block">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-8 w-72 max-w-full" />
          <SkeletonText lines={2} className="max-w-[60ch]" />
        </div>
        <div className="space-y-6">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
