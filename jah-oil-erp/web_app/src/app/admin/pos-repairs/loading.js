import DashboardPageShell from "@/features/dashboard/page-shell";

function SkeletonCard({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)] ${className}`}
    >
      <div className="h-5 w-36 rounded-full bg-slate-200" />
      <div className="mt-3 h-4 w-64 rounded-full bg-slate-100" />
      <div className="mt-6 space-y-3">
        <div className="h-12 rounded-2xl bg-slate-100" />
        <div className="h-12 rounded-2xl bg-slate-100" />
        <div className="h-12 rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}

export default function PosEnvelopesLoading() {
  return (
    <DashboardPageShell
      title="POS Envelopes"
      description="Review repair-needed POS envelopes that indicate partially applied or failed operations."
    >
      <SkeletonCard />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard />
    </DashboardPageShell>
  );
}
