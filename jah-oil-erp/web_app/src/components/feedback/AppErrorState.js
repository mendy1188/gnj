"use client";

import Link from "next/link";
import { AppIcon } from "@/components/ui/AppIcon";

export default function AppErrorState({
  title,
  message,
  guidance,
  technicalDetails = "",
  digest = "",
  showTechnicalDetails = false,
  onRetry = null,
  retryLabel = "Try again",
  homeHref = "/dashboard",
  homeLabel = "Go to dashboard",
}) {
  const canRetry = typeof onRetry === "function";

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)] md:p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AppIcon name="warning" className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-500">
            Error
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{guidance}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {canRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            {retryLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Reload page
          </button>
        )}
        <Link
          href={homeHref}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {homeLabel}
        </Link>
      </div>

      {showTechnicalDetails && (technicalDetails || digest) ? (
        <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Technical details
          </summary>
          {digest ? (
            <p className="mt-3 text-xs text-slate-500">Reference: {digest}</p>
          ) : null}
          {technicalDetails ? (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-600">
              {technicalDetails}
            </pre>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
