import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/server";
import { buildPaginatedResult, normalizePageNumber } from "@/features/operations/helpers";
import { buildScopedSalesSummaryQueryOptions } from "@/features/sales/page-helpers";
import {
  buildCementStationSummaryFromSummary,
  buildCementSummaryCardsFromSummary,
  buildCementTopPerformerDataFromSummary,
  buildFuelStationSummaryFromSummary,
  buildFuelSummaryCardsFromSummary,
  buildFuelTopPerformerDataFromSummary,
} from "@/features/sales/summary-utils";
import { getDashboardSummaryData } from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

const TYPE_CONFIG = {
  fuel: {
    moduleKey: "fuel-sales",
    buildStationSummary: buildFuelStationSummaryFromSummary,
    buildSummaryCards: buildFuelSummaryCardsFromSummary,
    buildTopPerformers: buildFuelTopPerformerDataFromSummary,
  },
  cement: {
    moduleKey: "cement",
    buildStationSummary: buildCementStationSummaryFromSummary,
    buildSummaryCards: buildCementSummaryCardsFromSummary,
    buildTopPerformers: buildCementTopPerformerDataFromSummary,
  },
};

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

  const { searchParams } = new URL(request.url);
  const type = `${searchParams.get("type") || ""}`.trim().toLowerCase();
  const fromDate = `${searchParams.get("from") || ""}`.slice(0, 10);
  const toDate = `${searchParams.get("to") || ""}`.slice(0, 10);
  const page = normalizePageNumber(searchParams.get("page"));
  const config = TYPE_CONFIG[type];

  if (!config) {
    return NextResponse.json({ message: "Invalid sales type" }, { status: 400 });
  }

  if (!session.modules?.includes(config.moduleKey)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const summaryRecords = await getDashboardSummaryData(
    buildScopedSalesSummaryQueryOptions(session, fromDate, toDate),
  );
  const stationSummary = config.buildStationSummary(summaryRecords);
  const paginatedResult = buildPaginatedResult(stationSummary, page);

  return NextResponse.json({
    records: paginatedResult.records,
    totalItems: paginatedResult.totalItems,
    currentPage: paginatedResult.currentPage,
    summaryCards: config.buildSummaryCards(summaryRecords),
    topPerformers: config.buildTopPerformers(summaryRecords),
  });
}
