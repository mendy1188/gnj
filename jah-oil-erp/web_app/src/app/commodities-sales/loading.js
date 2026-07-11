import DashboardPageShell from "@/features/dashboard/page-shell";
import { OperationsTableLoading } from "@/components/dashboard/LoadingState";

export default function Loading() {
  return (
    <DashboardPageShell
      title="Commodity Sales"
      description="Review commodity sales by date and drill into station, item, and transaction performance."
    >
      <OperationsTableLoading filters={4} />
    </DashboardPageShell>
  );
}
