import { addDays, getLatestRecordDate } from "@/features/stations/performance";

export const PAGE_SIZE = 20;
export const DISPLAY_LOCALE = "en-US";
export const DISPLAY_TIME_ZONE = "Africa/Accra";
export const DATE_RANGE_PRESET_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "custom", label: "Custom" },
];

const INTEGER_NUMBER_FORMATTER = new Intl.NumberFormat(DISPLAY_LOCALE);

function padDateSegment(value) {
  return `${value}`.padStart(2, "0");
}

export function formatDateInputValue(date) {
  return [
    date.getFullYear(),
    padDateSegment(date.getMonth() + 1),
    padDateSegment(date.getDate()),
  ].join("-");
}

export function getTodayDateInputValue(referenceDate = new Date()) {
  return formatDateInputValue(referenceDate);
}

export function getDatePresetRange(
  preset = "this-week",
  referenceDate = new Date(),
) {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );

  if (preset === "today") {
    const todayValue = formatDateInputValue(today);

    return {
      fromDate: todayValue,
      toDate: todayValue,
    };
  }

  if (preset === "this-week") {
    const weekStart = new Date(today);
    const dayOfWeek = today.getDay();
    const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart.setDate(today.getDate() + offsetToMonday);

    return {
      fromDate: formatDateInputValue(weekStart),
      toDate: formatDateInputValue(today),
    };
  }

  if (preset === "this-month") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    return {
      fromDate: formatDateInputValue(monthStart),
      toDate: formatDateInputValue(today),
    };
  }

  return {
    fromDate: "",
    toDate: "",
  };
}

export function buildDatePresetFilters(
  preset = "this-week",
  referenceDate = new Date(),
) {
  return {
    rangePreset: preset,
    ...getDatePresetRange(preset, referenceDate),
  };
}

export function getDefaultDateRange(records) {
  const latestDate = getLatestRecordDate(records);
  return {
    latestDate,
    initialFromDate: latestDate ? addDays(latestDate, -6) : "",
  };
}

export function paginateItems(items, page, pageSize = PAGE_SIZE) {
  const sourceItems = Array.isArray(items) ? items : [];
  const currentPage = normalizePageNumber(page);

  return sourceItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
}

export function normalizePageNumber(value) {
  const parsedValue = Number.parseInt(`${value || ""}`, 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return 1;
  }

  return parsedValue;
}

export function buildPaginatedResult(items, page, pageSize = PAGE_SIZE) {
  const sourceItems = Array.isArray(items) ? items : [];
  const currentPage = normalizePageNumber(page);
  const totalItems = sourceItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  return {
    records: paginateItems(sourceItems, safePage, pageSize),
    totalItems,
    currentPage: safePage,
    totalPages,
    hasPreviousPage: safePage > 1,
    hasNextPage: safePage < totalPages,
  };
}

export function buildMetricCards(metrics) {
  return metrics.map((metric) => ({
    title: metric.title,
    value: metric.value,
    icon: metric.icon,
  }));
}

export function formatNumber(value) {
  return INTEGER_NUMBER_FORMATTER.format(Number(value || 0));
}

export function formatCurrency(value) {
  return `D${formatNumber(value)}`;
}

export function formatDisplayDate(dateString) {
  if (!dateString) {
    return "";
  }

  const normalizedValue = `${dateString}`.trim();
  const hasTimeComponent =
    normalizedValue.includes("T") || /\d{2}:\d{2}/.test(normalizedValue);
  const date = hasTimeComponent
    ? new Date(normalizedValue)
    : new Date(`${normalizedValue}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}

export function formatDisplayDateTime(dateTimeString) {
  if (!dateTimeString) {
    return "";
  }

  const date = new Date(dateTimeString);

  if (Number.isNaN(date.getTime())) {
    return dateTimeString;
  }

  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}
