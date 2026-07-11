import { NextResponse } from "next/server";

import {
  isFuelSales,
  isGeneralSales,
  isPrivilegedRole,
} from "@/features/auth/scopes";
import { getCurrentSession } from "@/features/auth/server";
import { normalizeDateValue } from "@/features/sales/page-helpers";
import { getSalesTransactionPage } from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

const TYPE_CONFIG = {
  fuel: {
    moduleKey: "fuel-sales",
    allowedTypes: ["Fuel"],
    categories: ["fuel"],
  },
  cement: {
    moduleKey: "cement",
    allowedTypes: ["Cement"],
    categories: ["cement"],
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
  const config = TYPE_CONFIG[type];

  if (!config) {
    return NextResponse.json(
      { message: "Invalid sales type" },
      { status: 400 },
    );
  }

  if (!session.modules?.includes(config.moduleKey)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const date = normalizeDateValue(searchParams.get("date"));
  const requestedStationId = `${searchParams.get("stationId") || ""}`.trim();
  const cursor = `${searchParams.get("cursor") || ""}`.trim();
  const item = `${searchParams.get("item") || ""}`.trim();
  const cashier = `${searchParams.get("cashier") || ""}`.trim();

  if (!date) {
    return NextResponse.json(
      { message: "Missing or invalid date" },
      { status: 400 },
    );
  }

  const stationId = isPrivilegedRole(session.roleName)
    ? requestedStationId
    : session.branchId || requestedStationId;
  const transactionPage = await getSalesTransactionPage({
    startDate: date,
    endDate: date,
    stationId,
    branchName: isPrivilegedRole(session.roleName)
      ? ""
      : session.branchName || "",
    cashierName: shouldRestrictTransactionsToCashier(session.roleName)
      ? session.fullName || ""
      : cashier,
    categories: config.categories,
    itemName: item,
    cursor,
    includeTotal: !cursor,
  });

  return NextResponse.json({
    records: transactionPage.records.map((record) => ({
      id: record.id,
      date: record.date,
      saleDate: record.saleDate || record.date,
      stationId: record.stationId || "",
      station: record.station || "",
      category: record.category || record.type || "",
      item: record.item || "",
      cashierName: record.cashierName || "",
      customerName: record.customerName || "",
      customerPhone: record.customerPhone || "",
      paymentMethod: record.paymentMethod || "",
      quantity: Number(record.quantity || 0),
      amount: Number(record.amount || 0),
    })),
    nextCursor: transactionPage.nextCursor || "",
    hasMore: Boolean(transactionPage.hasMore),
    totalItems:
      typeof transactionPage.totalItems === "number"
        ? transactionPage.totalItems
        : null,
    pageSize: Number(transactionPage.pageSize || 20),
    itemOptions: ["All", ...(transactionPage.availableItems || [])],
    cashierOptions: ["All", ...(transactionPage.availableCashiers || [])],
  });
}

function shouldRestrictTransactionsToCashier(roleName) {
  return isGeneralSales(roleName) || isFuelSales(roleName);
}
