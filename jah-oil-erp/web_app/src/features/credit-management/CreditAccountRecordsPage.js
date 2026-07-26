import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireModuleAccess } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";

import CreditAccountRecordsPageClient from "./CreditAccountRecordsPageClient";
import { getCreditAccountSupportData } from "./server";

const MODE_COPY = {
  guarantor: {
    title: "Credit Guarantor",
    description: "Add or review the guarantor attached to this credit account.",
  },
  agreement: {
    title: "Credit Agreement",
    description: "Upload and review signed credit agreement documents.",
  },
  documents: {
    title: "Creditor Documents",
    description:
      "Store creditor identity and supporting collateral information securely.",
  },
  "follow-ups": {
    title: "Creditor Follow-ups",
    description:
      "Review notification and reminder delivery history for this creditor.",
  },
};

export default async function CreditAccountRecordsPage({ accountId, mode }) {
  const session = await requireModuleAccess("balance-management");
  const shellProps = buildDashboardShellProps(session);
  const copy = MODE_COPY[mode] || MODE_COPY.documents;

  try {
    const supportData = await getCreditAccountSupportData(accountId, { mode });

    return (
      <CreditAccountRecordsPageClient
        {...supportData}
        mode={mode}
        shellProps={shellProps}
      />
    );
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle={copy.title}
        pageDescription={copy.description}
        error={error}
      />
    );
  }
}
