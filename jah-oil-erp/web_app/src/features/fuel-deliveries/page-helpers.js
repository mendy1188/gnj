import { getDefaultDateRange, normalizePageNumber } from "@/features/operations/helpers";
import { filterRecordsByDate } from "@/features/stations/performance";

export function resolveFuelDeliveriesDateRange(searchParams, records) {
  const { latestDate, initialFromDate } = getDefaultDateRange(records);
  const defaultFromDate = initialFromDate || "";
  const defaultToDate = latestDate || "";
  const requestedFrom = normalizeDateValue(getSearchParam(searchParams, "from"));
  const requestedTo = normalizeDateValue(getSearchParam(searchParams, "to"));
  const fromDate = requestedFrom || defaultFromDate;
  const toDate = requestedTo || defaultToDate;

  if (fromDate && toDate && fromDate > toDate) {
    return {
      fromDate: toDate,
      toDate: fromDate,
      defaultFromDate,
      defaultToDate,
    };
  }

  return {
    fromDate,
    toDate,
    defaultFromDate,
    defaultToDate,
  };
}

export function filterFuelDeliveryRecords(
  records,
  {
    fromDate = "",
    toDate = "",
    typeFilter = "All",
    statusFilter = "All",
    recordedByFilter = "All",
    station = "",
  } = {},
) {
  return filterRecordsByDate(Array.isArray(records) ? records : [], fromDate, toDate)
    .filter((record) => {
      if (typeFilter !== "All" && record.type !== typeFilter) {
        return false;
      }

      if (statusFilter !== "All" && record.status !== statusFilter) {
        return false;
      }

      if (
        recordedByFilter !== "All" &&
        `${record.recordedBy || ""}` !== recordedByFilter
      ) {
        return false;
      }

      if (station && record.station !== station) {
        return false;
      }

      return true;
    })
    .sort(
      (left, right) =>
        `${right.deliveryDate || ""}`.localeCompare(`${left.deliveryDate || ""}`) ||
        Number(right.quantity || 0) - Number(left.quantity || 0) ||
        `${left.station || ""}`.localeCompare(`${right.station || ""}`),
    );
}

export function buildFuelDeliveryTopStations(stationSummary, limit = 3) {
  return (Array.isArray(stationSummary) ? stationSummary : [])
    .slice(0, limit)
    .map((station) => ({
      label: station.station,
      value: Number(station.totalQuantity || 0),
    }));
}

export function normalizeFuelDeliveryFilters(searchParams) {
  return {
    typeFilter: normalizeSelectValue(getSearchParam(searchParams, "type"), [
      "Petrol",
      "Diesel",
    ]),
    statusFilter: normalizeSelectValue(getSearchParam(searchParams, "status"), [
      "delivered",
      "pending",
    ]),
    recordedByFilter: normalizeFreeTextValue(getSearchParam(searchParams, "recordedBy")),
    page: normalizePageNumber(getSearchParam(searchParams, "page")),
  };
}

function normalizeDateValue(value) {
  const normalizedValue = `${value || ""}`.slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

function normalizeSelectValue(value, allowedValues) {
  const normalizedValue = `${value || ""}`.trim();

  return allowedValues.includes(normalizedValue) ? normalizedValue : "All";
}

function normalizeFreeTextValue(value) {
  const normalizedValue = `${value || ""}`.trim();

  return normalizedValue || "All";
}

function getSearchParam(searchParams, key) {
  if (!searchParams) {
    return "";
  }

  if (typeof searchParams.get === "function") {
    return searchParams.get(key);
  }

  return searchParams[key];
}
