import { NextResponse } from "next/server";

import { normalizeBulkFuelPhone } from "@/features/bulk-fuel/helpers";
import {
  getClientRewardAccountByClientUserId,
  getClientUserById,
  getRewardSettings,
  listFuelGiftPurchasesByClientUserId,
  listClientRewardMovementsByClientUserId,
  listFuelGiftCodesByClientUserId,
} from "@/features/client-users/data";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import {
  getCouponPurchasesData,
  getClientRecentSalesActivities,
  getCouponsData,
  getCustomerBalanceAccountsData,
  getCustomerBalanceMovementsData,
  getProductsData,
} from "@/lib/data/appwrite-data";

import { getClientRequestSession, sanitizeClientSession } from "../../auth/_shared";

export const dynamic = "force-dynamic";

const MOBILE_MONEY_PROVIDERS = [
  { code: "wave", label: "Wave", placeholder: "Enter Wave number" },
  { code: "qmoney", label: "QMoney", placeholder: "Enter QMoney number" },
  { code: "afrimoney", label: "Afrimoney", placeholder: "Enter Afrimoney number" },
];

function getBootstrapErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Client App",
    genericLabel: "load your dashboard",
    fallbackMessage:
      "We could not load your dashboard right now. Try again, and if the problem continues, contact support.",
  });
}

function normalizeComparable(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function buildBulkBalances(balanceAccounts, movementRecords, clientPhone) {
  const normalizedPhone = normalizeBulkFuelPhone(clientPhone);
  const matchingAccounts = balanceAccounts.filter(
    (account) =>
      account.accountType === "bulk_redeem" &&
      normalizeBulkFuelPhone(account.customerPhone) === normalizedPhone &&
      `${account.productCategory || ""}`.trim().toLowerCase() === "fuel",
  );
  const movementAccountIds = new Set(matchingAccounts.map((account) => account.id));
  const matchingMovements = movementRecords.filter((movement) =>
    movementAccountIds.has(movement.accountId),
  );
  const grouped = new Map();

  matchingAccounts.forEach((account) => {
    const key = account.productId || account.productName;
    const current = grouped.get(key) || {
      productId: account.productId || "",
      productCode: normalizeComparable(account.productName),
      productName: account.productName || "",
      unit: account.unit || "litre",
      availableAmount: 0,
      references: [],
      latestUpdatedAt: account.updatedAt || account.createdAt || "",
    };

    current.availableAmount += Number(account.balanceAmount || 0);
    current.references.push({
      accountId: account.id,
      referenceCode: account.referenceCode,
      availableAmount: Number(account.balanceAmount || 0),
      createdAt: account.createdAt || "",
      updatedAt: account.updatedAt || "",
    });
    current.latestUpdatedAt =
      `${account.updatedAt || account.createdAt || ""}` > `${current.latestUpdatedAt || ""}`
        ? account.updatedAt || account.createdAt || ""
        : current.latestUpdatedAt;
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((balance) => {
      const sortedReferences = balance.references.sort(
        (left, right) =>
          `${left.createdAt || ""}`.localeCompare(`${right.createdAt || ""}`) ||
          `${left.updatedAt || ""}`.localeCompare(`${right.updatedAt || ""}`),
      );
      const totalQuantity = matchingAccounts
        .filter((account) => (account.productId || account.productName) === (balance.productId || balance.productName))
        .reduce((sum, account) => sum + Number(account.balanceQuantity || 0), 0);

      return {
        ...balance,
        availableAmount: Number(balance.availableAmount.toFixed(2)),
        availableQuantity: Number(totalQuantity.toFixed(2)),
        primaryReferenceCode: sortedReferences.find(
          (reference) => Number(reference.availableAmount || 0) > 0,
        )?.referenceCode || "",
      };
    })
    .sort((left, right) => right.availableAmount - left.availableAmount);
}

function buildCouponSummary(clientUser, couponPurchases, coupons) {
  const companyName = normalizeComparable(clientUser.companyName);

  if (clientUser.userType !== "company" || !companyName) {
    return {
      purchaseCount: 0,
      activeCouponCount: 0,
      remainingValue: 0,
    };
  }

  const matchingPurchases = couponPurchases.filter(
    (purchase) => normalizeComparable(purchase.companyName) === companyName,
  );
  const purchaseIds = new Set(matchingPurchases.map((purchase) => purchase.id));
  const matchingCoupons = coupons.filter((coupon) => purchaseIds.has(coupon.purchaseId));
  const activeCoupons = matchingCoupons.filter((coupon) =>
    ["active", "partially_redeemed"].includes(`${coupon.status || ""}`.trim().toLowerCase()),
  );

  return {
    purchaseCount: matchingPurchases.length,
    activeCouponCount: activeCoupons.length,
    remainingValue: Number(
      activeCoupons
        .reduce((sum, coupon) => sum + Number(coupon.remainingValue || 0), 0)
        .toFixed(2),
    ),
  };
}

function buildRecentActivities({
  clientSales,
  rewardMovements,
  bulkBalances,
  fuelGiftPurchases,
  fuelGiftCodes,
}) {
  const activities = [];

  clientSales.forEach((sale) => {
    activities.push({
      id: sale.id,
      type: sale.type,
      title: sale.title,
      subtitle: sale.subtitle,
      amount: Number(sale.amount || 0),
      createdAt: sale.createdAt || "",
    });
  });

  rewardMovements.forEach((movement) => {
    const normalizedMovementType = `${movement.movementType || ""}`.trim().toLowerCase();
    const isCashBackReversal = normalizedMovementType === "reversal";
    const activityType = isCashBackReversal
      ? "cashback-reversed"
      : movement.direction === "credit"
        ? "cashback-earned"
        : "cashback-redeemed";
    const activityTitle = isCashBackReversal
      ? "Cash back reversed"
      : movement.direction === "credit"
        ? "Cash back earned"
        : "Cash back redeemed";
    const activitySubtitleParts = [
      movement.stationName || "Cash back wallet",
      isCashBackReversal ? "Sale reversed" : "",
      movement.receiptNumber ? `Receipt ${movement.receiptNumber}` : "",
    ].filter(Boolean);

    activities.push({
      id: movement.id,
      type: activityType,
      title: activityTitle,
      subtitle: activitySubtitleParts.join(" · "),
      amount: Math.abs(Number(movement.amountDelta || 0)),
      createdAt: movement.movementDate || "",
    });
  });

  bulkBalances.forEach((balance) => {
    activities.push({
      id: `bulk-${balance.productId || balance.productName}`,
      type: "bulk-balance",
      title: `${balance.productName} bulk balance`,
      subtitle: balance.primaryReferenceCode || "Bulk fuel balance",
      amount: Number(balance.availableAmount || 0),
      createdAt: balance.latestUpdatedAt || "",
    });
  });

  const purchaseKeys = new Set();

  fuelGiftPurchases.forEach((purchase) => {
    const activityAt =
      purchase.redeemedAt ||
      purchase.cancelledAt ||
      purchase.updatedAt ||
      purchase.createdAt ||
      "";
    const normalizedStatus = `${purchase.status || ""}`.trim().toLowerCase();
    const title =
      normalizedStatus === "redeemed"
        ? `Fuel gift redeemed for ${purchase.recipientName}`
        : normalizedStatus === "cancelled"
          ? `Fuel gift cancelled for ${purchase.recipientName}`
          : `Fuel gift created for ${purchase.recipientName}`;
    const subtitleParts = [
      purchase.productName || "Fuel",
      purchase.giftCode || "",
      purchase.stationName || "",
    ].filter(Boolean);

    activities.push({
      id: `gift-purchase-${purchase.id}`,
      type: "gift-code",
      title,
      subtitle: subtitleParts.join(" · "),
      amount: Number(purchase.amount || 0),
      createdAt: activityAt,
    });

    if (purchase.giftCodeId || purchase.giftCode) {
      purchaseKeys.add(purchase.giftCodeId || purchase.giftCode);
    }
  });

  fuelGiftCodes.forEach((gift) => {
    const key = gift.id || gift.code;

    if (key && purchaseKeys.has(key)) {
      return;
    }

    const activityAt = gift.redeemedAt || gift.createdAt || "";
    const normalizedStatus = `${gift.status || ""}`.trim().toLowerCase();
    const title =
      normalizedStatus === "redeemed"
        ? `Fuel gift redeemed for ${gift.recipientName}`
        : normalizedStatus === "cancelled"
          ? `Fuel gift cancelled for ${gift.recipientName}`
          : `Fuel gift created for ${gift.recipientName}`;
    const subtitleParts = [
      gift.productName || "Fuel",
      gift.code || "",
      gift.stationName || "",
    ].filter(Boolean);

    activities.push({
      id: `gift-code-${gift.id}`,
      type: "gift-code",
      title,
      subtitle: subtitleParts.join(" · "),
      amount: Number(gift.amount || 0),
      createdAt: activityAt,
    });
  });

  return activities
    .sort((left, right) =>
      `${right.createdAt || ""}`.localeCompare(`${left.createdAt || ""}`),
    )
    .slice(0, 20);
}

export async function GET(request) {
  try {
    const session = await getClientRequestSession(request);

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        { status: 401 },
      );
    }

    const [clientUser, rewardSettings, rewardAccount, rewardMovements, fuelGiftCodes, fuelGiftPurchases, products, balanceAccounts, balanceMovements, couponPurchases, coupons] =
      await Promise.all([
        getClientUserById(session.userId),
        getRewardSettings(),
        getClientRewardAccountByClientUserId(session.userId),
        listClientRewardMovementsByClientUserId(session.userId),
        listFuelGiftCodesByClientUserId(session.userId),
        listFuelGiftPurchasesByClientUserId(session.userId),
        getProductsData(),
        getCustomerBalanceAccountsData(),
        getCustomerBalanceMovementsData(),
        getCouponPurchasesData(),
        getCouponsData(),
      ]);

    if (!clientUser || clientUser.status !== "active") {
      return NextResponse.json(
        {
          success: false,
          message: "Client account could not be found.",
        },
        { status: 404 },
      );
    }

    const fuelProducts = products
      .filter(
        (product) =>
          `${product.category || ""}`.trim().toLowerCase() === "fuel" &&
          `${product.status || ""}`.trim().toLowerCase() === "active",
      )
      .map((product) => ({
        id: product.id,
        code: normalizeComparable(product.name),
        label: product.name,
        pricePerLitre: Number(product.price || 0),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
    const bulkBalances = buildBulkBalances(
      balanceAccounts,
      balanceMovements,
      clientUser.phone,
    );
    const clientSales = await getClientRecentSalesActivities({
      customerPhone: clientUser.phone,
      limit: 12,
    });
    const activeGiftCodes = fuelGiftCodes.filter(
      (gift) =>
        `${gift.status || ""}`.trim().toLowerCase() === "active" &&
        !`${gift.redeemedAt || ""}`.trim() &&
        !`${gift.receiptId || ""}`.trim(),
    );

    return NextResponse.json({
      success: true,
      session: sanitizeClientSession(session),
      profile: {
        fullName: clientUser.fullName,
        email: clientUser.email,
        phone: clientUser.phone,
        userType: clientUser.userType,
        companyName: clientUser.companyName,
        preferredProvider: clientUser.preferredProvider,
        providerNumbers: clientUser.providerNumbers,
      },
      rewardSettings,
      rewardAccount: rewardAccount || {
        balanceAmount: 0,
        totalEarned: 0,
        totalRedeemed: 0,
      },
      fuelProducts,
      mobileMoneyProviders: MOBILE_MONEY_PROVIDERS,
      bulkBalances,
      activeGiftCodes,
      recentActivities: buildRecentActivities({
        clientSales,
        rewardMovements,
        bulkBalances,
        fuelGiftPurchases,
        fuelGiftCodes,
      }),
      couponSummary: buildCouponSummary(clientUser, couponPurchases, coupons),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getBootstrapErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
