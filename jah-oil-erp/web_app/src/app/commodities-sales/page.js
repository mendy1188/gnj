import { buildDashboardShellProps } from "@/features/auth/shell";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import { requireCurrentSession } from "@/features/auth/server";
import CommoditySalesPageClient from "@/features/commodities/CommoditySalesPageClient";
import {
  buildScopedSalesSummaryQueryOptions,
  resolveSalesPageDateRange,
} from "@/features/sales/page-helpers";
import {
  buildCommodityStationSummaryFromSummary,
  buildCommoditySummaryCardsFromSummary,
  buildCommodityTopPerformerDataFromSummary,
} from "@/features/sales/summary-utils";
import { buildPaginatedResult } from "@/features/operations/helpers";
import { getDashboardSummaryData } from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

export default async function CommoditySalesPage({ searchParams }) {
  const session = await requireCurrentSession();
  const shellProps = buildDashboardShellProps(session);
  const { fromDate, toDate, defaultFromDate, defaultToDate } =
    resolveSalesPageDateRange(await searchParams);
  let summaryRecords;
  let initialOverviewData;

  try {
    summaryRecords = await getDashboardSummaryData(
      buildScopedSalesSummaryQueryOptions(session, fromDate, toDate),
    );
    const stationSummary = buildCommodityStationSummaryFromSummary(summaryRecords);

    initialOverviewData = {
      records: buildPaginatedResult(stationSummary, 1).records,
      totalItems: stationSummary.length,
      summaryCards: buildCommoditySummaryCardsFromSummary(summaryRecords),
      topStations: buildCommodityTopPerformerDataFromSummary(summaryRecords),
      stationOptions: [
        "All",
        ...new Set(stationSummary.map((record) => record.station).filter(Boolean)),
      ],
    };
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Commodity Sales"
        pageDescription="Review commodity sales by date and drill into station, item, and transaction performance."
        error={error}
      />
    );
  }

  return (
    <CommoditySalesPageClient
      initialOverviewData={initialOverviewData}
      fromDate={fromDate}
      toDate={toDate}
      defaultFromDate={defaultFromDate}
      defaultToDate={defaultToDate}
      shellProps={shellProps}
    />
  );
}
