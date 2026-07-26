import { buildDashboardShellProps } from "@/features/auth/shell";
import {
  filterProductsForSession,
  filterStationsForPosSession,
} from "@/features/auth/scopes";
import { requireModuleAccess } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import {
  getActivePaymentMethodsData,
  getProductsData,
  getStationsData,
} from "@/lib/data/appwrite-data";

import PosPageClient from "../pos/page-client";

export const dynamic = "force-dynamic";

export default async function CreditSalePage() {
  const session = await requireModuleAccess("pos");
  const shellProps = buildDashboardShellProps(session);
  let products;
  let stations;
  let paymentMethods;

  try {
    [products, stations, paymentMethods] = await Promise.all([
      getProductsData(),
      getStationsData(),
      getActivePaymentMethodsData(),
    ]);
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Credit Sale"
        pageDescription="Record approved customer sales on credit."
        error={error}
      />
    );
  }

  return (
    <PosPageClient
      products={filterProductsForSession(products, session)}
      stations={filterStationsForPosSession(stations, session)}
      paymentMethods={paymentMethods}
      allowedPaymentMethodCodes={["credit"]}
      pageTitle="Credit Sale"
      pageDescription="Record approved customer sales on credit."
      saleChannel="credit-sale"
      allowPaymentMethodFallback={false}
      shellProps={shellProps}
    />
  );
}
