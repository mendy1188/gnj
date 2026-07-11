import "server-only";

import { Query } from "appwrite";

export const COUPON_COLLECTIONS = {
  companies: "coupon_companies",
  purchases: "coupon_purchases",
  coupons: "coupons",
  movements: "coupon_movements",
};

export const COUPON_COMPANY_STATUSES = new Set(["active", "inactive"]);
export const COUPON_PURCHASE_STATUSES = new Set([
  "draft",
  "active",
  "partially_redeemed",
  "redeemed",
  "cancelled",
]);
export const COUPON_STATUSES = new Set([
  "active",
  "partially_redeemed",
  "redeemed",
  "cancelled",
  "expired",
]);

export function normalizeCouponCompanyStatus(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();
  return COUPON_COMPANY_STATUSES.has(normalizedValue)
    ? normalizedValue
    : "active";
}

export function normalizeCouponPurchaseStatus(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();
  return COUPON_PURCHASE_STATUSES.has(normalizedValue)
    ? normalizedValue
    : "draft";
}

export function normalizeCouponStatus(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();
  return COUPON_STATUSES.has(normalizedValue)
    ? normalizedValue
    : "active";
}

export function isCouponActiveStatus(status) {
  return ["active", "partially_redeemed"].includes(
    normalizeCouponStatus(status),
  );
}

export function normalizeCouponCompanyName(value) {
  return `${value || ""}`.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildCouponPurchaseReference({ companyName, purchaseDate }) {
  const companyCode = `${companyName || ""}`
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);
  const dateCode = `${purchaseDate || ""}`.replace(/[^0-9]/g, "").slice(0, 8);
  const randomCode = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `CP-${companyCode || "JAH"}-${dateCode || "00000000"}-${randomCode}`;
}

export function buildCouponCode({ purchaseId, index }) {
  const purchaseSuffix = `${purchaseId || ""}`
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-8)
    .toUpperCase();
  const couponNumber = String(Number(index || 0) + 1).padStart(4, "0");

  return `CPN-${purchaseSuffix || "JAH00000"}-${couponNumber}`;
}

export function buildCouponStatusFromRemainingValue(faceValue, remainingValue) {
  const normalizedFaceValue = Number(faceValue || 0);
  const normalizedRemainingValue = Number(remainingValue || 0);

  if (normalizedRemainingValue <= 0) {
    return "redeemed";
  }

  if (
    normalizedFaceValue > 0 &&
    normalizedRemainingValue < normalizedFaceValue
  ) {
    return "partially_redeemed";
  }

  return "active";
}

export function buildCouponPurchaseStatusFromCoupons(coupons = []) {
  const sourceCoupons = Array.isArray(coupons) ? coupons : [];

  if (sourceCoupons.length === 0) {
    return "draft";
  }

  const totalRemainingValue = sourceCoupons.reduce(
    (sum, coupon) => sum + Number(coupon.remaining_value || 0),
    0,
  );
  const totalFaceValue = sourceCoupons.reduce(
    (sum, coupon) => sum + Number(coupon.face_value || 0),
    0,
  );

  if (totalRemainingValue <= 0) {
    return "redeemed";
  }

  if (totalRemainingValue < totalFaceValue) {
    return "partially_redeemed";
  }

  return "active";
}

export async function listAllCouponDocuments(
  databases,
  databaseId,
  collectionId,
  queries = [],
) {
  const sourceQueries = Array.isArray(queries) ? [...queries] : [];
  const documents = [];
  let cursor = "";

  while (true) {
    const response = await databases.listDocuments(databaseId, collectionId, [
      ...sourceQueries,
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]);
    const batch = Array.isArray(response?.documents) ? response.documents : [];

    documents.push(...batch);

    if (batch.length < 100) {
      break;
    }

    cursor = batch[batch.length - 1]?.$id || "";

    if (!cursor) {
      break;
    }
  }

  return documents;
}

export async function findCouponByCode(databases, databaseId, code) {
  const normalizedCode = `${code || ""}`.trim().toUpperCase();

  if (!normalizedCode) {
    return null;
  }

  const response = await databases.listDocuments(
    databaseId,
    COUPON_COLLECTIONS.coupons,
    [Query.equal("code", normalizedCode), Query.limit(1)],
  );

  return response.documents?.[0] || null;
}

export async function listCouponsByPurchaseId(databases, databaseId, purchaseId) {
  const normalizedPurchaseId = `${purchaseId || ""}`.trim();

  if (!normalizedPurchaseId) {
    return [];
  }

  return listAllCouponDocuments(
    databases,
    databaseId,
    COUPON_COLLECTIONS.coupons,
    [Query.equal("purchase_id", normalizedPurchaseId)],
  );
}

export async function refreshCouponPurchaseTotals(
  databases,
  databaseId,
  purchaseDocument,
) {
  const purchaseId = `${purchaseDocument?.$id || purchaseDocument?.id || ""}`.trim();

  if (!purchaseId) {
    return purchaseDocument;
  }

  const coupons = await listCouponsByPurchaseId(databases, databaseId, purchaseId);
  const couponCount = coupons.length;
  const generatedTotalValue = Number(
    coupons.reduce((sum, coupon) => sum + Number(coupon.face_value || 0), 0).toFixed(2),
  );
  const remainingTotalValue = Number(
    coupons.reduce(
      (sum, coupon) => sum + Number(coupon.remaining_value || 0),
      0,
    ).toFixed(2),
  );
  const couponValue =
    couponCount > 0 ? Number(coupons[0]?.face_value || 0) : 0;
  const status =
    `${purchaseDocument?.status || ""}`.trim().toLowerCase() === "cancelled"
      ? "cancelled"
      : buildCouponPurchaseStatusFromCoupons(coupons);

  return databases.updateDocument(
    databaseId,
    COUPON_COLLECTIONS.purchases,
    purchaseId,
    {
      coupon_count: couponCount,
      coupon_value: couponValue,
      generated_total_value: generatedTotalValue,
      remaining_total_value: remainingTotalValue,
      status,
      updated_at: new Date().toISOString(),
    },
  );
}
