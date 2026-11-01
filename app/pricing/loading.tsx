import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function PricingLoading() {
  return (
    <div className="min-h-dvh bg-canvas" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading pricing</span>
      <div className="h-14 border-b border-line bg-surface" />
      <div className="container-marketing pb-20 pt-12 sm:pt-20">
        <Skeleton className="h-11 w-48" />
        <SkeletonText lines={2} className="mt-5 max-w-[560px]" />
        <div className="mt-10 flex gap-3">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="mt-6 grid overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-4 border-line p-6 [&:not(:first-child)]:border-t lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:border-t-0">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-9 w-full" />
              <SkeletonText lines={4} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
