import DashboardPageShell from "@/features/dashboard/page-shell";
import { OperationsTableLoading } from "@/components/dashboard/LoadingState";

export default function Loading() {
  return (
    <DashboardPageShell
      title="Fuel Sales"
      description="Review recent fuel transactions and station-level sales performance."
    >
      <OperationsTableLoading filters={2} />
    </DashboardPageShell>
  );
}
