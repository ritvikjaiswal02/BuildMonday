import { Skeleton, SkeletonRows, SkeletonText } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading extension and widget settings">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full max-w-[520px]" />
      </div>
      <div className="flex gap-5 border-b border-line pb-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
            <Skeleton className="h-5 w-40" />
            <SkeletonText lines={4} />
          </div>
          <SkeletonRows rows={3} />
        </div>
        <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
          <Skeleton className="h-5 w-32" />
          <SkeletonText lines={6} />
        </div>
      </div>
    </div>
  );
}
