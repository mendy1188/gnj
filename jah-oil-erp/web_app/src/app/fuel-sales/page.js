import { buildDashboardShellProps } from "@/features/auth/shell";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import { requireCurrentSession } from "@/features/auth/server";
import SalesDrilldownPage from "@/features/sales/SalesDrilldownPage";
import {
  buildScopedSalesSummaryQueryOptions,
  resolveSalesPageDateRange,
} from "@/features/sales/page-helpers";
import {
  buildFuelStationSummaryFromSummary,
  buildFuelSummaryCardsFromSummary,
  buildFuelTopPerformerDataFromSummary,
} from "@/features/sales/summary-utils";
import { buildPaginatedResult } from "@/features/operations/helpers";
import { getDashboardSummaryData } from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

export default async function FuelSalesPage({ searchParams }) {
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
    const stationSummary = buildFuelStationSummaryFromSummary(summaryRecords);

    initialOverviewData = {
      records: buildPaginatedResult(stationSummary, 1).records,
      totalItems: stationSummary.length,
      summaryCards: buildFuelSummaryCardsFromSummary(summaryRecords),
      topPerformers: buildFuelTopPerformerDataFromSummary(summaryRecords),
    };
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Fuel Sales"
        pageDescription="Review recent fuel transactions and station-level sales performance."
        error={error}
      />
    );
  }

  return (
    <SalesDrilldownPage
      title="Fuel Sales"
      description="Review recent fuel transactions and station-level sales performance."
      initialOverviewData={initialOverviewData}
      quantityLabel="Liters"
      topCardTitle="Top Fuel Stations"
      shellProps={shellProps}
      fromDate={fromDate}
      toDate={toDate}
      defaultFromDate={defaultFromDate}
      defaultToDate={defaultToDate}
      variant="fuel"
    />
  );
}
