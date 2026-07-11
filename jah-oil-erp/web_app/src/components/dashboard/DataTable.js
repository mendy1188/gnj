"use client";

const TABLE_LOCALE = "en-US";
const TABLE_TIME_ZONE = "Africa/Accra";
const TABLE_NUMBER_FORMATTER = new Intl.NumberFormat(TABLE_LOCALE);

function formatTemporalCellValue(value, includeTime = false, timeZone = undefined) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return "";
  }

  const hasTimeComponent =
    normalizedValue.includes("T") || /\d{2}:\d{2}/.test(normalizedValue);
  const date = hasTimeComponent
    ? new Date(normalizedValue)
    : new Date(`${normalizedValue.slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat(TABLE_LOCALE, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(includeTime
      ? {
          hour: "numeric",
          minute: "2-digit",
        }
      : {}),
    timeZone: timeZone || TABLE_TIME_ZONE,
  }).format(date);
}

function formatCellValue(value, format, column = {}) {
  if (format === "currency" && typeof value === "number") {
    return `D${TABLE_NUMBER_FORMATTER.format(value)}`;
  }

  if (format === "number" && typeof value === "number") {
    return TABLE_NUMBER_FORMATTER.format(value);
  }

  if (format === "date") {
    return formatTemporalCellValue(value, false, column.timeZone);
  }

  if (format === "datetime") {
    return formatTemporalCellValue(value, true, column.timeZone);
  }

  return value;
}

function renderCellContent(row, column, onRowClick) {
  if (typeof column.render === "function") {
    return column.render(row, column, onRowClick);
  }

  return formatCellValue(row[column.key], column.format, column);
}

function getRowIdentifier(row, index, selectedRowField) {
  return (
    row[selectedRowField] ??
    row.id ??
    row.name ??
    row.station ??
    row.date ??
    row.item ??
    index
  );
}

function getRowRenderKey(rowIdentifier, index) {
  if (rowIdentifier === undefined || rowIdentifier === null || rowIdentifier === "") {
    return `row-${index}`;
  }

  return `${rowIdentifier}-${index}`;
}

export default function DataTable({
  columns,
  data,
  title,
  subtitle,
  headerContent = null,
  onRowClick,
  selectedRowKey,
  selectedRowField = "id",
  getRowClassName,
  loading = false,
  loadingMessage = "Loading data...",
}) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
      {title ? (
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                {subtitle ? (
                  <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
                ) : null}
              </div>
              {headerContent ? (
                <div className="flex flex-wrap items-center gap-2">
                  {headerContent}
                </div>
              ) : null}
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
              {loading ? "..." : data.length}
            </span>
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-slate-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-6 py-3 text-left text-xs font-medium tracking-wide text-slate-600 uppercase"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-8 text-center text-sm text-slate-500"
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
                    {loadingMessage}
                  </span>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-6 text-center text-sm text-slate-500"
                >
                  No data available
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const rowIdentifier = getRowIdentifier(
                  row,
                  index,
                  selectedRowField,
                );
                const rowRenderKey = getRowRenderKey(rowIdentifier, index);
                const isSelected =
                  selectedRowKey !== undefined &&
                  rowIdentifier === selectedRowKey;
                const customRowClassName =
                  typeof getRowClassName === "function"
                    ? getRowClassName(row, {
                        index,
                        isSelected,
                        rowIdentifier,
                      })
                    : "";

                return (
                  <tr
                    key={rowRenderKey}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`border-b border-slate-100 transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-slate-50 ${onRowClick ? "cursor-pointer" : ""} ${customRowClassName || ""} ${
                      isSelected
                        ? "bg-sky-50/80 ring-2 ring-sky-200 ring-inset"
                        : ""
                    }`}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className="px-6 py-4 align-top text-sm text-slate-900"
                      >
                        {renderCellContent(row, column, onRowClick)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
