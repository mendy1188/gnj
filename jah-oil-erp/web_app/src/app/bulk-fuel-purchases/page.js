import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireModuleAccess } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import {
  getBulkFuelClientsData,
  getCustomerBalanceAccountsData,
  getCustomerBalanceMovementsData,
} from "@/lib/data/appwrite-data";

import BulkFuelPurchasesPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function BulkFuelPurchasesPage() {
  const session = await requireModuleAccess("bulk-fuel-purchases");
  const shellProps = buildDashboardShellProps(session);
  let clients;
  let balanceAccounts;
  let movementRecords;

  try {
    [clients, balanceAccounts, movementRecords] = await Promise.all([
      getBulkFuelClientsData(),
      getCustomerBalanceAccountsData(),
      getCustomerBalanceMovementsData(),
    ]);
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Bulk Fuel Purchases"
        pageDescription="Review active bulk fuel purchases, their clients, and each redeem that has been logged against them."
        error={error}
      />
    );
  }

  return (
    <BulkFuelPurchasesPageClient
      clients={clients}
      balanceAccounts={balanceAccounts}
      movementRecords={movementRecords}
      shellProps={shellProps}
    />
  );
}
