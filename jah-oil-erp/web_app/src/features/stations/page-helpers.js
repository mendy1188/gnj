import {
  isFuelSales,
  isGeneralSales,
  isPrivilegedRole,
} from "@/features/auth/scopes";
import { addDays } from "@/features/stations/performance";

export function resolveStationsDateRange(searchParams) {
  const defaultToDate = new Date().toISOString().slice(0, 10);
  const defaultFromDate = addDays(defaultToDate, -6);
  const requestedFrom = normalizeDateValue(searchParams?.from) || defaultFromDate;
  const requestedTo = normalizeDateValue(searchParams?.to) || defaultToDate;

  return {
    fromDate: requestedFrom <= requestedTo ? requestedFrom : requestedTo,
    toDate: requestedFrom <= requestedTo ? requestedTo : requestedFrom,
    defaultFromDate,
    defaultToDate,
  };
}

export function buildStationsSummaryQueryOptions(session, fromDate, toDate) {
  if (isGeneralSales(session?.roleName) || isFuelSales(session?.roleName)) {
    return {
      scope: "cashier",
      startDate: fromDate,
      endDate: toDate,
      stationId: session?.branchId || "",
      stationName: session?.branchName || "",
      cashierName: session?.fullName || "",
    };
  }

  if (!isPrivilegedRole(session?.roleName)) {
    return {
      scope: "station",
      startDate: fromDate,
      endDate: toDate,
      stationId: session?.branchId || "",
      stationName: session?.branchName || "",
    };
  }

  return {
    scope: "station",
    startDate: fromDate,
    endDate: toDate,
  };
}

export function normalizeDateValue(value) {
  const normalizedValue = `${value || ""}`.slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}
