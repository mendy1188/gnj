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

  if (!session.modules?.includes("commodities-sales")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const normalizedRange = resolveDateRange(searchParams);
  const requestedStationId = `${searchParams.get("stationId") || ""}`.trim();
  const item = `${searchParams.get("item") || ""}`.trim();
  const cursor = `${searchParams.get("cursor") || ""}`.trim();
  const cashier = `${searchParams.get("cashier") || ""}`.trim();

  if (!normalizedRange) {
    return NextResponse.json(
      { message: "Missing or invalid date range" },
      { status: 400 },
    );
  }

  if (!item) {
    return NextResponse.json({ message: "Missing item" }, { status: 400 });
  }

  const stationId = isPrivilegedRole(session.roleName)
    ? requestedStationId
    : session.branchId || requestedStationId;

  if (!stationId) {
    return NextResponse.json(
      { message: "Missing station context" },
      { status: 400 },
    );
  }

  const transactionPage = await getSalesTransactionPage({
    startDate: normalizedRange.fromDate,
    endDate: normalizedRange.toDate,
    stationId,
    branchName: isPrivilegedRole(session.roleName)
      ? ""
      : session.branchName || "",
    cashierName: shouldRestrictTransactionsToCashier(session.roleName)
      ? session.fullName || ""
      : cashier,
    categories: ["shop"],
    itemName: item,
    cursor,
    includeTotal: !cursor,
  });
  const records = transactionPage.records
    .map((record) => ({
      id: record.id,
      date: record.date,
      saleDate: record.saleDate || record.date,
      stationId: record.stationId || "",
      station: record.station || "",
      category: getCommodityBucket(record.item),
      item: record.item || "",
      cashierName: record.cashierName || "",
      customerName: record.customerName || "",
      customerPhone: record.customerPhone || "",
      paymentMethod: record.paymentMethod || "",
      quantity: Number(record.quantity || 0),
      amount: Number(record.amount || 0),
    }))
    .sort(
      (left, right) =>
        `${right.saleDate || ""}`.localeCompare(`${left.saleDate || ""}`) ||
        Number(right.amount || 0) - Number(left.amount || 0),
    );

  return NextResponse.json({
    records,
    nextCursor: transactionPage.nextCursor || "",
    hasMore: Boolean(transactionPage.hasMore),
    totalItems:
      typeof transactionPage.totalItems === "number"
        ? transactionPage.totalItems
        : null,
    pageSize: Number(transactionPage.pageSize || 20),
    cashierOptions: ["All", ...(transactionPage.availableCashiers || [])],
  });
}

function resolveDateRange(searchParams) {
  const requestedFrom = normalizeDateValue(searchParams.get("from"));
  const requestedTo = normalizeDateValue(searchParams.get("to"));

  if (!requestedFrom || !requestedTo) {
    return null;
  }

  return requestedFrom <= requestedTo
    ? { fromDate: requestedFrom, toDate: requestedTo }
    : { fromDate: requestedTo, toDate: requestedFrom };
}

function getCommodityBucket(itemName) {
  const normalizedName = `${itemName || ""}`.trim().toLowerCase();

  if (normalizedName.includes("rice")) {
    return "Rice";
  }

  if (normalizedName.includes("cooking oil")) {
    return "Cooking Oil";
  }

  return "Other Commodities";
}

function shouldRestrictTransactionsToCashier(roleName) {
  return isGeneralSales(roleName) || isFuelSales(roleName);
}
