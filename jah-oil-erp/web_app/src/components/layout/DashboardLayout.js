import { logoutAction } from "@/features/auth/actions";

import DashboardShellClient from "./DashboardShellClient";

export default function DashboardLayout({
  children,
  title = "Operations Dashboard",
  description = "Monitor activity across all stations and business units.",
  actions = null,
  navigationItems,
  session,
}) {
  return (
    <DashboardShellClient
      title={title}
      description={description}
      actions={actions}
      logoutAction={logoutAction}
      navigationItems={navigationItems}
      session={session}
    >
      {children}
    </DashboardShellClient>
  );
}
