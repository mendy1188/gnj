function SkeletonBlock({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`.trim()}
    />
  );
}

function TableSkeleton({ rows = 6, title = true }) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
      {title ? (
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-3 w-56" />
            </div>
            <SkeletonBlock className="h-8 w-10 rounded-full" />
          </div>
        </div>
      ) : null}
      <div className="overflow-hidden">
        <div className="grid grid-cols-5 gap-4 border-b border-slate-200 bg-slate-50 px-6 py-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-3 w-20" />
          ))}
        </div>
        <div className="px-6 py-2">
          {Array.from({ length: rows }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-5 gap-4 border-b border-slate-100 py-4"
            >
              {Array.from({ length: 5 }).map((__, cellIndex) => (
                <SkeletonBlock
                  key={cellIndex}
                  className="h-4 w-full max-w-[120px]"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardOverviewLoading() {
  return (
    <div className="flex flex-col justify-start space-y-8">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <SkeletonBlock className="h-3 w-28" />
                <SkeletonBlock className="h-9 w-36" />
                <SkeletonBlock className="h-7 w-20 rounded-full" />
              </div>
              <SkeletonBlock className="h-14 w-14 rounded-3xl" />
            </div>
            <SkeletonBlock className="mt-4 h-4 w-full" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-10">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 xl:col-span-7">
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="space-y-2">
              <SkeletonBlock className="h-5 w-36" />
              <SkeletonBlock className="h-4 w-64" />
            </div>
            <div className="flex gap-2">
              <SkeletonBlock className="h-9 w-24 rounded-full" />
              <SkeletonBlock className="h-9 w-24 rounded-full" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-2 h-4 w-24" />
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-5">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index}>
                <div className="mb-2 flex items-center justify-between">
                  <SkeletonBlock className="h-4 w-24" />
                  <SkeletonBlock className="h-4 w-20" />
                </div>
                <SkeletonBlock className="h-3 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)] xl:col-span-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-7 w-36" />
          </div>
          <div className="mt-6 space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-2xl bg-slate-50 px-4 py-4">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="mt-2 h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <div className="mb-6 flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-4 w-64" />
          </div>
          <SkeletonBlock className="h-9 w-28 rounded-full" />
        </div>
        <SkeletonBlock className="h-[360px] w-full rounded-[1.5rem]" />
      </div>

      <div className="grid gap-6 xl:grid-cols-10">
        <div className="xl:col-span-6">
          <TableSkeleton />
        </div>
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)] xl:col-span-4">
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-6 w-40" />
          </div>
          <div className="mt-6 space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-2xl bg-slate-50 px-4 py-4">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="mt-2 h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OperationsTableLoading({
  filters = 3,
  summaryCards = 3,
  split = true,
}) {
  return (
    <div className="flex flex-col justify-start space-y-8">
      <div className="rounded-[1rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div
            className={`grid gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap ${filters > 3 ? "md:grid-cols-4" : "md:grid-cols-3"}`}
          >
            {Array.from({ length: filters }).map((_, index) => (
              <div key={index} className="min-w-[140px]">
                <SkeletonBlock className="h-3 w-12" />
                <SkeletonBlock className="mt-2 h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <SkeletonBlock className="h-8 w-36 rounded-full" />
            <SkeletonBlock className="h-3 w-56" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {Array.from({ length: summaryCards }).map((_, index) => (
          <div
            key={index}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="w-full">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-2 h-5 w-28" />
              </div>
              <SkeletonBlock className="h-8 w-8 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {split ? (
        <div className="grid gap-4 xl:grid-cols-10">
          <div className="xl:col-span-8">
            <TableSkeleton rows={7} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
            <div className="space-y-4">
              <SkeletonBlock className="h-5 w-24" />
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-2xl bg-slate-50 px-4 py-4">
                  <SkeletonBlock className="h-4 w-full" />
                  <SkeletonBlock className="mt-2 h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <TableSkeleton rows={8} />
      )}
    </div>
  );
}
