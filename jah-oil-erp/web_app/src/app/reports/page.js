import { buildDashboardShellProps } from "@/features/auth/shell";
import {
  getReportHeroHeading,
  getReportsPageMeta,
  getReportScopeLabel,
  getVisibleReports,
} from "@/features/reports/catalog";
import { requireModuleAccess } from "@/features/auth/server";
import DashboardPageShell from "@/features/dashboard/page-shell";
import ReportsPageClient from "./page-client";

export default async function ReportsPage() {
  const session = await requireModuleAccess("reports");
  const shellProps = buildDashboardShellProps(session);
  const reportMeta = getReportsPageMeta(session);
  const visibleReports = getVisibleReports(session);
  const scopeLabel = getReportScopeLabel(session);
  const heroHeading = getReportHeroHeading(session);

  return (
    <DashboardPageShell
      title={reportMeta.title}
      description={reportMeta.description}
      {...shellProps}
    >
      <ReportsPageClient
        visibleReports={visibleReports}
        reportMeta={reportMeta}
        scopeLabel={scopeLabel}
        heroHeading={heroHeading}
      />
    </DashboardPageShell>
  );
}
