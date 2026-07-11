import DashboardPageShell from "@/features/dashboard/page-shell";
import { OperationsTableLoading } from "@/components/dashboard/LoadingState";

export default function Loading() {
  return (
    <DashboardPageShell
      title="Payment Methods"
      description="Manage which payment methods cashiers can use at checkout."
    >
      <OperationsTableLoading filters={2} summaryCards={3} split />
    </DashboardPageShell>
  );
}
