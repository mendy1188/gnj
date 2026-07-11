import { buildDashboardShellProps } from "@/features/auth/shell";
import {
  filterIncomingStockRecordsForSession,
  filterInventoryRecordsForSession,
} from "@/features/auth/scopes";
import { requireCurrentSession } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import {
  getIncomingStockData,
  getInventoryData,
} from "@/lib/data/appwrite-data";

import IncomingStockPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function IncomingStockPage() {
  const session = await requireCurrentSession();
  const shellProps = buildDashboardShellProps(session);
  let inventoryRecords;
  let incomingStockRecords;

  try {
    [inventoryRecords, incomingStockRecords] = await Promise.all([
      getInventoryData(),
      getIncomingStockData(),
    ]);
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Incoming Stock"
        pageDescription="Record stock receipts and review incoming stock history for each branch product."
        error={error}
      />
    );
  }

  return (
    <IncomingStockPageClient
      inventoryRecords={filterInventoryRecordsForSession(
        inventoryRecords,
        session,
      )}
      incomingStockRecords={filterIncomingStockRecordsForSession(
        incomingStockRecords,
        session,
      )}
      shellProps={shellProps}
    />
  );
}
