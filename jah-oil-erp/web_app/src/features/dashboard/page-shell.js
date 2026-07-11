import DashboardLayout from "@/components/layout/DashboardLayout";

export default function DashboardPageShell({
  title,
  description,
  children,
  actions,
  navigationItems,
  session,
}) {
  return (
    <DashboardLayout
      title={title}
      description={description}
      actions={actions}
      navigationItems={navigationItems}
      session={session}
    >
      <div className="flex flex-col justify-start space-y-8">{children}</div>
    </DashboardLayout>
  );
}
