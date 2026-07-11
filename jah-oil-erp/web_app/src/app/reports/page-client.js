"use client";

import { useEffect, useMemo, useState } from "react";

import DataTable from "@/components/dashboard/DataTable";
import SalesChart from "@/components/dashboard/SalesChart";
import {
  CompactActionButton,
  CompactFieldLabel,
  CompactFilterCard,
  CompactInput,
  CompactSelect,
  CompactSummaryCards,
  PaginationControls,
} from "@/features/operations/ui";
import {
  DATE_RANGE_PRESET_OPTIONS,
  buildDatePresetFilters,
  buildPaginatedResult,
  formatDisplayDate,
  getDatePresetRange,
  PAGE_SIZE,
} from "@/features/operations/helpers";

function getDefaultFilters(report) {
  const baseFilters = {};
  const reportFilters = Array.isArray(report?.filters) ? report.filters : [];
  const hasDateRangeFilters = reportFilters.some(
    (filter) => filter.type === "date",
  );

  if (hasDateRangeFilters) {
    Object.assign(baseFilters, buildDatePresetFilters("this-week"));
  }

  reportFilters.forEach((filter) => {
    if (filter.type === "date") {
      return;
    }
    baseFilters[filter.key] = "";
  });

  return baseFilters;
}

function buildQueryString(reportKey, filters = {}, extra = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set("report", reportKey);

  Object.entries({ ...filters, ...extra }).forEach(([key, value]) => {
    const normalizedValue = `${value || ""}`.trim();

    if (normalizedValue) {
      searchParams.set(key, normalizedValue);
    }
  });

  return searchParams.toString();
}

function buildSummaryCards(previewData, scopeLabel) {
  const totals = previewData?.summary?.totals || {};
  const primaryTotalKey = Object.keys(totals).find((key) =>
    `${key || ""}`.toLowerCase().includes("amount") ||
    `${key || ""}`.toLowerCase().includes("sales"),
  );

  return [
    {
      title: "Rows",
      value: Number(previewData?.summary?.rowCount || 0).toLocaleString(),
      icon: "📄",
    },
    {
      title: "Scope",
      value: scopeLabel,
      icon: "🧭",
    },
    {
      title: primaryTotalKey ? "Primary Total" : "Preview",
      value: primaryTotalKey
        ? `D${Number(totals[primaryTotalKey] || 0).toLocaleString()}`
        : "Ready",
      icon: primaryTotalKey ? "💰" : "👁️",
    },
  ];
}

export default function ReportsPageClient({
  visibleReports,
  reportMeta,
  scopeLabel,
  heroHeading,
}) {
  const reportList = Array.isArray(visibleReports) ? visibleReports : [];
  const [selectedReportKey, setSelectedReportKey] = useState("");
  const selectedReport = useMemo(
    () => reportList.find((report) => report.key === selectedReportKey) || null,
    [reportList, selectedReportKey],
  );
  const [filters, setFilters] = useState({});
  const [previewData, setPreviewData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  function handleSelectReport(report) {
    setSelectedReportKey(report.key);
    setFilters(getDefaultFilters(report));
    setPreviewData(null);
    setError("");
    setPage(1);
  }

  useEffect(() => {
    if (!selectedReport?.key) {
      setIsLoading(false);
      return;
    }

    let isActive = true;

    async function loadPreview() {
      setIsLoading(true);
      setError("");

      try {
        const queryString = buildQueryString(selectedReport.key, filters);
        const response = await fetch(`/api/reports/view?${queryString}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message || "Failed to load report preview.");
        }

        if (isActive) {
          setPreviewData(payload);
        }
      } catch (loadError) {
        if (isActive) {
          setPreviewData(null);
          setError(`${loadError?.message || "Failed to load report preview."}`);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      isActive = false;
    };
  }, [filters, selectedReport?.key]);

  const paginatedPreview = useMemo(
    () => buildPaginatedResult(previewData?.rows || [], page, PAGE_SIZE),
    [page, previewData?.rows],
  );

  useEffect(() => {
    setPage(1);
  }, [previewData?.rows?.length]);

  const summaryCards = useMemo(
    () =>
      Array.isArray(previewData?.summaryCards) && previewData.summaryCards.length > 0
        ? previewData.summaryCards
        : buildSummaryCards(previewData, scopeLabel),
    [previewData, scopeLabel],
  );

  const filterOptions = previewData?.filterOptions || {};
  const reportFilters = Array.isArray(selectedReport?.filters)
    ? selectedReport.filters
    : [];
  const hasDateFilters = reportFilters.some((filter) => filter.type === "date");
  const nonDateFilters = reportFilters.filter((filter) => filter.type !== "date");
  const resolvedRangePreset = filters.rangePreset || "this-week";
  const isCustomRangePreset = resolvedRangePreset === "custom";

  return (
    <>
      <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-900 to-sky-900 p-6 text-white shadow-[0_25px_80px_rgba(15,23,42,0.18)]">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-sky-200/80">
              Reporting center
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{heroHeading}</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-300">
              View filtered report results first, then export the same dataset as
              CSV or PDF.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">
                Templates
              </p>
              <p className="mt-2 text-lg font-semibold">{reportList.length}</p>
              <p className="mt-1 text-sm text-slate-200">available to this role</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">
                Scope
              </p>
              <p className="mt-2 text-lg font-semibold">{scopeLabel}</p>
              <p className="mt-1 text-sm text-slate-200">enforced automatically</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">
                Exports
              </p>
              <p className="mt-2 text-lg font-semibold">CSV / PDF</p>
              <p className="mt-1 text-sm text-slate-200">preview before download</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {reportList.map((report) => {
          const isSelected = report.key === selectedReport?.key;

          return (
            <div
              key={report.key}
              className={`rounded-[2rem] bg-gradient-to-br ${report.tone} p-4 text-left shadow-sm ring-1 transition hover:shadow-md ${
                isSelected
                  ? "ring-sky-400 shadow-lg"
                  : "ring-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {report.title}
                  </h3>
                  <p className="mt-2 text-xs text-slate-600">
                    {report.description}
                  </p>
                </div>
                <div className="group relative">
                  <button
                    type="button"
                    aria-label={`More details for ${report.title}`}
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/90 text-base font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-white"
                  >
                    ⋯
                  </button>
                  <div className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-20 hidden w-72 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl group-hover:block group-focus-within:block">
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Included
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{report.includes}</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Recommended use
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {report.recommendedUse}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => handleSelectReport(report)}
                  className={`inline-flex cursor-pointer rounded-full px-2 py-1 text-xs font-semibold transition ${
                    isSelected
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`.trim()}
                >
                  {isSelected ? "Viewing report" : "View report"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedReport ? (
        <>
          <CompactSummaryCards items={summaryCards} fullRow />

          {Array.isArray(previewData?.chart?.data) &&
          previewData.chart.data.length > 0 ? (
            <SalesChart
              data={previewData.chart.data}
              title={previewData.chart.title || "Report chart"}
            />
          ) : null}

          <CompactFilterCard
            columnsClass="w-full"
          >
            <div className="w-full space-y-4">
              {hasDateFilters ? (
                <div className="flex flex-wrap gap-2">
                  {DATE_RANGE_PRESET_OPTIONS.map((option) => {
                    const isActive = option.value === resolvedRangePreset;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setFilters((current) => ({
                            ...current,
                            rangePreset: option.value,
                            ...(option.value === "custom"
                              ? {
                                  fromDate: current.fromDate || "",
                                  toDate: current.toDate || "",
                                }
                              : getDatePresetRange(option.value)),
                          }))
                        }
                        className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          isActive
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`.trim()}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {hasDateFilters || selectedReport ? (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  {hasDateFilters ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <CompactFieldLabel htmlFor="report-filter-from-date">
                          from
                        </CompactFieldLabel>
                        <CompactInput
                          id="report-filter-from-date"
                          type="date"
                          value={filters.fromDate || ""}
                          disabled={!isCustomRangePreset}
                          onChange={(event) =>
                            setFilters((current) => ({
                              ...current,
                              rangePreset: "custom",
                              fromDate: event.target.value,
                            }))
                          }
                          className={
                            !isCustomRangePreset
                              ? "cursor-not-allowed bg-slate-50"
                              : ""
                          }
                        />
                      </div>
                      <div className="min-w-0">
                        <CompactFieldLabel htmlFor="report-filter-to-date">
                          to
                        </CompactFieldLabel>
                        <CompactInput
                          id="report-filter-to-date"
                          type="date"
                          value={filters.toDate || ""}
                          disabled={!isCustomRangePreset}
                          onChange={(event) =>
                            setFilters((current) => ({
                              ...current,
                              rangePreset: "custom",
                              toDate: event.target.value,
                            }))
                          }
                          className={
                            !isCustomRangePreset
                              ? "cursor-not-allowed bg-slate-50"
                              : ""
                          }
                        />
                      </div>
                      {!isCustomRangePreset && filters.fromDate && filters.toDate ? (
                        <p className="sm:col-span-2 text-xs text-slate-500">
                          {formatDisplayDate(filters.fromDate)} to{" "}
                          {formatDisplayDate(filters.toDate)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div />
                  )}

                  <CompactActionButton
                    onClick={() => setFilters(getDefaultFilters(selectedReport))}
                  >
                    Reset filters
                  </CompactActionButton>
                </div>
              ) : null}

              {nonDateFilters.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {nonDateFilters.map((filter) => {
                    const options = filter.optionsKey
                      ? filterOptions[filter.optionsKey] || []
                      : [];

                    return (
                      <div key={filter.key} className="min-w-0">
                        <CompactFieldLabel htmlFor={`report-filter-${filter.key}`}>
                          {filter.label}
                        </CompactFieldLabel>
                        <CompactSelect
                          id={`report-filter-${filter.key}`}
                          value={filters[filter.key] || ""}
                          onChange={(event) =>
                            setFilters((current) => ({
                              ...current,
                              [filter.key]: event.target.value,
                            }))
                          }
                        >
                          <option value="">All</option>
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </CompactSelect>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </CompactFilterCard>

          {error ? (
            <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {previewData?.columns?.length ? (
            <>
              <DataTable
                columns={previewData.columns}
                data={paginatedPreview.records}
                title={previewData?.report?.title || reportMeta.title}
                subtitle={
                  previewData?.report?.description || reportMeta.description
                }
                headerContent={
                  <>
                    <a
                      href={`/api/reports/export?${buildQueryString(selectedReport.key, filters, {
                        format: "pdf",
                      })}`}
                      className="inline-flex cursor-pointer rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                    >
                      Download PDF
                    </a>
                    <a
                      href={`/api/reports/export?${buildQueryString(selectedReport.key, filters, {
                        format: "csv",
                      })}`}
                      className="inline-flex cursor-pointer rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                    >
                      Download CSV
                    </a>
                  </>
                }
                loading={isLoading}
                loadingMessage="Loading report preview..."
              />

              <PaginationControls
                currentPage={paginatedPreview.currentPage}
                totalItems={paginatedPreview.totalItems}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          ) : isLoading ? (
            <div className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-8 text-sm text-slate-500">
              Loading report preview...
            </div>
          ) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white px-6 py-10 text-sm text-slate-500">
              No rows match the selected filters.
            </div>
          )}
        </>
      ) : (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white px-6 py-10 text-sm text-slate-500">
          Select a report to preview, filter, and export it.
        </div>
      )}
    </>
  );
}
