import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireModuleAccess } from "@/features/auth/server";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import {
  getCouponCompaniesData,
  getCouponPurchasesData,
  getCouponsData,
} from "@/lib/data/appwrite-data";

import CouponPurchasesPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function CouponPurchasesPage() {
  const session = await requireModuleAccess("coupon-purchases");
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
        pageTitle="Purchase Coupons"
        pageDescription="Create coupon companies, record coupon purchases, and generate coupon codes."
        error={error}
      />
    );
  }

  return (
    <CouponPurchasesPageClient
      companies={companies}
      purchases={purchases}
      coupons={coupons}
      shellProps={shellProps}
    />
  );
}
