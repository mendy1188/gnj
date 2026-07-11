import DashboardPageShell from "@/features/dashboard/page-shell";
import { OperationsTableLoading } from "@/components/dashboard/LoadingState";

export default function Loading() {
  return (
    <DashboardPageShell
      title="Product Settings"
      description="Manage the product catalog, selling prices, and product availability."
    >
      <OperationsTableLoading filters={3} summaryCards={3} split />
    </DashboardPageShell>
  );
}
