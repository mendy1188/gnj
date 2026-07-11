import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireModuleAccess } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import {
  getCustomerBalanceAccountsData,
  getCustomerBalanceMovementsData,
  getProductsData,
  getStationsData,
} from "@/lib/data/appwrite-data";

import BalanceManagementPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function BalanceManagementPage() {
  const session = await requireModuleAccess("balance-management");
  const shellProps = buildDashboardShellProps(session);
  let balanceAccounts;
  let movementRecords;
  let stations;
  let products;

  try {
    [balanceAccounts, movementRecords, stations, products] = await Promise.all([
      getCustomerBalanceAccountsData(),
      getCustomerBalanceMovementsData(),
      getStationsData(),
      getProductsData(),
    ]);
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Credit Settlements"
        pageDescription="Manage customer credit accounts and record settlements."
        error={error}
      />
    );
  }

  return (
    <BalanceManagementPageClient
      balanceAccounts={balanceAccounts}
      movementRecords={movementRecords}
      stations={stations}
      products={products}
      shellProps={shellProps}
    />
  );
}
