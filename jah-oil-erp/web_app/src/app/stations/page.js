import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireCurrentSession } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import {
  buildStationsSummaryQueryOptions,
  resolveStationsDateRange,
} from "@/features/stations/page-helpers";
import {
  buildStationPerformanceFromSummary,
  buildTopStationChartDataFromSummary,
} from "@/features/stations/performance";
import StationsPageClient from "@/features/stations/StationsPageClient";
import { buildPaginatedResult } from "@/features/operations/helpers";
import { getDashboardSummaryData } from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

export default async function StationsPage({ searchParams }) {
  const session = await requireCurrentSession();
  const shellProps = buildDashboardShellProps(session);
  const { fromDate, toDate, defaultFromDate, defaultToDate } =
    resolveStationsDateRange(await searchParams);
  let summaryRecords;
  let initialStationData;

  try {
    summaryRecords = await getDashboardSummaryData(
      buildStationsSummaryQueryOptions(session, fromDate, toDate),
    );
    const stationPerformance = buildStationPerformanceFromSummary(summaryRecords);

    initialStationData = {
      records: buildPaginatedResult(stationPerformance, 1).records,
      totalItems: stationPerformance.length,
      topStations: buildTopStationChartDataFromSummary(summaryRecords, 3),
    };
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Stations"
        pageDescription="Compare stations by sales, drill into daily activity, and inspect individual transactions."
        error={error}
      />
    );
  }

  return (
    <StationsPageClient
      initialStationData={initialStationData}
      fromDate={fromDate}
      toDate={toDate}
      defaultFromDate={defaultFromDate}
      defaultToDate={defaultToDate}
      shellProps={shellProps}
    />
  );
}
