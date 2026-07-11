import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/server";
import { buildPaginatedResult, normalizePageNumber } from "@/features/operations/helpers";
import { buildStationsSummaryQueryOptions } from "@/features/stations/page-helpers";
import {
  buildStationPerformanceFromSummary,
  buildTopStationChartDataFromSummary,
} from "@/features/stations/performance";
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

  if (!session.modules?.includes("stations")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const fromDate = `${searchParams.get("from") || ""}`.slice(0, 10);
  const toDate = `${searchParams.get("to") || ""}`.slice(0, 10);
  const page = normalizePageNumber(searchParams.get("page"));
  const summaryRecords = await getDashboardSummaryData(
    buildStationsSummaryQueryOptions(session, fromDate, toDate),
  );
  const stationPerformance = buildStationPerformanceFromSummary(summaryRecords);
  const paginatedResult = buildPaginatedResult(stationPerformance, page);

  return NextResponse.json({
    records: paginatedResult.records,
    totalItems: paginatedResult.totalItems,
    currentPage: paginatedResult.currentPage,
    topStations: buildTopStationChartDataFromSummary(summaryRecords, 3),
  });
}
