import DashboardPageShell from "@/features/dashboard/page-shell";
import { DashboardOverviewLoading } from "@/components/dashboard/LoadingState";

export default function Loading() {
  return (
    <DashboardPageShell
      title="Operations Dashboard"
      description="Monitor fuel, shop, and cement performance from one secure command center."
    >
      <DashboardOverviewLoading />
    </DashboardPageShell>
  );
}
