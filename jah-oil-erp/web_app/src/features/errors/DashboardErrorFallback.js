import AppErrorState from "@/components/feedback/AppErrorState";
import DashboardPageShell from "@/features/dashboard/page-shell";
import { ROLE_NAMES } from "@/features/auth/session";

import { resolveErrorCopy } from "./copy";

export default function DashboardErrorFallback({
  shellProps,
  pageTitle,
  pageDescription,
  error,
}) {
  const copy = resolveErrorCopy(error, {
    moduleName: pageTitle,
    genericLabel: `load ${pageTitle}`,
  });
  const showTechnicalDetails =
    shellProps?.session?.roleName === ROLE_NAMES.ADMIN;

  return (
    <DashboardPageShell
      title={pageTitle}
      description={pageDescription}
      {...shellProps}
    >
      <AppErrorState
        title={copy.title}
        message={copy.message}
        guidance={copy.guidance}
        technicalDetails={copy.technicalDetails}
        digest={copy.digest}
        showTechnicalDetails={showTechnicalDetails}
      />
    </DashboardPageShell>
  );
}
