import CreditAccountRecordsPage from "@/features/credit-management/CreditAccountRecordsPage";

export const dynamic = "force-dynamic";

export default async function CreditAgreementPage({ params }) {
  const { accountId } = await params;
  return <CreditAccountRecordsPage accountId={accountId} mode="agreement" />;
}
