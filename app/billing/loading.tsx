import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="h-full rounded-lg border border-line bg-surface p-5 shadow-xs sm:p-6">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-4 h-8 w-32" />
      <SkeletonText lines={2} className="mt-4 max-w-[360px]" />
      <div className="mt-6 space-y-5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BillingLoading() {
  return (
    <div role="status" aria-label="Loading billing" className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-full max-w-[420px]" />
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <PanelSkeleton rows={2} />
        </div>
        <div className="lg:col-span-7">
          <PanelSkeleton rows={5} />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className={i ? "space-y-4 border-t border-line p-6 md:border-l md:border-t-0" : "space-y-4 p-6"}>
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-full rounded-md" />
              <SkeletonText lines={4} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
