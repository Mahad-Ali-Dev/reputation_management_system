import { Skeleton, SkeletonCard, SkeletonStatsGrid } from "@/components/skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-96" />
        </div>
        {/* Tab-bar skeleton (the 6-tab shell) */}
        <div className="mb-6 flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton row
            <Skeleton key={i} className="h-9 w-32 shrink-0" />
          ))}
        </div>
        <div className="space-y-6">
          <SkeletonStatsGrid />
          <SkeletonCard />
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    </div>
  );
}
