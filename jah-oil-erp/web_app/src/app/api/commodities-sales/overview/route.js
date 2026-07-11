import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/server";
import { buildPaginatedResult, normalizePageNumber } from "@/features/operations/helpers";
import { buildScopedSalesSummaryQueryOptions } from "@/features/sales/page-helpers";
import {
  buildCommodityStationSummaryFromSummary,
  buildCommoditySummaryCardsFromSummary,
  buildCommodityTopPerformerDataFromSummary,
} from "@/features/sales/summary-utils";
import { getDashboardSummaryData } from "@/lib/data/appwrite-data";

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
  const fromDate = `${searchParams.get("from") || ""}`.slice(0, 10);
  const toDate = `${searchParams.get("to") || ""}`.slice(0, 10);
  const stationFilter = `${searchParams.get("station") || "All"}`.trim() || "All";
  const page = normalizePageNumber(searchParams.get("page"));
  const summaryRecords = await getDashboardSummaryData(
    buildScopedSalesSummaryQueryOptions(session, fromDate, toDate),
  );
  const filteredSummaryRecords =
    stationFilter === "All"
      ? summaryRecords
      : (Array.isArray(summaryRecords) ? summaryRecords : []).filter(
          (record) => record.station === stationFilter,
        );
  const stationSummary = buildCommodityStationSummaryFromSummary(filteredSummaryRecords);
  const paginatedResult = buildPaginatedResult(stationSummary, page);

  return NextResponse.json({
    records: paginatedResult.records,
    totalItems: paginatedResult.totalItems,
    currentPage: paginatedResult.currentPage,
    summaryCards: buildCommoditySummaryCardsFromSummary(filteredSummaryRecords),
    topStations: buildCommodityTopPerformerDataFromSummary(filteredSummaryRecords),
    stationOptions: [
      "All",
      ...new Set(
        buildCommodityStationSummaryFromSummary(summaryRecords).map((record) => record.station),
      ),
    ],
  });
}
