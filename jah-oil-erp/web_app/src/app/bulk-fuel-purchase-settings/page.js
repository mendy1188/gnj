import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireModuleAccess } from "@/features/auth/server";
import {
  getBulkFuelClientsData,
  getCustomerBalanceAccountsData,
  getCustomerBalanceMovementsData,
  getProductsData,
} from "@/lib/data/appwrite-data";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";

import BulkFuelPurchaseSettingsPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function BulkFuelPurchaseSettingsPage() {
  const session = await requireModuleAccess("bulk-fuel-purchase-settings");
  const shellProps = buildDashboardShellProps(session);
  let clients;
  let balanceAccounts;
  let movementRecords;
  let products;

  try {
    [clients, balanceAccounts, movementRecords, products] = await Promise.all([
      getBulkFuelClientsData(),
      getCustomerBalanceAccountsData(),
      getCustomerBalanceMovementsData(),
      getProductsData(),
    ]);
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Bulk Fuel Purchase Settings"
        pageDescription="Manage bulk fuel clients and record new funded fuel purchases for later redemption."
        error={error}
      />
    );
  }

  return (
    <BulkFuelPurchaseSettingsPageClient
      clients={clients}
      balanceAccounts={balanceAccounts}
      movementRecords={movementRecords}
      products={products}
      shellProps={shellProps}
    />
  );
}
