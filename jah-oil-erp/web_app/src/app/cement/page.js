import { buildDashboardShellProps } from "@/features/auth/shell";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import { requireCurrentSession } from "@/features/auth/server";
import SalesDrilldownPage from "@/features/sales/SalesDrilldownPage";
import {
  buildScopedSalesSummaryQueryOptions,
  resolveSalesPageDateRange,
} from "@/features/sales/page-helpers";
import {
  buildCementStationSummaryFromSummary,
  buildCementSummaryCardsFromSummary,
  buildCementTopPerformerDataFromSummary,
} from "@/features/sales/summary-utils";
import { buildPaginatedResult } from "@/features/operations/helpers";
import { getDashboardSummaryData } from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

export default async function CementPage({ searchParams }) {
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
    const stationSummary = buildCementStationSummaryFromSummary(summaryRecords);

    initialOverviewData = {
      records: buildPaginatedResult(stationSummary, 1).records,
      totalItems: stationSummary.length,
      summaryCards: buildCementSummaryCardsFromSummary(summaryRecords),
      topPerformers: buildCementTopPerformerDataFromSummary(summaryRecords),
    };
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Cement Operations"
        pageDescription="Track cement distribution, product availability, and sales performance."
        error={error}
      />
    );
  }

  return (
    <SalesDrilldownPage
      title="Cement Operations"
      description="Track cement distribution, product availability, and sales performance."
      initialOverviewData={initialOverviewData}
      quantityLabel="Bags"
      topCardTitle="Top Cement Stations"
      shellProps={shellProps}
      fromDate={fromDate}
      toDate={toDate}
      defaultFromDate={defaultFromDate}
      defaultToDate={defaultToDate}
      variant="cement"
    />
  );
}
