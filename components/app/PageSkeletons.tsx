import * as React from "react";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

/** Page-shaped placeholders for loading.tsx files. */

function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 rounded" />
        <Skeleton className="h-4 w-72 max-w-full rounded-sm" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }, (_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-md" />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-8">
      <HeaderSkeleton actions={2} />
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-8">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2 bg-surface px-5 py-4">
                <Skeleton className="h-3 w-24 rounded-sm" />
                <Skeleton className="h-7 w-14 rounded" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-40 rounded-sm" />
            <SkeletonRows rows={6} />
          </div>
        </div>
        <div className="space-y-6 lg:col-span-4">
          <Skeleton className="h-[150px] rounded-lg" />
          <Skeleton className="h-[220px] rounded-lg" />
        </div>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function ListPageSkeleton({ label, rows = 8, filters = true }: { label: string; rows?: number; filters?: boolean }) {
  return (
    <div role="status" aria-label={`Loading ${label}`} className="space-y-6">
      <HeaderSkeleton />
      {filters ? (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-52 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      ) : null}
      <SkeletonRows rows={rows} />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={`Loading ${label}`} className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-40 rounded-sm" />
        <Skeleton className="h-8 w-[60%] rounded" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded" />
          <Skeleton className="h-6 w-24 rounded" />
          <Skeleton className="h-6 w-16 rounded" />
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <SkeletonRows rows={4} />
        </div>
        <div className="space-y-4 lg:col-span-4">
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
