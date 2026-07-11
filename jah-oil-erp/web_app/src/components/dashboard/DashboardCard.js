"use client";

import { AppIcon } from "@/components/ui/AppIcon";

const toneStyles = {
  sky: {
    card: "from-slate-50 via-white to-sky-50 ring-slate-200",
    icon: "bg-slate-100 text-sky-700 ring-slate-200",
    trend: {
      positive: "bg-sky-500/12 text-sky-700",
      negative: "bg-slate-200 text-slate-700",
    },
  },
  emerald: {
    card: "from-slate-50 via-white to-sky-50 ring-slate-200",
    icon: "bg-slate-100 text-sky-700 ring-slate-200",
    trend: {
      positive: "bg-sky-500/12 text-sky-700",
      negative: "bg-slate-200 text-slate-700",
    },
  },
  amber: {
    card: "from-slate-50 via-white to-sky-50 ring-slate-200",
    icon: "bg-slate-100 text-sky-700 ring-slate-200",
    trend: {
      positive: "bg-sky-500/12 text-sky-700",
      negative: "bg-slate-200 text-slate-700",
    },
  },
};

export default function DashboardCard({
  title,
  value,
  icon,
  trend,
  footer,
  tone = "sky",
}) {
  const palette = toneStyles[tone] || toneStyles.sky;

  return (
    <div
      className={`overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 shadow-lg ring-1 shadow-slate-200/40 transition-transform hover:-translate-y-1 ${palette.card}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="mb-2 text-[11px] tracking-[0.24em] text-slate-400 uppercase">
            {title}
          </p>
          <p className="text-3xl font-semibold text-slate-900">{value}</p>
          {trend !== undefined ? (
            <p
              className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                trend > 0 ? palette.trend.positive : palette.trend.negative
              }`}
            >
              {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
            </p>
          ) : null}
        </div>
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-3xl text-3xl ring-1 ${palette.icon}`}
        >
          <AppIcon name={icon} className="h-7 w-7" />
        </div>
      </div>
      {footer ? (
        <div className="mt-4 border-t border-slate-200/70 pt-3 text-xs text-slate-600">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
