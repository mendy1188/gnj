import { NextResponse } from "next/server";

import {
  filterSalesRecordsForSession,
  isPrivilegedRole,
} from "@/features/auth/scopes";
import { getCurrentSession } from "@/features/auth/server";
import { buildPaginatedResult, normalizePageNumber } from "@/features/operations/helpers";
import { normalizeDateValue } from "@/features/sales/page-helpers";
import { buildCommoditySummaryCardsFromSummary } from "@/features/sales/summary-utils";
import { getSalesDataForDateRange } from "@/lib/data/appwrite-data";
import { getDashboardSummaryData } from "@/lib/data/appwrite-data";
import { buildScopedSalesSummaryQueryOptions } from "@/features/sales/page-helpers";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.mustChangePassword) {
    return NextResponse.json(
      { message: "Password change required" },
      { status: 403 },
    );
  }

  if (!session.modules?.includes("commodities-sales")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const normalizedRange = resolveDateRange(searchParams);
  const requestedStationId = `${searchParams.get("stationId") || ""}`.trim();
  const page = normalizePageNumber(searchParams.get("page"));

  if (!normalizedRange) {
    return NextResponse.json(
      { message: "Missing or invalid date range" },
      { status: 400 },
    );
  }

  const stationId = isPrivilegedRole(session.roleName)
    ? requestedStationId
    : session.branchId || requestedStationId;

  if (!stationId) {
    return NextResponse.json(
      { message: "Missing station context" },
      { status: 400 },
    );
  }

  const salesData = await getSalesDataForDateRange({
    startDate: normalizedRange.fromDate,
    endDate: normalizedRange.toDate,
    stationId,
    branchName: isPrivilegedRole(session.roleName) ? "" : session.branchName || "",
    includeCashierMetadata: true,
    categories: ["shop"],
  });

  const filteredRecords = filterSalesRecordsForSession(salesData, session, {
    allowedTypes: ["Shop"],
  }).filter((record) => `${record.stationId || ""}` === stationId);

  const grouped = new Map();

  filteredRecords.forEach((record) => {
    const itemName = `${record.item || ""}`.trim();

    if (!itemName) {
      return;
    }

    if (!grouped.has(itemName)) {
      grouped.set(itemName, {
        item: itemName,
        type: getCommodityBucket(itemName),
        totalQuantity: 0,
        totalAmount: 0,
        transactions: 0,
      });
    }

    const item = grouped.get(itemName);
    item.totalQuantity += Number(record.quantity || 0);
    item.totalAmount += Number(record.amount || 0);
    item.transactions += 1;
  });

  const records = Array.from(grouped.values()).sort(
    (left, right) =>
      Number(right.totalAmount || 0) - Number(left.totalAmount || 0) ||
      Number(right.totalQuantity || 0) - Number(left.totalQuantity || 0) ||
      `${left.item || ""}`.localeCompare(`${right.item || ""}`),
  );
  const paginatedResult = buildPaginatedResult(records, page);
  const summaryRecords = await getDashboardSummaryData(
    buildScopedSalesSummaryQueryOptions(
      session,
      normalizedRange.fromDate,
      normalizedRange.toDate,
    ),
  );
  const stationSummaryRecords = (Array.isArray(summaryRecords) ? summaryRecords : []).filter(
    (record) => `${record.stationId || ""}` === stationId,
  );

  return NextResponse.json({
    records: paginatedResult.records,
    totalItems: paginatedResult.totalItems,
    currentPage: paginatedResult.currentPage,
    summaryCards: buildCommoditySummaryCardsFromSummary(stationSummaryRecords),
  });
}

function resolveDateRange(searchParams) {
  const requestedFrom = normalizeDateValue(searchParams.get("from"));
  const requestedTo = normalizeDateValue(searchParams.get("to"));

  if (!requestedFrom || !requestedTo) {
    return null;
  }

  return requestedFrom <= requestedTo
    ? { fromDate: requestedFrom, toDate: requestedTo }
    : { fromDate: requestedTo, toDate: requestedFrom };
}

function getCommodityBucket(itemName) {
  const normalizedName = `${itemName || ""}`.trim().toLowerCase();

  if (normalizedName.includes("rice")) {
    return "Rice";
  }

  if (normalizedName.includes("cooking oil")) {
    return "Cooking Oil";
  }

  return "Other Commodities";
}
