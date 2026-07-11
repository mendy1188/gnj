"use client";

export default function SalesChart({ data, title }) {
  const maxValue = Math.max(0, ...data.map((item) => item.value || 0));
  const totalValue = data.reduce((sum, item) => sum + (item.value || 0), 0);
  const averageValue = data.length ? Math.round(totalValue / data.length) : 0;
  const peakEntry = data.reduce(
    (best, item) => ((item.value || 0) > (best.value || 0) ? item : best),
    data[0] || { label: "-", value: 0 },
  );

  return (
    <div className="rounded-[2rem] bg-white/95 p-6 shadow-xl ring-1 shadow-slate-900/5 ring-slate-200">
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">
            Latest performance across your stations.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <div className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
            Total D{totalValue.toLocaleString()}
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-sky-700 ring-1 ring-slate-200">
            Avg D{averageValue.toLocaleString()}
          </div>
        </div>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">
          No chart data available for this range.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] tracking-[0.2em] text-slate-400 uppercase">
                Peak Day
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {peakEntry.label}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] tracking-[0.2em] text-slate-400 uppercase">
                Peak Sales
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                D{(peakEntry.value || 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] tracking-[0.2em] text-slate-400 uppercase">
                Days Tracked
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {data.length}
              </p>
            </div>
          </div>
          {data.map((item, index) => (
            <div key={index}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  {item.label}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  D{(item.value || 0).toLocaleString()}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-500"
                  style={{
                    width: `${maxValue === 0 ? 0 : ((item.value || 0) / maxValue) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
