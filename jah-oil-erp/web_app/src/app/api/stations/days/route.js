import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/server";
import { buildPaginatedResult, normalizePageNumber } from "@/features/operations/helpers";
import { buildStationsSummaryQueryOptions } from "@/features/stations/page-helpers";
import {
  buildAggregateSummary,
  buildStationDailyBreakdownFromSummary,
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
  const stationId = `${searchParams.get("stationId") || ""}`.trim();
  const fromDate = `${searchParams.get("from") || ""}`.slice(0, 10);
  const toDate = `${searchParams.get("to") || ""}`.slice(0, 10);
  const page = normalizePageNumber(searchParams.get("page"));

  if (!stationId) {
    return NextResponse.json({ message: "Missing station" }, { status: 400 });
  }

  const summaryRecords = await getDashboardSummaryData(
    buildStationsSummaryQueryOptions(session, fromDate, toDate),
  );
  const dailyBreakdown = buildStationDailyBreakdownFromSummary(summaryRecords, stationId);
  const paginatedResult = buildPaginatedResult(dailyBreakdown, page);
  const aggregate = dailyBreakdown.reduce(
    (totals, row) => ({
      fuel: totals.fuel + row.fuel,
      shop: totals.shop + row.shop,
      cement: totals.cement + row.cement,
      total: totals.total + row.total,
      transactions: totals.transactions + row.transactions,
    }),
    { fuel: 0, shop: 0, cement: 0, total: 0, transactions: 0 },
  );

  return NextResponse.json({
    records: paginatedResult.records,
    totalItems: paginatedResult.totalItems,
    currentPage: paginatedResult.currentPage,
    summaryCards: buildAggregateSummary(aggregate),
  });
}
