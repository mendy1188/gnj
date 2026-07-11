import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireModuleAccess } from "@/features/auth/server";
import { isPrivilegedRole } from "@/features/auth/scopes";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import { getReversedPosTransactionsData } from "@/lib/data/appwrite-data";

import ReverseTransactionsPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function ReverseTransactionsPage() {
  const session = await requireModuleAccess("reverse-transactions");
  const shellProps = buildDashboardShellProps(session);

  try {
    const reversedTransactions = await getReversedPosTransactionsData(
      isPrivilegedRole(session.roleName)
        ? {}
        : {
            stationId: session.branchId || "",
            branchName: session.branchName || "",
          },
    );

    return (
      <ReverseTransactionsPageClient
        reversedTransactions={reversedTransactions}
        shellProps={shellProps}
      />
    );
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Reversed Transactions"
        pageDescription="Review reversed POS transactions by station and see who reversed them."
        error={error}
      />
    );
  }
}
