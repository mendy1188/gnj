import { NextResponse } from "next/server";

import { isPrivilegedRole } from "@/features/auth/scopes";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { getRequestSession } from "@/features/auth/request-session";
import { getPosReceiptPage } from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

function getMobilePosTransactionsErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Mobile POS",
    genericLabel: "load cashier transactions",
    fallbackMessage: "Failed to load cashier transactions.",
  });
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateValue(value) {
  const normalizedValue = `${value || ""}`.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)
    ? normalizedValue
    : getTodayDateString();
}

export async function GET(request) {
  const session = await getRequestSession(request);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized." },
      { status: 401 },
    );
  }

  if (!session.modules?.includes("pos")) {
    return NextResponse.json(
      { success: false, message: "You do not have access to the POS module." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const date = normalizeDateValue(searchParams.get("date"));
  const requestedStationId = `${searchParams.get("stationId") || ""}`.trim();
  const cursor = `${searchParams.get("cursor") || ""}`.trim();
  const requestedPageSize = Number.parseInt(
    `${searchParams.get("pageSize") || "20"}`,
    10,
  );
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.max(1, Math.min(requestedPageSize, 100))
    : 20;
  const stationId = isPrivilegedRole(session.roleName)
    ? requestedStationId
    : session.branchId || requestedStationId;

  try {
    const transactionPage = await getPosReceiptPage({
      startDate: date,
      endDate: date,
      stationId,
      branchName: isPrivilegedRole(session.roleName) ? "" : session.branchName || "",
      cashierName: session.fullName || "",
      cursor,
      limit: pageSize,
      includeTotal: !cursor,
    });

    return NextResponse.json({
      success: true,
      date,
      totalTransactions:
        typeof transactionPage.totalItems === "number"
          ? transactionPage.totalItems
          : null,
      totalAmount:
        typeof transactionPage.totalAmount === "number"
          ? transactionPage.totalAmount
          : null,
      nextCursor: transactionPage.nextCursor || "",
      hasMore: Boolean(transactionPage.hasMore),
      pageSize: Number(transactionPage.pageSize || pageSize),
      records: transactionPage.records.map((record) => ({
        id: record.id,
        receiptId: record.receiptId || record.id,
        receiptNumber: record.receiptNumber || "",
        date: record.date,
        saleDate: record.saleDate || record.date,
        stationId: record.stationId || "",
        itemSummary: record.itemSummary || "",
        itemCount: Number(record.itemCount || 0),
        amount: Number(record.amount || 0),
        station: record.station || "",
        cashierName: record.cashierName || "",
        customerName: record.customerName || "",
        customerPhone: record.customerPhone || "",
        paymentMethod: record.paymentMethod || "",
        paymentStatus: record.paymentStatus || "",
        status: record.status || "",
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getMobilePosTransactionsErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
