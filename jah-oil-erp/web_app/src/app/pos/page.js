import { buildDashboardShellProps } from "@/features/auth/shell";
import {
  filterProductsForSession,
  filterStationsForPosSession,
} from "@/features/auth/scopes";
import { requireCurrentSession } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import PosPageClient from "./page-client";

import {
  getActivePaymentMethodsData,
  getProductsData,
  getStationsData,
} from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await requireCurrentSession();
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
        pageTitle="POS"
        pageDescription="Record sales, build receipts, and complete branch transactions."
        error={error}
      />
    );
  }

  return (
    <PosPageClient
      products={filterProductsForSession(products, session)}
      stations={filterStationsForPosSession(stations, session)}
      paymentMethods={paymentMethods.filter(
        (method) => `${method?.code || ""}`.trim().toLowerCase() !== "credit",
      )}
      excludedPaymentMethodCodes={["credit"]}
      allowPaymentMethodFallback={false}
      shellProps={shellProps}
    />
  );
}
