import "server-only";

import { getCurrentSession } from "@/features/auth/server";
import {
  buildNavigationItems,
  getUserInitials,
} from "@/features/auth/session";

export function buildDashboardShellProps(session) {
  return {
    navigationItems: buildNavigationItems(session?.modules || []),
    session: session
      ? {
          userId: session.userId,
          fullName: session.fullName,
          roleName: session.roleName,
          initials: getUserInitials(session.fullName),
          branchId: session.branchId,
          branchName: session.branchName,
        }
      : null,
  };
}

export async function getDashboardShellProps() {
  const session = await getCurrentSession();

  return buildDashboardShellProps(session);
}
