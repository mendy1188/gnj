"use client";

import { AppIcon } from "@/components/ui/AppIcon";
import {
  DATE_RANGE_PRESET_OPTIONS,
  formatDisplayDate,
  getDatePresetRange,
} from "@/features/operations/helpers";

export const PRIMARY_ACTION_BUTTON_CLASS =
  "bg-gradient-to-r from-sky-600 to-sky-500 text-white shadow-lg shadow-sky-500/20 hover:from-sky-700 hover:to-sky-600 hover:text-white disabled:from-sky-600 disabled:to-sky-500 disabled:hover:from-sky-600 disabled:hover:to-sky-500 disabled:hover:text-white";

export function CompactFilterCard({
  children,
  actions,
  helperText,
  columnsClass = "md:grid-cols-3",
}) {
  return (
    <div className="rounded-[1rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
        <div
          className={`min-w-0 flex-1 grid gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap ${columnsClass}`.trim()}
        >
          {children}
        </div>
        {actions || helperText ? (
          <div className="flex flex-col gap-2 lg:shrink-0 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
            {helperText ? (
              <p className="text-xs text-slate-600">{helperText}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CompactFieldLabel({ children, htmlFor = undefined }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-semibold tracking-[0.2em] text-slate-500"
    >
      {children}
    </label>
  );
}

export function CompactInput(props) {
  return (
    <input
      {...props}
      className={`mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 transition outline-none focus:border-sky-500 ${props.className || ""}`.trim()}
    />
  );
}

export function CompactSelect({ className = "", ...props }) {
  return (
    <select
      {...props}
      className={`mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 transition outline-none focus:border-sky-500 ${className}`.trim()}
    />
  );
}

export function CompactActionButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex w-fit cursor-pointer rounded-full bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-100 ${className}`.trim()}
    >
      {children}
    </button>
  );
}

export function DateRangePresetFilter({
  preset = "this-week",
  fromDate = "",
  toDate = "",
  label = "date range",
  onChange,
  className = "",
}) {
  const resolvedPreset = preset || "custom";
  const isCustomPreset = resolvedPreset === "custom";

  return (
    <div className={`w-full min-w-0 lg:min-w-[340px] ${className}`.trim()}>
      <CompactFieldLabel>{label}</CompactFieldLabel>
      <div className="mt-1 flex flex-wrap gap-2">
        {DATE_RANGE_PRESET_OPTIONS.map((option) => {
          const isActive = option.value === resolvedPreset;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (!onChange) {
                  return;
                }

                if (option.value === "custom") {
                  onChange({
                    rangePreset: "custom",
                    fromDate,
                    toDate,
                  });
                  return;
                }

                onChange({
                  rangePreset: option.value,
                  ...getDatePresetRange(option.value),
                });
              }}
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

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <CompactFieldLabel htmlFor="date-range-from">from</CompactFieldLabel>
          <CompactInput
            id="date-range-from"
            type="date"
            value={fromDate}
            disabled={!isCustomPreset}
            onChange={(event) =>
              onChange?.({
                rangePreset: "custom",
                fromDate: event.target.value,
                toDate,
              })
            }
            className={!isCustomPreset ? "cursor-not-allowed bg-slate-50" : ""}
          />
        </div>
        <div>
          <CompactFieldLabel htmlFor="date-range-to">to</CompactFieldLabel>
          <CompactInput
            id="date-range-to"
            type="date"
            value={toDate}
            disabled={!isCustomPreset}
            onChange={(event) =>
              onChange?.({
                rangePreset: "custom",
                fromDate,
                toDate: event.target.value,
              })
            }
            className={!isCustomPreset ? "cursor-not-allowed bg-slate-50" : ""}
          />
        </div>
      </div>

      {!isCustomPreset && fromDate && toDate ? (
        <p className="mt-2 text-xs text-slate-500">
          {formatDisplayDate(fromDate)} to {formatDisplayDate(toDate)}
        </p>
      ) : null}
    </div>
  );
}

export function CompactFilterPanel({
  children,
  left,
  right,
  leftSpan = "lg:col-span-6",
  rightSpan = "lg:col-span-4",
  className = "",
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm ${className}`.trim()}
    >
      {left || right ? (
        <div className="grid gap-4 lg:grid-cols-10">
          <div className={leftSpan}>{left}</div>
          <div className={rightSpan}>{right}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function CompactSplitPanel({
  left,
  right,
  leftSpan = "xl:col-span-6",
  rightSpan = "xl:col-span-4",
  className = "",
}) {
  return (
    <div className={`grid gap-4 xl:grid-cols-10 ${className}`.trim()}>
      <div className={leftSpan}>{left}</div>
      <div className={rightSpan}>{right}</div>
    </div>
  );
}

export function CompactLayerHeader({ title, description }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-600">{description}</p>
    </div>
  );
}

export function CompactSummaryCards({
  items,
  fullRow = false,
  columnsClass = "md:grid-cols-3",
  cardClassName = "",
  titleClassName = "",
  valueClassName = "",
  iconClassName = "",
  gapClassName = "",
}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const resolvedGapClass = gapClassName || (fullRow ? "gap-5" : "gap-3");

  return (
    <div
      className={
        fullRow
          ? `grid ${resolvedGapClass} ${columnsClass}`.trim()
          : `flex flex-wrap ${resolvedGapClass}`.trim()
      }
    >
      {sourceItems.map((item) => (
        <div
          key={item.title}
          className={`${fullRow ? "w-full" : "min-w-[180px]"} rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm ${cardClassName}`.trim()}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p
                className={`text-[10px] tracking-[0.2em] text-slate-400 uppercase ${titleClassName}`.trim()}
              >
                {item.title}
              </p>
              <p
                className={`mt-1 text-sm font-semibold text-slate-900 ${valueClassName}`.trim()}
              >
                {item.value}
              </p>
            </div>
            <span className={`text-lg ${iconClassName}`.trim()}>
              <AppIcon name={item.icon} className="h-5 w-5" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PaginationControls({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalItems <= pageSize) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        Page {currentPage} of {totalPages} · {totalItems} records
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="cursor-pointer rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="cursor-pointer rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function PaginationSummary({
  currentPage,
  totalItems,
  pageSize,
  label,
  actions = null,
}) {
  if (totalItems === 0) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          No {label.toLowerCase()} available.
        </p>
        {actions ? (
          <div className="flex justify-start sm:justify-end">{actions}</div>
        ) : null}
      </div>
    );
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        Showing {startItem}–{endItem} of {totalItems} {label.toLowerCase()}
      </p>
      {actions ? (
        <div className="flex justify-start sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}

export function RemotePaginationSummary({ actions = null }) {
  if (!actions) {
    return null;
  }

  return <div className="flex justify-start sm:justify-end">{actions}</div>;
}

export function RemotePaginationControls({
  currentPage,
  hasPreviousPage,
  hasNextPage,
  onPreviousPage,
  onNextPage,
  isLoading = false,
  totalItems = null,
  pageSize = 20,
  label = "records",
}) {
  const resolvedTotalItems = Number(totalItems);
  const hasExactTotal =
    Number.isFinite(resolvedTotalItems) && resolvedTotalItems >= 0;
  const resolvedPageSize = Math.max(1, Number(pageSize) || 1);
  const recordsShown = hasExactTotal
    ? Math.min(currentPage * resolvedPageSize, resolvedTotalItems)
    : 0;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        {hasExactTotal
          ? `Page ${currentPage}, ${recordsShown.toLocaleString()} of ${resolvedTotalItems.toLocaleString()} ${`${label || "records"}`.toLowerCase()}`
          : `Page ${currentPage}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPreviousPage}
          disabled={!hasPreviousPage || isLoading}
          className="cursor-pointer rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNextPage}
          disabled={!hasNextPage || isLoading}
          className="cursor-pointer rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function TopPerformersCard({
  title,
  items,
  onSelect,
  itemLabel = "Total performance",
  valuePrefix = "D",
}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const maxValue = Math.max(0, ...sourceItems.map((item) => item.value || 0));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <AppIcon name="trophy" className="h-6 w-6 text-sky-600" />
      </div>
      {sourceItems.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No data available
        </p>
      ) : (
        <div className="space-y-4">
          {sourceItems.map((item, index) => {
            const content = (
              <div className="cursor-pointer">
                <div className="mt-0.5 text-lg text-sky-600">#{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {item.label}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{itemLabel}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{
                          width: `${maxValue === 0 ? 0 : (item.value / maxValue) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium whitespace-nowrap text-slate-700">
                      {valuePrefix}
                      {item.value.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );

            if (onSelect) {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left transition-shadow hover:shadow-sm"
                >
                  {content}
                </button>
              );
            }

            return (
              <div
                key={item.label}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
