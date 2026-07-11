import DashboardPageShell from "@/features/dashboard/page-shell";
import { OperationsTableLoading } from "@/components/dashboard/LoadingState";

export default function Loading() {
  return (
    <DashboardPageShell
      title="Fuel Deliveries"
      description="Review dispatches, arrivals, and pending fuel replenishment activity across stations."
    >
      <OperationsTableLoading filters={4} />
    </DashboardPageShell>
  );
}
