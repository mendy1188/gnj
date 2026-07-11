import DashboardPageShell from "@/features/dashboard/page-shell";

export default function IncomingStockLoading() {
  return (
    <DashboardPageShell
      title="Incoming Stock"
      description="Record stock receipts and review incoming stock history for each branch product."
    >
      <div className="animate-pulse space-y-6">
        <div className="rounded-[1rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-10 rounded-lg bg-slate-100" />
            <div className="h-10 rounded-lg bg-slate-100" />
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <div className="h-24 rounded-2xl border border-slate-200 bg-white" />
          <div className="h-24 rounded-2xl border border-slate-200 bg-white" />
          <div className="h-24 rounded-2xl border border-slate-200 bg-white" />
        </div>
        <div className="h-96 rounded-[1.75rem] border border-slate-200 bg-white" />
      </div>
    </DashboardPageShell>
  );
}
