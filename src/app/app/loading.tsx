// Shown by Next.js App Router while the dashboard server component streams.
// Matches the active-state layout so there's no layout shift.

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-fp-elevated ${className ?? ""}`}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      {/* Section heading */}
      <Skeleton className="mb-6 h-6 w-48" />

      {/* Batch cards */}
      <div className="flex flex-col gap-2">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-fp-surface px-5 py-4"
          >
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-1.5 w-28 rounded-full" />
            </div>
            <Skeleton className="ml-4 h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Section heading */}
      <Skeleton className="mb-6 mt-10 h-6 w-44" />

      {/* Claim cards */}
      <div className="flex flex-col gap-2">
        {[...Array(2)].map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-fp-surface px-5 py-4"
          >
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
            <Skeleton className="ml-4 h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
