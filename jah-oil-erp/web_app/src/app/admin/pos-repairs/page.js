import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireModuleAccess } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import { getPosTransactionEnvelopesData } from "@/lib/data/appwrite-data";

import PosRepairsPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function PosRepairsPage() {
  const session = await requireModuleAccess("admin");
  const shellProps = buildDashboardShellProps(session);

  try {
    const envelopes = await getPosTransactionEnvelopesData();

    return (
      <PosRepairsPageClient
        envelopes={envelopes}
        shellProps={shellProps}
      />
    );
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="POS Repairs"
        pageDescription="Review POS sale and reversal operations that need consistency checks."
        error={error}
      />
    );
  }
}
