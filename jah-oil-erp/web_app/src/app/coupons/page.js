import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireModuleAccess } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import {
  getCouponCompaniesData,
  getCouponPurchasesData,
  getCouponsData,
} from "@/lib/data/appwrite-data";

import CouponsPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const session = await requireModuleAccess("coupons");
  const shellProps = buildDashboardShellProps(session);
  let companies;
  let purchases;
  let coupons;

  try {
    [companies, purchases, coupons] = await Promise.all([
      getCouponCompaniesData(),
      getCouponPurchasesData(),
      getCouponsData(),
    ]);
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Coupons"
        pageDescription="View active coupons, their owning company, and the coupon values created under each purchase."
        error={error}
      />
    );
  }

  return (
    <CouponsPageClient
      companies={companies}
      purchases={purchases}
      coupons={coupons}
      shellProps={shellProps}
    />
  );
}
