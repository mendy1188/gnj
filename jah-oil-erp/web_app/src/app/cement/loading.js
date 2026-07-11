import DashboardPageShell from "@/features/dashboard/page-shell";
import { OperationsTableLoading } from "@/components/dashboard/LoadingState";

export default function Loading() {
  return (
    <DashboardPageShell
      title="Cement Operations"
      description="Track cement distribution, product availability, and sales performance."
    >
      <OperationsTableLoading filters={2} />
    </DashboardPageShell>
  );
}
