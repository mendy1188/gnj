import { buildDashboardShellProps } from "@/features/auth/shell";
import { filterFuelDeliveriesForSession } from "@/features/auth/scopes";
import { requireCurrentSession } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import FuelDeliveriesPageClient from "@/features/fuel-deliveries/FuelDeliveriesPageClient";
import {
  buildFuelDeliveryTopStations,
  filterFuelDeliveryRecords,
  resolveFuelDeliveriesDateRange,
} from "@/features/fuel-deliveries/page-helpers";
import { buildPaginatedResult } from "@/features/operations/helpers";
import {
  buildDeliveryStationSummary,
  buildDeliverySummaryCards,
} from "@/features/sales/sales-utils";
import { getFuelDeliveriesData } from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

export default async function FuelDeliveriesPage({ searchParams }) {
  const session = await requireCurrentSession();
  const shellProps = buildDashboardShellProps(session);
  let initialOverviewData;
  let fromDate;
  let toDate;
  let defaultFromDate;
  let defaultToDate;

  try {
    const fuelDeliveries = filterFuelDeliveriesForSession(
      await getFuelDeliveriesData(),
      session,
    );
    const normalizedSearchParams = await searchParams;
    ({ fromDate, toDate, defaultFromDate, defaultToDate } =
      resolveFuelDeliveriesDateRange(normalizedSearchParams, fuelDeliveries));

    const filteredDeliveries = filterFuelDeliveryRecords(fuelDeliveries, {
      fromDate,
      toDate,
    });
    const stationSummary = buildDeliveryStationSummary(filteredDeliveries);
    const paginatedResult = buildPaginatedResult(stationSummary, 1);

    initialOverviewData = {
      records: paginatedResult.records,
      totalItems: paginatedResult.totalItems,
      currentPage: paginatedResult.currentPage,
      summaryCards: buildDeliverySummaryCards(filteredDeliveries),
      topStations: buildFuelDeliveryTopStations(stationSummary, 3),
    };
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Fuel Deliveries"
        pageDescription="Review dispatches, arrivals, and pending fuel replenishment activity across stations."
        error={error}
      />
    );
  }

  return (
    <FuelDeliveriesPageClient
      initialOverviewData={initialOverviewData}
      fromDate={fromDate}
      toDate={toDate}
      defaultFromDate={defaultFromDate}
      defaultToDate={defaultToDate}
      shellProps={shellProps}
    />
  );
}
