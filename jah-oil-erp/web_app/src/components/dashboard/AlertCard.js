"use client";

import { AppIcon } from "@/components/ui/AppIcon";

export default function AlertCard({ alerts }) {
  const criticalAlerts = alerts.filter(
    (alert) => alert.required > 0 && alert.current / alert.required < 0.8,
  ).length;

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Low Stock Alerts
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {criticalAlerts} critical items need immediate replenishment.
          </p>
        </div>
        <AppIcon name="warning" className="h-6 w-6 text-sky-600" />
      </div>
      {alerts.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">No alerts</p>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start gap-3">
                <AppIcon name="bolt" className="mt-0.5 h-5 w-5 text-sky-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {alert.item}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-600">{alert.station}</p>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-slate-200">
                      {Math.round((alert.current / alert.required) * 100)}%
                      level
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{
                          width: `${Math.min(100, (alert.current / alert.required) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium whitespace-nowrap text-slate-700">
                      {alert.current}/{alert.required}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
