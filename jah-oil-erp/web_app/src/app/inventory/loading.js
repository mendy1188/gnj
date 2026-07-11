import DashboardPageShell from "@/features/dashboard/page-shell";
import { OperationsTableLoading } from "@/components/dashboard/LoadingState";

export default function Loading() {
  return (
    <DashboardPageShell
      title="Inventory"
      description="Track stock levels, identify shortages, and drill into station-level inventory positions."
    >
      <OperationsTableLoading filters={3} split={false} />
    </DashboardPageShell>
  );
}
