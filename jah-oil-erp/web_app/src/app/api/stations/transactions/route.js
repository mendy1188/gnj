import { NextResponse } from "next/server";

import {
  isFuelSales,
  isGeneralSales,
  isPrivilegedRole,
} from "@/features/auth/scopes";
import { getCurrentSession } from "@/features/auth/server";
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

  if (!session.modules?.includes("stations")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const date = normalizeDateValue(searchParams.get("date"));
  const requestedStationId = `${searchParams.get("stationId") || ""}`.trim();
  const cursor = `${searchParams.get("cursor") || ""}`.trim();
  const category = normalizeCategoryValue(searchParams.get("category"));
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
    categories: category ? [category] : [],
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
      station: record.station,
      category: record.type,
      item: record.item,
      cashierName: record.cashierName || "",
      customerName: record.customerName || "",
      customerPhone: record.customerPhone || "",
      quantity: record.quantity,
      amount: record.amount,
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

function normalizeDateValue(value) {
  const normalizedValue = `${value || ""}`.slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

function normalizeCategoryValue(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();

  if (["fuel", "shop", "cement"].includes(normalizedValue)) {
    return normalizedValue;
  }

  return "";
}

function shouldRestrictTransactionsToCashier(roleName) {
  return isGeneralSales(roleName) || isFuelSales(roleName);
}
