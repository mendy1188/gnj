import { buildDashboardShellProps } from "@/features/auth/shell";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import { requireModuleAccess } from "@/features/auth/server";
import { getStationsData } from "@/lib/data/appwrite-data";

import StationSettingsPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function StationSettingsPage() {
  const session = await requireModuleAccess("station-settings");
  const shellProps = buildDashboardShellProps(session);
  let stations;

  try {
    stations = await getStationsData();
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Station Settings"
        pageDescription="Manage station records, operational details, and branch setup."
        error={error}
      />
    );
  }

  return (
    <StationSettingsPageClient
      stations={stations}
      shellProps={shellProps}
    />
  );
}
