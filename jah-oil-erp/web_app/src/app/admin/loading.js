import DashboardPageShell from "@/features/dashboard/page-shell";

function SkeletonCard({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)] ${className}`}
    >
      <div className="h-5 w-32 rounded-full bg-slate-200" />
      <div className="mt-3 h-4 w-56 rounded-full bg-slate-100" />
      <div className="mt-6 space-y-3">
        <div className="h-12 rounded-2xl bg-slate-100" />
        <div className="h-12 rounded-2xl bg-slate-100" />
        <div className="h-12 rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}

export default function AdminLoading() {
  return (
    <DashboardPageShell
      title="Admin"
      description="Manage users, roles, and module access across the ERP."
    >
      <div className="grid gap-6 xl:grid-cols-12">
        <SkeletonCard className="xl:col-span-7" />
        <SkeletonCard className="xl:col-span-5" />
      </div>
      <SkeletonCard />
    </DashboardPageShell>
  );
}
