import { NextResponse } from "next/server";

import { filterFuelDeliveriesForSession } from "@/features/auth/scopes";
import { getCurrentSession } from "@/features/auth/server";
import {
  filterFuelDeliveryRecords,
  normalizeFuelDeliveryFilters,
  resolveFuelDeliveriesDateRange,
} from "@/features/fuel-deliveries/page-helpers";
import { buildPaginatedResult } from "@/features/operations/helpers";
import { buildDeliverySummaryCards } from "@/features/sales/sales-utils";
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
  const station = `${searchParams.get("station") || ""}`.trim();

  if (!station) {
    return NextResponse.json({ message: "Missing station" }, { status: 400 });
  }

  const fuelDeliveries = filterFuelDeliveriesForSession(
    await getFuelDeliveriesData(),
    session,
  );
  const { fromDate, toDate } = resolveFuelDeliveriesDateRange(
    searchParams,
    fuelDeliveries,
  );
  const { typeFilter, statusFilter, recordedByFilter, page } =
    normalizeFuelDeliveryFilters(searchParams);
  const stationRecords = filterFuelDeliveryRecords(fuelDeliveries, {
    fromDate,
    toDate,
    typeFilter,
    statusFilter,
    recordedByFilter,
    station,
  });
  const paginatedResult = buildPaginatedResult(stationRecords, page);

  return NextResponse.json({
    records: paginatedResult.records,
    totalItems: paginatedResult.totalItems,
    currentPage: paginatedResult.currentPage,
    summaryCards: buildDeliverySummaryCards(stationRecords),
    recordedByOptions: [
      "All",
      ...new Set(
        stationRecords
          .map((record) => `${record.recordedBy || ""}`.trim())
          .filter(Boolean),
      ),
    ],
  });
}
