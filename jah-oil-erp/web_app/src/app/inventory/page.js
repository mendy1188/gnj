import { buildDashboardShellProps } from "@/features/auth/shell";
import { filterInventoryRecordsForSession } from "@/features/auth/scopes";
import { requireCurrentSession } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import InventoryPageClient from "@/features/inventory/InventoryPageClient";
import { getInventoryData } from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const session = await requireCurrentSession();
  const shellProps = buildDashboardShellProps(session);
  let inventory;

  try {
    inventory = await getInventoryData();
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Inventory"
        pageDescription="Review stock levels, reorder thresholds, and station-level inventory risk."
        error={error}
      />
    );
  }

  return (
    <InventoryPageClient
      inventoryRecords={filterInventoryRecordsForSession(inventory, session)}
      shellProps={shellProps}
    />
  );
}
