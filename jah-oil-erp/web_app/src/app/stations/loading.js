import DashboardPageShell from "@/features/dashboard/page-shell";
import { OperationsTableLoading } from "@/components/dashboard/LoadingState";

export default function Loading() {
  return (
    <DashboardPageShell
      title="Stations"
      description="Compare stations by sales, drill into daily activity, and inspect individual transactions."
    >
      <OperationsTableLoading filters={2} />
    </DashboardPageShell>
  );
}
