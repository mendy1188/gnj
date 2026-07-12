import DashboardPageShell from "@/features/dashboard/page-shell";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import ToastMessage from "@/components/ui/ToastMessage";
import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireModuleAccess } from "@/features/auth/server";
import {
  getClientRewardAccountByClientUserId,
  getRewardSettings,
  listClientUsers,
} from "@/features/client-users/data";
import {
  getCouponPurchasesData,
  getCouponsData,
  getCustomerBalanceAccountsData,
} from "@/lib/data/appwrite-data";

import { saveRewardSettingsAction } from "./actions";
import RewardsManagementPageClient from "./page-client";

export const dynamic = "force-dynamic";

function normalizeComparable(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function formatCurrency(value) {
  return `D${Number(value || 0).toLocaleString()}`;
}

export default async function RewardsManagementPage({ searchParams }) {
  const session = await requireModuleAccess("rewards-management");
  const shellProps = buildDashboardShellProps(session);
  const params = await searchParams;

  let clientUsers;
  let rewardSettings;
  let rewardAccounts;
  let bulkBalanceAccounts;
  let couponPurchases;
  let coupons;

  try {
    [clientUsers, rewardSettings, bulkBalanceAccounts, couponPurchases, coupons] =
      await Promise.all([
        listClientUsers(),
        getRewardSettings(),
        getCustomerBalanceAccountsData(),
        getCouponPurchasesData(),
        getCouponsData(),
      ]);
    rewardAccounts = await Promise.all(
      clientUsers.map((clientUser) =>
        getClientRewardAccountByClientUserId(clientUser.id),
      ),
    );
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Rewards Management"
        pageDescription="Manage client app users and the cash back percentage used during client fuel purchases."
        error={error}
      />
    );
  }

  const rewardAccountByUserId = new Map(
    rewardAccounts.filter(Boolean).map((account) => [account.clientUserId, account]),
  );

  const clientRows = clientUsers.map((clientUser) => {
    const rewardAccount = rewardAccountByUserId.get(clientUser.id);
    const bulkBalance = bulkBalanceAccounts
      .filter(
        (account) =>
          account.accountType === "bulk_redeem" &&
          normalizeComparable(account.customerPhone) ===
            normalizeComparable(clientUser.phone) &&
          `${account.status || ""}`.trim().toLowerCase() === "active",
      )
      .reduce((sum, account) => sum + Number(account.balanceAmount || 0), 0);
    const couponCompanyName =
      clientUser.userType === "company" ? clientUser.companyName : "";
    const companyPurchases = couponPurchases.filter(
      (purchase) =>
        normalizeComparable(purchase.companyName) ===
        normalizeComparable(couponCompanyName),
    );
    const purchaseIds = new Set(companyPurchases.map((purchase) => purchase.id));
    const activeCouponValue = coupons
      .filter(
        (coupon) =>
          purchaseIds.has(coupon.purchaseId) &&
          ["active", "partially_redeemed"].includes(
            `${coupon.status || ""}`.trim().toLowerCase(),
          ),
      )
      .reduce((sum, coupon) => sum + Number(coupon.remainingValue || 0), 0);

    return {
      ...clientUser,
      rewardBalance: Number(rewardAccount?.balanceAmount || 0),
      bulkBalance: Number(bulkBalance.toFixed(2)),
      couponBalance: Number(activeCouponValue.toFixed(2)),
    };
  });

  const totalRewardBalance = clientRows.reduce(
    (sum, row) => sum + Number(row.rewardBalance || 0),
    0,
  );
  const totalBulkBalance = clientRows.reduce(
    (sum, row) => sum + Number(row.bulkBalance || 0),
    0,
  );
  const error = typeof params?.error === "string" ? params.error : "";
  const success = typeof params?.success === "string" ? params.success : "";

  return (
    <DashboardPageShell
      title="Rewards Management"
      description="Manage client app users, reward balances, and the cash back percentage applied on client fuel purchases."
      {...shellProps}
    >
      <ToastMessage
        message={error || success}
        tone={error ? "error" : success ? "success" : "info"}
      />

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="xl:col-span-12">
            {/* <h2 className="mt-2 text-xl font-semibold text-slate-900">
              Reward rule
            </h2> */}
            {/* <h2 className="mt-2 text-xl font-semibold text-slate-900">
              Cash back percentage
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              This percentage is credited to the client reward wallet on each eligible
              client fuel sale.
            </p> */}
          </div>
          <div className="grid gap-6 xl:col-span-12 xl:grid-cols-12">
            <form action={saveRewardSettingsAction} className="space-y-4 xl:col-span-4">
              <div>
                <label className="block text-sm font-medium text-slate-600" htmlFor="cashBackPercent">
                  Cash back percent
                </label>
                <input
                  id="cashBackPercent"
                  name="cashBackPercent"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={rewardSettings.cashBackPercent}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="cursor-pointer inline-flex rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                Save reward settings
              </button>
            </form>

            <div className="grid gap-3 sm:grid-cols-2 xl:col-span-8 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Clients</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {clientRows.length.toLocaleString()}
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Reward balance
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatCurrency(totalRewardBalance)}
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Bulk fuel balance
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatCurrency(totalBulkBalance)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <RewardsManagementPageClient clientRows={clientRows} />
    </DashboardPageShell>
  );
}
