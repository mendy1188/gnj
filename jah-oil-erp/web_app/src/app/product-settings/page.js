import { buildDashboardShellProps } from "@/features/auth/shell";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import { requireModuleAccess } from "@/features/auth/server";
import {
  getInventoryData,
  getProductPriceHistoryData,
  getProductSettingsData,
} from "@/lib/data/appwrite-data";

import ProductSettingsPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function ProductSettingsPage() {
  const session = await requireModuleAccess("product-settings");
  const shellProps = buildDashboardShellProps(session);
  let products;
  let priceHistoryRecords;
  let inventoryRecords;

  try {
    [products, priceHistoryRecords, inventoryRecords] = await Promise.all([
      getProductSettingsData(),
      getProductPriceHistoryData(),
      getInventoryData(),
    ]);
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Product Settings"
        pageDescription="Manage product catalog, pricing, reorder levels, and product status."
        error={error}
      />
    );
  }

  return (
    <ProductSettingsPageClient
      products={products}
      priceHistoryRecords={priceHistoryRecords}
      inventoryRecords={inventoryRecords}
      shellProps={shellProps}
    />
  );
}
