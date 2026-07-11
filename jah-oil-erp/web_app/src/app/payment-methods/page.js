import { buildDashboardShellProps } from "@/features/auth/shell";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import { requireModuleAccess } from "@/features/auth/server";
import { getPaymentMethodSettingsData } from "@/lib/data/appwrite-data";

import PaymentMethodsPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function PaymentMethodsPage() {
  const session = await requireModuleAccess("payment-methods");
  const shellProps = buildDashboardShellProps(session);
  let paymentMethods;

  try {
    paymentMethods = await getPaymentMethodSettingsData();
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Payment Methods"
        pageDescription="Choose which payment methods are allowed in POS and control their checkout labels."
        error={error}
      />
    );
  }

  return (
    <PaymentMethodsPageClient
      paymentMethods={paymentMethods}
      shellProps={shellProps}
    />
  );
}
