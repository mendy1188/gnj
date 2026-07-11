import {
  buildNavigationItems,
  MODULE_DEFINITIONS,
} from "@/features/auth/session";

export const dashboardNavigation = buildNavigationItems(
  MODULE_DEFINITIONS.map((module) => module.key),
);
