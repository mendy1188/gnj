import DashboardPageShell from "@/features/dashboard/page-shell";
import { getDashboardShellProps } from "@/features/auth/shell";

export default async function NotificationSettingsLoading() {
  const shellProps = await getDashboardShellProps();

  return (
    <DashboardPageShell
      title="Notification Settings"
      description="Configure popup, email, and SMS notification rules for credit accounts."
      {...shellProps}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-32 animate-pulse rounded-3xl bg-slate-100"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-[1.75rem] bg-slate-100" />
    </DashboardPageShell>
  );
}
