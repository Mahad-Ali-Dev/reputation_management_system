import { Skeleton, SkeletonCard, SkeletonStatsGrid } from "@/components/skeleton";

export default function AutopilotLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-6">
          {/* Hero toggle */}
          <SkeletonCard />
          {/* Tab bar */}
          <Skeleton className="h-9 w-72" />
          {/* Panels */}
          <SkeletonStatsGrid />
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    </div>
  );
}
