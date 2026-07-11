import { NextResponse } from "next/server";

import { filterFuelDeliveriesForSession } from "@/features/auth/scopes";
import { getCurrentSession } from "@/features/auth/server";
import {
  buildFuelDeliveryTopStations,
  filterFuelDeliveryRecords,
  normalizeFuelDeliveryFilters,
  resolveFuelDeliveriesDateRange,
} from "@/features/fuel-deliveries/page-helpers";
import { buildPaginatedResult } from "@/features/operations/helpers";
import {
  buildDeliveryStationSummary,
  buildDeliverySummaryCards,
} from "@/features/sales/sales-utils";
import { getFuelDeliveriesData } from "@/lib/data/appwrite-data";

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

  if (!session.modules?.includes("fuel-deliveries")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const fuelDeliveries = filterFuelDeliveriesForSession(
    await getFuelDeliveriesData(),
    session,
  );
  const { fromDate, toDate } = resolveFuelDeliveriesDateRange(
    searchParams,
    fuelDeliveries,
  );
  const { typeFilter, statusFilter, page } =
    normalizeFuelDeliveryFilters(searchParams);
  const filteredDeliveries = filterFuelDeliveryRecords(fuelDeliveries, {
    fromDate,
    toDate,
    typeFilter,
    statusFilter,
  });
  const stationSummary = buildDeliveryStationSummary(filteredDeliveries);
  const paginatedResult = buildPaginatedResult(stationSummary, page);

  return NextResponse.json({
    records: paginatedResult.records,
    totalItems: paginatedResult.totalItems,
    currentPage: paginatedResult.currentPage,
    summaryCards: buildDeliverySummaryCards(filteredDeliveries),
    topStations: buildFuelDeliveryTopStations(stationSummary, 3),
  });
}
