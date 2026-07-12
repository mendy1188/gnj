import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireModuleAccess } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import {
  getPosDeviceSyncStatusData,
  getPosTransactionEnvelopesData,
} from "@/lib/data/appwrite-data";

import PosRepairsPageClient from "./page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function PosRepairsPage() {
  const session = await requireModuleAccess("admin");
  const shellProps = buildDashboardShellProps(session);

  try {
    const [envelopes, deviceSyncStatuses] = await Promise.all([
      getPosTransactionEnvelopesData({
        status: "repair_needed",
      }),
      getPosDeviceSyncStatusData(),
    ]);

    return (
      <PosRepairsPageClient
        envelopes={envelopes}
        deviceSyncStatuses={deviceSyncStatuses}
        shellProps={shellProps}
      />
    );
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="POS Envelopes"
        pageDescription="Review repair-needed POS envelopes that indicate partially applied or failed operations."
        error={error}
      />
    );
  }
}
