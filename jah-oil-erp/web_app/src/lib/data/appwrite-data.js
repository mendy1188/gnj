import http from "node:http";
import https from "node:https";

import { Query } from "appwrite";
import { cache } from "react";

import {
  buildPaymentMethodCodeFromLabel,
  getDefaultPaymentMethodByCode,
  getDefaultPaymentMethods,
  normalizePaymentMethodCode,
} from "@/features/payments/constants";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  salesReceipts: "sales_receipts",
  salesReceiptItems: "sales_receipt_items",
  stationDailySummary: "station_daily_summary",
  cashierDailySummary: "cashier_daily_summary",
  stationProductDailySummary: "station_product_daily_summary",
  stationCategoryDailySummary: "station_category_daily_summary",
  inventoryItems: "inventory_items",
  incomingStockRecords: "incoming_stock_records",
  fuelDeliveries: "fuel_deliveries",
  stations: "stations",
  products: "products",
  productPriceHistory: "product_price_history",
  paymentMethods: "payment_methods",
  couponCompanies: "coupon_companies",
  couponPurchases: "coupon_purchases",
  coupons: "coupons",
  couponMovements: "coupon_movements",
  bulkFuelClients: "bulk_fuel_clients",
  customerBalances: "customer_balances",
  customerBalanceMovements: "customer_balance_movements",
  posTransactionEnvelopes: "pos_transaction_envelopes",
  posDeviceSyncStatus: "pos_device_sync_status",
};

const DEFAULT_PAGE_LIMIT = getPositiveInteger(
  process.env.APPWRITE_LIST_PAGE_LIMIT,
  500,
);
const DEFAULT_COLLECTION_TIMEOUT_MS = getPositiveInteger(
  process.env.APPWRITE_COLLECTION_TIMEOUT_MS,
  15000,
);
const DEFAULT_DASHBOARD_WINDOW_DAYS = getPositiveInteger(
  process.env.APPWRITE_DASHBOARD_WINDOW_DAYS,
  7,
);
const DEFAULT_DASHBOARD_PAGE_LIMIT = getPositiveInteger(
  process.env.APPWRITE_DASHBOARD_PAGE_LIMIT,
  1000,
);
const DEFAULT_COLLECTION_CACHE_TTL_MS = getPositiveInteger(
  process.env.APPWRITE_COLLECTION_CACHE_TTL_MS,
  60000,
);
const DEFAULT_COLLECTION_RETRY_ATTEMPTS = getPositiveInteger(
  process.env.APPWRITE_COLLECTION_RETRY_ATTEMPTS,
  2,
);
const DEFAULT_TRANSACTION_PAGE_SIZE = Math.min(
  getPositiveInteger(process.env.APPWRITE_TRANSACTION_PAGE_LIMIT, 20),
  100,
);
const MAX_TRANSACTION_PAGE_SIZE = 100;
const TRANSACTION_SCAN_PAGE_SIZE = Math.min(
  getPositiveInteger(process.env.APPWRITE_TRANSACTION_SCAN_PAGE_LIMIT, 100),
  MAX_TRANSACTION_PAGE_SIZE,
);
const COLLECTION_QUERY_SETTINGS = {
  [COLLECTIONS.salesReceiptItems]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_SALES_ITEMS_PAGE_LIMIT,
      500,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_SALES_ITEMS_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "receipt_id",
      "sale_date",
      "station_id",
      "station_name",
      "product_name",
      "category",
      "quantity",
      "line_total",
    ],
  },
  [COLLECTIONS.salesReceipts]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_SALES_RECEIPTS_PAGE_LIMIT,
      500,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_SALES_RECEIPTS_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "receipt_number",
      "station_id",
      "station_name",
      "sale_date",
      "total_amount",
      "cashier_name",
      "customer_name",
      "customer_phone",
      "notes",
      "source",
      "status",
      "payment_method",
      "payment_method_code",
      "payment_method_label",
      "payment_status",
    ],
  },
  [COLLECTIONS.inventoryItems]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_INVENTORY_PAGE_LIMIT,
      1000,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_INVENTORY_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "product_id",
      "product_name",
      "station_name",
      "quantity",
      "unit",
      "reorder_level",
      "status",
    ],
  },
  [COLLECTIONS.stationDailySummary]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_STATION_SUMMARY_PAGE_LIMIT,
      500,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_STATION_SUMMARY_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "date",
      "station_id",
      "station_name",
      "fuel_sales",
      "petrol_sales",
      "diesel_sales",
      "shop_sales",
      "rice_sales",
      "cooking_oil_sales",
      "other_shop_sales",
      "cement_sales",
      "cement_bags_sold",
      "total_sales",
      "transactions",
    ],
  },
  [COLLECTIONS.cashierDailySummary]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_CASHIER_SUMMARY_PAGE_LIMIT,
      500,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_CASHIER_SUMMARY_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "date",
      "station_id",
      "station_name",
      "cashier_user_id",
      "cashier_name",
      "fuel_sales",
      "petrol_sales",
      "diesel_sales",
      "shop_sales",
      "rice_sales",
      "cooking_oil_sales",
      "other_shop_sales",
      "cement_sales",
      "cement_bags_sold",
      "total_sales",
      "transactions",
    ],
  },
  [COLLECTIONS.stationProductDailySummary]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_STATION_PRODUCT_SUMMARY_PAGE_LIMIT,
      1000,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_STATION_PRODUCT_SUMMARY_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "date",
      "station_id",
      "station_name",
      "product_id",
      "product_name",
      "category",
      "unit",
      "received_quantity",
      "sold_quantity",
      "sold_amount",
      "net_quantity",
      "transactions",
    ],
  },
  [COLLECTIONS.stationCategoryDailySummary]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_STATION_CATEGORY_SUMMARY_PAGE_LIMIT,
      1000,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_STATION_CATEGORY_SUMMARY_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "date",
      "station_id",
      "station_name",
      "category",
      "total_quantity",
      "total_amount",
      "transactions",
    ],
  },
  [COLLECTIONS.paymentMethods]: {
    pageLimit: 50,
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_PAYMENT_METHODS_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: ["$id", "code", "label", "description", "is_enabled", "sort_order"],
  },
  [COLLECTIONS.couponCompanies]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_COUPON_COMPANIES_PAGE_LIMIT,
      1000,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_COUPON_COMPANIES_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "name",
      "date_joined",
      "status",
      "notes",
      "created_at",
      "updated_at",
    ],
  },
  [COLLECTIONS.couponPurchases]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_COUPON_PURCHASES_PAGE_LIMIT,
      1000,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_COUPON_PURCHASES_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "company_id",
      "company_name",
      "purchase_reference",
      "purchase_date",
      "total_amount",
      "coupon_count",
      "coupon_value",
      "generated_total_value",
      "remaining_total_value",
      "status",
      "created_by_user_id",
      "created_by_name",
      "notes",
      "created_at",
      "updated_at",
    ],
  },
  [COLLECTIONS.coupons]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_COUPONS_PAGE_LIMIT,
      10000,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_COUPONS_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "company_id",
      "company_name",
      "purchase_id",
      "purchase_reference",
      "code",
      "face_value",
      "remaining_value",
      "status",
      "created_by_user_id",
      "created_by_name",
      "created_at",
      "last_used_at",
      "last_receipt_id",
      "last_receipt_number",
      "notes",
    ],
  },
  [COLLECTIONS.couponMovements]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_COUPON_MOVEMENTS_PAGE_LIMIT,
      10000,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_COUPON_MOVEMENTS_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "coupon_id",
      "coupon_code",
      "company_id",
      "company_name",
      "purchase_id",
      "purchase_reference",
      "receipt_id",
      "receipt_number",
      "station_id",
      "station_name",
      "movement_date",
      "direction",
      "amount_delta",
      "balance_after",
      "actor_user_id",
      "actor_name",
      "notes",
    ],
  },
  [COLLECTIONS.bulkFuelClients]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_BULK_FUEL_CLIENTS_PAGE_LIMIT,
      1000,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_BULK_FUEL_CLIENTS_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "name",
      "phone",
      "address",
      "date_joined",
      "status",
      "notes",
      "created_at",
      "updated_at",
    ],
  },
  [COLLECTIONS.customerBalances]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_CUSTOMER_BALANCES_PAGE_LIMIT,
      1000,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_CUSTOMER_BALANCES_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "account_type",
      "reference_code",
      "customer_name",
      "customer_phone",
      "station_id",
      "station_name",
      "product_id",
      "product_name",
      "product_category",
      "balance_amount",
      "balance_quantity",
      "unit",
      "due_date",
      "status",
      "created_at",
      "updated_at",
      "notes",
    ],
  },
  [COLLECTIONS.customerBalanceMovements]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_CUSTOMER_BALANCE_MOVEMENTS_PAGE_LIMIT,
      1000,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_CUSTOMER_BALANCE_MOVEMENTS_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "account_id",
      "account_type",
      "receipt_id",
      "receipt_number",
      "station_id",
      "station_name",
      "product_id",
      "product_name",
      "movement_date",
      "direction",
      "amount_delta",
      "quantity_delta",
      "balance_amount",
      "balance_quantity",
      "due_date",
      "actor_user_id",
      "actor_name",
      "reference_code",
      "notes",
    ],
  },
  [COLLECTIONS.posTransactionEnvelopes]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_POS_TRANSACTION_ENVELOPES_PAGE_LIMIT,
      500,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_POS_TRANSACTION_ENVELOPES_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "transaction_type",
      "status",
      "idempotency_key",
      "receipt_id",
      "receipt_number",
      "station_id",
      "station_name",
      "cashier_name",
      "total_amount",
      "payload_summary",
      "error_message",
      "created_at",
      "updated_at",
    ],
  },
  [COLLECTIONS.posDeviceSyncStatus]: {
    pageLimit: getPositiveInteger(
      process.env.APPWRITE_POS_DEVICE_SYNC_STATUS_PAGE_LIMIT,
      500,
    ),
    timeoutMs: getPositiveInteger(
      process.env.APPWRITE_POS_DEVICE_SYNC_STATUS_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    select: [
      "$id",
      "device_id",
      "platform",
      "app_version",
      "station_id",
      "station_name",
      "cashier_user_id",
      "cashier_name",
      "status",
      "pending_count",
      "failed_count",
      "needs_review_count",
      "oldest_unsynced_at",
      "last_sync_attempt_at",
      "last_synced_at",
      "last_error",
      "is_online",
      "reported_at",
      "updated_at",
    ],
  },
};
const collectionMemoryCache =
  globalThis.__jahOilCollectionMemoryCache || new Map();
const collectionInFlightRequests =
  globalThis.__jahOilCollectionInFlightRequests || new Map();

if (!globalThis.__jahOilCollectionMemoryCache) {
  globalThis.__jahOilCollectionMemoryCache = collectionMemoryCache;
}

if (!globalThis.__jahOilCollectionInFlightRequests) {
  globalThis.__jahOilCollectionInFlightRequests = collectionInFlightRequests;
}

async function listCollectionDocuments(collectionId) {
  if (!hasServerAppwriteConfig()) {
    return [];
  }

  const {
    pageLimit = DEFAULT_PAGE_LIMIT,
    timeoutMs = DEFAULT_COLLECTION_TIMEOUT_MS,
    select = null,
    cacheTtlMs = DEFAULT_COLLECTION_CACHE_TTL_MS,
    retryAttempts = DEFAULT_COLLECTION_RETRY_ATTEMPTS,
  } = COLLECTION_QUERY_SETTINGS[collectionId] || {};

  return getCachedResource(
    collectionId,
    cacheTtlMs,
    () =>
      queryCollectionDocuments(collectionId, {
        pageLimit,
        timeoutMs,
        select,
        retryAttempts,
      }),
    collectionId,
  );
}

const getSalesReceiptItemDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.salesReceiptItems),
);

const getSalesReceiptDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.salesReceipts),
);

const getInventoryDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.inventoryItems),
);

const getIncomingStockDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.incomingStockRecords),
);

const getFuelDeliveryDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.fuelDeliveries),
);

const getStationDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.stations),
);

const getProductDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.products),
);

const getStationProductSummaryDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.stationProductDailySummary),
);

const getProductPriceHistoryDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.productPriceHistory),
);

const getPaymentMethodDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.paymentMethods),
);

const getCouponCompanyDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.couponCompanies),
);

const getCouponPurchaseDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.couponPurchases),
);

const getCouponDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.coupons),
);

const getCouponMovementDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.couponMovements),
);

const getBulkFuelClientDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.bulkFuelClients),
);

const getCustomerBalanceDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.customerBalances),
);

const getCustomerBalanceMovementDocuments = cache(() =>
  listCollectionDocuments(COLLECTIONS.customerBalanceMovements),
);

export const getSalesData = cache(async () => loadSalesData());

export async function getSalesDataFresh() {
  return loadSalesData({ useMemoryCache: false });
}

export async function getDashboardSalesData(options = {}) {
  return getScopedSalesData({
    ...options,
    startDate: addDays(
      getTodayDateString(),
      -(DEFAULT_DASHBOARD_WINDOW_DAYS - 1),
    ),
    endDate: getTodayDateString(),
    cacheNamespace: "dashboard-sales-data",
    itemsTimeoutMs: getPositiveInteger(
      process.env.APPWRITE_DASHBOARD_SALES_ITEMS_TIMEOUT_MS,
      getPositiveInteger(
        process.env.APPWRITE_SALES_ITEMS_TIMEOUT_MS,
        DEFAULT_COLLECTION_TIMEOUT_MS,
      ),
    ),
    receiptsTimeoutMs: getPositiveInteger(
      process.env.APPWRITE_DASHBOARD_SALES_RECEIPTS_TIMEOUT_MS,
      getPositiveInteger(
        process.env.APPWRITE_SALES_RECEIPTS_TIMEOUT_MS,
        DEFAULT_COLLECTION_TIMEOUT_MS,
      ),
    ),
  });
}

export async function getDashboardSummaryData({
  scope = "station",
  startDate = addDays(
    getTodayDateString(),
    -(DEFAULT_DASHBOARD_WINDOW_DAYS - 1),
  ),
  endDate = getTodayDateString(),
  stationId = "",
  stationName = "",
  cashierName = "",
} = {}) {
  if (!hasServerAppwriteConfig()) {
    return [];
  }

  const normalizedScope = scope === "cashier" ? "cashier" : "station";
  const normalizedStartDate =
    normalizeDateValue(startDate) || getTodayDateString();
  const normalizedEndDate = normalizeDateValue(endDate) || normalizedStartDate;
  const rangeStart =
    normalizedStartDate <= normalizedEndDate
      ? normalizedStartDate
      : normalizedEndDate;
  const rangeEnd =
    normalizedStartDate <= normalizedEndDate
      ? normalizedEndDate
      : normalizedStartDate;
  const normalizedStationId = `${stationId || ""}`.trim();
  const normalizedStationName = `${stationName || ""}`.trim();
  const normalizedCashierName = `${cashierName || ""}`.trim();
  const collectionId =
    normalizedScope === "cashier"
      ? COLLECTIONS.cashierDailySummary
      : COLLECTIONS.stationDailySummary;
  const cacheKey = [
    "dashboard-summary-data",
    normalizedScope,
    rangeStart,
    rangeEnd,
    normalizedStationId || "all-stations",
    normalizedStationName || "all-station-names",
    normalizedCashierName || "all-cashiers",
  ].join(":");

  return getCachedResource(
    cacheKey,
    DEFAULT_COLLECTION_CACHE_TTL_MS,
    async () => {
      try {
        const filterQueries = [
          Query.greaterThanEqual("date", rangeStart),
          Query.lessThanEqual("date", rangeEnd),
        ];

        if (normalizedStationId) {
          filterQueries.push(Query.equal("station_id", normalizedStationId));
        } else if (normalizedStationName) {
          filterQueries.push(
            Query.equal("station_name", normalizedStationName),
          );
        }

        if (normalizedScope === "cashier" && normalizedCashierName) {
          filterQueries.push(
            Query.equal("cashier_name", normalizedCashierName),
          );
        }

        const documents = await queryCollectionDocuments(collectionId, {
          pageLimit: COLLECTION_QUERY_SETTINGS[collectionId]?.pageLimit,
          timeoutMs: COLLECTION_QUERY_SETTINGS[collectionId]?.timeoutMs,
          select: COLLECTION_QUERY_SETTINGS[collectionId]?.select,
          filterQueries,
          retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
          requestLabel: `${cacheKey}_documents`,
        });

        return documents
          .map((document) => normalizeDashboardSummaryDocument(document))
          .filter((record) => record.date && record.station);
      } catch (error) {
        if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
          return [];
        }

        throw error;
      }
    },
    "dashboard-summary-data",
  );
}

export async function getStationProductDailySummaryData({
  startDate = "",
  endDate = "",
  stationId = "",
  stationName = "",
  productName = "",
  category = "",
} = {}) {
  if (!hasServerAppwriteConfig()) {
    return [];
  }

  const normalizedStartDate =
    normalizeDateValue(startDate) || getTodayDateString();
  const normalizedEndDate = normalizeDateValue(endDate) || normalizedStartDate;
  const rangeStart =
    normalizedStartDate <= normalizedEndDate
      ? normalizedStartDate
      : normalizedEndDate;
  const rangeEnd =
    normalizedStartDate <= normalizedEndDate
      ? normalizedEndDate
      : normalizedStartDate;
  const normalizedStationId = `${stationId || ""}`.trim();
  const normalizedStationName = `${stationName || ""}`.trim();
  const normalizedProductName = `${productName || ""}`.trim();
  const normalizedCategory = `${category || ""}`.trim().toLowerCase();
  const cacheKey = [
    "station-product-summary-data",
    rangeStart,
    rangeEnd,
    normalizedStationId || "all-stations",
    normalizedStationName || "all-station-names",
    normalizedProductName || "all-products",
    normalizedCategory || "all-categories",
  ].join(":");

  return getCachedResource(
    cacheKey,
    DEFAULT_COLLECTION_CACHE_TTL_MS,
    async () => {
      const filterQueries = [
        Query.greaterThanEqual("date", rangeStart),
        Query.lessThanEqual("date", rangeEnd),
      ];

      if (normalizedStationId) {
        filterQueries.push(Query.equal("station_id", normalizedStationId));
      } else if (normalizedStationName) {
        filterQueries.push(Query.equal("station_name", normalizedStationName));
      }

      if (normalizedProductName) {
        filterQueries.push(Query.equal("product_name", normalizedProductName));
      }

      if (normalizedCategory) {
        filterQueries.push(Query.equal("category", normalizedCategory));
      }

      try {
        const documents = await queryCollectionDocuments(
          COLLECTIONS.stationProductDailySummary,
          {
            pageLimit:
              COLLECTION_QUERY_SETTINGS[COLLECTIONS.stationProductDailySummary]
                ?.pageLimit,
            timeoutMs:
              COLLECTION_QUERY_SETTINGS[COLLECTIONS.stationProductDailySummary]
                ?.timeoutMs,
            select:
              COLLECTION_QUERY_SETTINGS[COLLECTIONS.stationProductDailySummary]
                ?.select,
            filterQueries,
            retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
            requestLabel: `${cacheKey}_documents`,
          },
        );

        return documents
          .map((document) => normalizeStationProductSummaryDocument(document))
          .filter(
            (record) => record.date && record.station && record.productName,
          );
      } catch (error) {
        if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
          return [];
        }

        throw error;
      }
    },
    "station-product-summary-data",
  );
}

export async function getStationCategoryDailySummaryData({
  startDate = "",
  endDate = "",
  stationId = "",
  stationName = "",
  category = "",
} = {}) {
  if (!hasServerAppwriteConfig()) {
    return [];
  }

  const normalizedStartDate =
    normalizeDateValue(startDate) || getTodayDateString();
  const normalizedEndDate = normalizeDateValue(endDate) || normalizedStartDate;
  const rangeStart =
    normalizedStartDate <= normalizedEndDate
      ? normalizedStartDate
      : normalizedEndDate;
  const rangeEnd =
    normalizedStartDate <= normalizedEndDate
      ? normalizedEndDate
      : normalizedStartDate;
  const normalizedStationId = `${stationId || ""}`.trim();
  const normalizedStationName = `${stationName || ""}`.trim();
  const normalizedCategory = `${category || ""}`.trim().toLowerCase();
  const cacheKey = [
    "station-category-summary-data",
    rangeStart,
    rangeEnd,
    normalizedStationId || "all-stations",
    normalizedStationName || "all-station-names",
    normalizedCategory || "all-categories",
  ].join(":");

  return getCachedResource(
    cacheKey,
    DEFAULT_COLLECTION_CACHE_TTL_MS,
    async () => {
      const filterQueries = [
        Query.greaterThanEqual("date", rangeStart),
        Query.lessThanEqual("date", rangeEnd),
      ];

      if (normalizedStationId) {
        filterQueries.push(Query.equal("station_id", normalizedStationId));
      } else if (normalizedStationName) {
        filterQueries.push(Query.equal("station_name", normalizedStationName));
      }

      if (normalizedCategory) {
        filterQueries.push(Query.equal("category", normalizedCategory));
      }

      try {
        const documents = await queryCollectionDocuments(
          COLLECTIONS.stationCategoryDailySummary,
          {
            pageLimit:
              COLLECTION_QUERY_SETTINGS[COLLECTIONS.stationCategoryDailySummary]
                ?.pageLimit,
            timeoutMs:
              COLLECTION_QUERY_SETTINGS[COLLECTIONS.stationCategoryDailySummary]
                ?.timeoutMs,
            select:
              COLLECTION_QUERY_SETTINGS[COLLECTIONS.stationCategoryDailySummary]
                ?.select,
            filterQueries,
            retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
            requestLabel: `${cacheKey}_documents`,
          },
        );

        return documents
          .map((document) => normalizeStationCategorySummaryDocument(document))
          .filter((record) => record.date && record.station && record.category);
      } catch (error) {
        if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
          return [];
        }

        throw error;
      }
    },
    "station-category-summary-data",
  );
}

export async function getSalesDataForDateRange(options = {}) {
  return getScopedSalesData({
    ...options,
    cacheNamespace: "sales-range-data",
    useMemoryCache: false,
    includeCashierMetadata: true,
    itemsTimeoutMs: getPositiveInteger(
      process.env.APPWRITE_SALES_ITEMS_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
    receiptsTimeoutMs: getPositiveInteger(
      process.env.APPWRITE_SALES_RECEIPTS_TIMEOUT_MS,
      DEFAULT_COLLECTION_TIMEOUT_MS,
    ),
  });
}

export async function getSalesTransactionPage(options = {}) {
  const {
    startDate = "",
    endDate = "",
    stationId = "",
    branchName = "",
    cashierName = "",
    categories = [],
    itemName = "",
    cursor = "",
    limit = DEFAULT_TRANSACTION_PAGE_SIZE,
    includeTotal = false,
  } = options;
  const normalizedStartDate = normalizeDateValue(startDate);
  const normalizedEndDate = normalizeDateValue(endDate);
  const rangeStart =
    normalizedStartDate && normalizedEndDate
      ? normalizedStartDate <= normalizedEndDate
        ? normalizedStartDate
        : normalizedEndDate
      : normalizedStartDate || normalizedEndDate || getTodayDateString();
  const rangeEnd =
    normalizedStartDate && normalizedEndDate
      ? normalizedStartDate <= normalizedEndDate
        ? normalizedEndDate
        : normalizedStartDate
      : normalizedEndDate || normalizedStartDate || getTodayDateString();
  const normalizedStationId = `${stationId || ""}`.trim();
  const normalizedBranchName = `${branchName || ""}`.trim();
  const normalizedCashierName = `${cashierName || ""}`.trim();
  const normalizedItemName = normalizeProductName(itemName);
  const normalizedCursor = `${cursor || ""}`.trim();
  const normalizedLimit = Math.max(
    1,
    Math.min(
      getPositiveInteger(limit, DEFAULT_TRANSACTION_PAGE_SIZE),
      MAX_TRANSACTION_PAGE_SIZE,
    ),
  );
  const normalizedCategories = Array.from(
    new Set(
      (Array.isArray(categories) ? categories : [])
        .map((value) => `${value || ""}`.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort();
  const filterQueries = buildSalesDateRangeQueries(rangeStart, rangeEnd);

  if (normalizedStationId) {
    filterQueries.push(Query.equal("station_id", normalizedStationId));
  } else if (normalizedBranchName) {
    filterQueries.push(Query.equal("station_name", normalizedBranchName));
  }

  if (normalizedCategories.length === 1) {
    filterQueries.push(Query.equal("category", normalizedCategories[0]));
  } else if (normalizedCategories.length > 1) {
    filterQueries.push(Query.equal("category", normalizedCategories));
  }

  const shouldScanMultiplePages = Boolean(
    normalizedCashierName || normalizedItemName,
  );
  const rawPageLimit = shouldScanMultiplePages
    ? Math.max(normalizedLimit, TRANSACTION_SCAN_PAGE_SIZE)
    : Math.min(normalizedLimit + 1, MAX_TRANSACTION_PAGE_SIZE);
  const records = [];
  const seenRecordIds = new Set();
  const availableItemNames = new Set();
  const availableCashierNames = new Set();
  const shouldIncludeTotal = Boolean(includeTotal && !normalizedCursor);
  let totalItems = 0;
  let totalAmount = 0;
  let currentCursor = normalizedCursor;
  let nextCursor = "";
  let hasMore = false;
  let boundaryCursor = "";

  while (shouldIncludeTotal || records.length < normalizedLimit) {
    const payload = await queryCollectionDocumentsPage(
      COLLECTIONS.salesReceiptItems,
      {
        limit: rawPageLimit,
        timeoutMs:
          COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceiptItems]?.timeoutMs ??
          DEFAULT_COLLECTION_TIMEOUT_MS,
        select:
          COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceiptItems]?.select,
        filterQueries,
        sortQueries: [Query.orderDesc("sale_date")],
        cursorAfter: currentCursor,
        retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
        requestLabel: "sales-transaction-items",
      },
    );
    const documents = Array.isArray(payload?.documents)
      ? payload.documents
      : [];

    if (documents.length === 0) {
      break;
    }

    const receiptsById = await getSalesReceiptMetadataByIds(
      documents.map((document) => document.receipt_id || ""),
    );

    documents.forEach((document, index) => {
      if (!shouldIncludeTotal && records.length >= normalizedLimit) {
        return;
      }

      const record = mapSalesItemDocumentToRecord(document, receiptsById);

      if (
        !record.date ||
        !record.station ||
        !record.item ||
        (record.receiptStatus && record.receiptStatus !== "completed") ||
        (normalizedCashierName &&
          record.cashierName !== normalizedCashierName) ||
        (normalizedItemName &&
          normalizeProductName(record.item) !== normalizedItemName) ||
        seenRecordIds.has(record.id)
      ) {
        return;
      }

      if (record?.item) {
        availableItemNames.add(record.item);
      }

      if (record?.cashierName) {
        availableCashierNames.add(record.cashierName);
      }

      seenRecordIds.add(record.id);
      totalItems += 1;
      totalAmount += Number(record.amount || 0);

      if (records.length < normalizedLimit) {
        records.push(record);

        if (records.length === normalizedLimit) {
          boundaryCursor = document.$id || "";
          const moreDocumentsInCurrentBatch = index < documents.length - 1;
          hasMore =
            moreDocumentsInCurrentBatch || documents.length === rawPageLimit;
          nextCursor = hasMore ? boundaryCursor : "";
        }
      }
    });

    if (!shouldIncludeTotal && records.length >= normalizedLimit) {
      break;
    }

    if (documents.length < rawPageLimit) {
      break;
    }

    currentCursor = documents[documents.length - 1]?.$id || "";

    if (!currentCursor) {
      break;
    }
  }

  if (shouldIncludeTotal) {
    hasMore = totalItems > records.length;
    nextCursor = hasMore ? boundaryCursor : "";
  }

  return {
    records: records.sort(sortSalesTransactionRecords),
    nextCursor,
    hasMore,
    totalItems: shouldIncludeTotal ? totalItems : null,
    totalAmount: shouldIncludeTotal ? totalAmount : null,
    pageSize: normalizedLimit,
    availableItems: Array.from(availableItemNames).sort((left, right) =>
      left.localeCompare(right),
    ),
    availableCashiers: Array.from(availableCashierNames).sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

export async function getPosReceiptPage(options = {}) {
  const {
    startDate = "",
    endDate = "",
    stationId = "",
    branchName = "",
    cashierName = "",
    cursor = "",
    limit = DEFAULT_TRANSACTION_PAGE_SIZE,
    includeTotal = false,
  } = options;
  const normalizedStartDate = normalizeDateValue(startDate);
  const normalizedEndDate = normalizeDateValue(endDate);
  const rangeStart =
    normalizedStartDate && normalizedEndDate
      ? normalizedStartDate <= normalizedEndDate
        ? normalizedStartDate
        : normalizedEndDate
      : normalizedStartDate || normalizedEndDate || getTodayDateString();
  const rangeEnd =
    normalizedStartDate && normalizedEndDate
      ? normalizedStartDate <= normalizedEndDate
        ? normalizedEndDate
        : normalizedStartDate
      : normalizedEndDate || normalizedStartDate || getTodayDateString();
  const normalizedStationId = `${stationId || ""}`.trim();
  const normalizedBranchName = `${branchName || ""}`.trim();
  const normalizedCashierName = `${cashierName || ""}`.trim();
  const normalizedCursor = `${cursor || ""}`.trim();
  const normalizedLimit = Math.max(
    1,
    Math.min(
      getPositiveInteger(limit, DEFAULT_TRANSACTION_PAGE_SIZE),
      MAX_TRANSACTION_PAGE_SIZE,
    ),
  );
  const filterQueries = [
    ...buildSalesDateRangeQueries(rangeStart, rangeEnd),
    Query.equal("source", "pos"),
    Query.equal("status", "completed"),
  ];

  if (normalizedStationId) {
    filterQueries.push(Query.equal("station_id", normalizedStationId));
  } else if (normalizedBranchName) {
    filterQueries.push(Query.equal("station_name", normalizedBranchName));
  }

  if (normalizedCashierName) {
    filterQueries.push(Query.equal("cashier_name", normalizedCashierName));
  }

  const shouldIncludeTotal = Boolean(includeTotal && !normalizedCursor);
  const pageLimit = Math.min(normalizedLimit + 1, MAX_TRANSACTION_PAGE_SIZE);
  const records = [];
  let totalItems = 0;
  let totalAmount = 0;
  let currentCursor = normalizedCursor;
  let boundaryCursor = "";
  let nextCursor = "";
  let hasMore = false;

  while (shouldIncludeTotal || records.length < normalizedLimit) {
    const payload = await queryCollectionDocumentsPage(COLLECTIONS.salesReceipts, {
      limit: pageLimit,
      timeoutMs:
        COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.timeoutMs ??
        DEFAULT_COLLECTION_TIMEOUT_MS,
      select: COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.select,
      filterQueries,
      sortQueries: [Query.orderDesc("sale_date")],
      cursorAfter: currentCursor,
      retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
      requestLabel: "pos-cashier-receipts",
    });
    const documents = Array.isArray(payload?.documents) ? payload.documents : [];

    if (documents.length === 0) {
      break;
    }

    const itemSummariesByReceiptId = await getSalesReceiptItemSummariesByReceiptIds(
      documents.map((document) => document.$id || ""),
    );

    documents.forEach((document, index) => {
      if (!shouldIncludeTotal && records.length >= normalizedLimit) {
        return;
      }

      const itemSummary = itemSummariesByReceiptId.get(document.$id || "") || {
        itemCount: 0,
        itemSummary: "",
      };
      const record = {
        id: document.$id,
        receiptId: document.$id,
        receiptNumber: document.receipt_number || "",
        date: `${document.sale_date || ""}`.slice(0, 10),
        saleDate: `${document.sale_date || ""}`,
        stationId: document.station_id || "",
        station: document.station_name || "",
        cashierName: document.cashier_name || "",
        customerName: document.customer_name || "",
        customerPhone:
          document.customer_phone ||
          extractCustomerPhoneFromNotes(document.notes) ||
          "",
        paymentMethod:
          buildReceiptPaymentMethodDisplay({
            paymentMethodCode:
              document.payment_method_code || document.payment_method || "",
            paymentMethodLabel: document.payment_method_label || "",
            paymentMethod: document.payment_method || "",
            paymentStatus: document.payment_status || "",
          }) || "",
        paymentStatus: document.payment_status || "",
        status: document.status || "",
        amount: Number(document.total_amount || 0),
        itemCount: Number(itemSummary.itemCount || 0),
        itemSummary: itemSummary.itemSummary || "",
        source: document.source || "",
      };

      totalItems += 1;
      totalAmount += Number(record.amount || 0);

      if (records.length < normalizedLimit) {
        records.push(record);

        if (records.length === normalizedLimit) {
          boundaryCursor = document.$id || "";
          const moreDocumentsInCurrentBatch = index < documents.length - 1;
          hasMore = moreDocumentsInCurrentBatch || documents.length === pageLimit;
          nextCursor = hasMore ? boundaryCursor : "";
        }
      }
    });

    if (!shouldIncludeTotal && records.length >= normalizedLimit) {
      break;
    }

    if (documents.length < pageLimit) {
      break;
    }

    currentCursor = documents[documents.length - 1]?.$id || "";

    if (!currentCursor) {
      break;
    }
  }

  if (shouldIncludeTotal) {
    hasMore = totalItems > records.length;
    nextCursor = hasMore ? boundaryCursor : "";
  }

  return {
    records: records.sort(sortPosReceiptRecords),
    nextCursor,
    hasMore,
    totalItems: shouldIncludeTotal ? totalItems : null,
    totalAmount: shouldIncludeTotal ? totalAmount : null,
    pageSize: normalizedLimit,
  };
}

export async function getReversedPosTransactionsData(options = {}) {
  const {
    stationId = "",
    branchName = "",
  } = options;
  const filterQueries = [
    Query.equal("source", "pos"),
    Query.equal("status", "voided"),
  ];
  const normalizedStationId = `${stationId || ""}`.trim();
  const normalizedBranchName = `${branchName || ""}`.trim();

  if (normalizedStationId) {
    filterQueries.push(Query.equal("station_id", normalizedStationId));
  } else if (normalizedBranchName) {
    filterQueries.push(Query.equal("station_name", normalizedBranchName));
  }

  const documents = await queryCollectionDocuments(COLLECTIONS.salesReceipts, {
    pageLimit: COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.pageLimit,
    timeoutMs: COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.timeoutMs,
    select: COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.select,
    filterQueries,
    retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
    requestLabel: "reversed-pos-receipts",
  });
  const itemSummariesByReceiptId = await getSalesReceiptItemSummariesByReceiptIds(
    documents.map((document) => document.$id || ""),
  );

  return documents
    .map((document) => {
      const itemSummary = itemSummariesByReceiptId.get(document.$id || "") || {
        itemCount: 0,
        itemSummary: "",
      };

      return {
        id: document.$id,
        receiptId: document.$id,
        receiptNumber: document.receipt_number || "",
        stationId: document.station_id || "",
        station: document.station_name || "",
        saleDate: document.sale_date || "",
        date: `${document.sale_date || ""}`.slice(0, 10),
        amount: Number(document.total_amount || 0),
        cashierName: document.cashier_name || "",
        customerName: document.customer_name || "",
        customerPhone:
          document.customer_phone ||
          extractCustomerPhoneFromNotes(document.notes) ||
          "",
        paymentMethod:
          buildReceiptPaymentMethodDisplay({
            paymentMethodCode:
              document.payment_method_code || document.payment_method || "",
            paymentMethodLabel: document.payment_method_label || "",
            paymentMethod: document.payment_method || "",
            paymentStatus: document.payment_status || "",
          }) || "",
        reversedAt: extractReceiptNoteValue(document.notes, "Reversed at"),
        reversedBy: extractReceiptNoteValue(document.notes, "Reversed by"),
        reversalNote: extractReceiptNoteValue(document.notes, "Reversal note"),
        itemCount: Number(itemSummary.itemCount || 0),
        itemSummary: itemSummary.itemSummary || "",
      };
    })
    .filter((record) => record.station && record.amount >= 0)
    .sort(
      (left, right) =>
        `${right.reversedAt || right.saleDate || ""}`.localeCompare(
          `${left.reversedAt || left.saleDate || ""}`,
        ) ||
        `${left.station || ""}`.localeCompare(`${right.station || ""}`),
    );
}

export async function getPosTransactionEnvelopesData(options = {}) {
  const {
    status = "",
  } = options;
  const normalizedStatus = `${status || ""}`.trim();
  const filterQueries = [];

  if (["applying", "applied", "repair_needed"].includes(normalizedStatus)) {
    filterQueries.push(Query.equal("status", normalizedStatus));
  }

  const documents = await queryCollectionDocuments(
    COLLECTIONS.posTransactionEnvelopes,
    {
      pageLimit:
        COLLECTION_QUERY_SETTINGS[COLLECTIONS.posTransactionEnvelopes]
          ?.pageLimit,
      timeoutMs:
        COLLECTION_QUERY_SETTINGS[COLLECTIONS.posTransactionEnvelopes]
          ?.timeoutMs,
      select:
        COLLECTION_QUERY_SETTINGS[COLLECTIONS.posTransactionEnvelopes]?.select,
      filterQueries,
      retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
      requestLabel: "pos-transaction-envelopes",
    },
  );

  return documents
    .map((document) => ({
      id: document.$id,
      transactionType: document.transaction_type || "",
      status: document.status || "",
      idempotencyKey: document.idempotency_key || "",
      receiptId: document.receipt_id || "",
      receiptNumber: document.receipt_number || "",
      stationId: document.station_id || "",
      stationName: document.station_name || "",
      cashierName: document.cashier_name || "",
      totalAmount: Number(document.total_amount || 0),
      payloadSummary: document.payload_summary || "",
      errorMessage: document.error_message || "",
      createdAt: document.created_at || "",
      updatedAt: document.updated_at || "",
    }))
    .sort(
      (left, right) =>
        `${right.updatedAt || right.createdAt || ""}`.localeCompare(
          `${left.updatedAt || left.createdAt || ""}`,
        ) ||
        `${right.createdAt || ""}`.localeCompare(`${left.createdAt || ""}`),
    );
}

export async function getPosDeviceSyncStatusData() {
  const documents = await queryCollectionDocuments(
    COLLECTIONS.posDeviceSyncStatus,
    {
      pageLimit:
        COLLECTION_QUERY_SETTINGS[COLLECTIONS.posDeviceSyncStatus]?.pageLimit,
      timeoutMs:
        COLLECTION_QUERY_SETTINGS[COLLECTIONS.posDeviceSyncStatus]?.timeoutMs,
      select: COLLECTION_QUERY_SETTINGS[COLLECTIONS.posDeviceSyncStatus]?.select,
      filterQueries: [Query.orderDesc("updated_at")],
      retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
      requestLabel: "pos-device-sync-status",
    },
  );

  return documents
    .map((document) => ({
      id: document.$id,
      deviceId: document.device_id || "",
      platform: document.platform || "unknown",
      appVersion: document.app_version || "",
      stationId: document.station_id || "",
      stationName: document.station_name || "",
      cashierUserId: document.cashier_user_id || "",
      cashierName: document.cashier_name || "",
      status: document.status || "",
      pendingCount: Number(document.pending_count || 0),
      failedCount: Number(document.failed_count || 0),
      needsReviewCount: Number(document.needs_review_count || 0),
      oldestUnsyncedAt: document.oldest_unsynced_at || "",
      lastSyncAttemptAt: document.last_sync_attempt_at || "",
      lastSyncedAt: document.last_synced_at || "",
      lastError: document.last_error || "",
      isOnline: Boolean(document.is_online),
      reportedAt: document.reported_at || "",
      updatedAt: document.updated_at || "",
    }))
    .sort(
      (left, right) =>
        `${right.updatedAt || right.reportedAt || ""}`.localeCompare(
          `${left.updatedAt || left.reportedAt || ""}`,
        ) ||
        `${left.stationName || ""}`.localeCompare(`${right.stationName || ""}`),
    );
}

export async function getClientRecentSalesActivities(options = {}) {
  const {
    customerPhone = "",
    limit = 10,
  } = options;
  const normalizedCustomerPhone = `${customerPhone || ""}`.trim();
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 10), 20));

  if (!normalizedCustomerPhone) {
    return [];
  }

  const payload = await queryCollectionDocumentsPage(COLLECTIONS.salesReceipts, {
    limit: normalizedLimit,
    timeoutMs:
      COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.timeoutMs ??
      DEFAULT_COLLECTION_TIMEOUT_MS,
    select: COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.select,
    filterQueries: [
      Query.equal("customer_phone", normalizedCustomerPhone),
      Query.equal("source", "pos"),
      Query.equal("status", "completed"),
    ],
    sortQueries: [Query.orderDesc("sale_date")],
    retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
    requestLabel: "client-recent-sales",
  });
  const documents = Array.isArray(payload?.documents) ? payload.documents : [];

  return documents.map((document) => {
    const paymentMethodCode = normalizePaymentMethodCode(
      document.payment_method_code || document.payment_method || "",
    );
    const isBulkRedeem = paymentMethodCode === "bulk-redeem";
    const stationName = document.station_name || "Station";
    const saleDate = document.sale_date || "";
    const cashierName = document.cashier_name || "";
    const subtitleParts = [stationName, cashierName].filter(Boolean);

    return {
      id: `sale-${document.$id || document.receipt_number || saleDate}`,
      type: isBulkRedeem ? "bulk-redeem-sale" : "fuel-sale",
      title: isBulkRedeem ? "Bulk fuel redeemed" : "Fuel purchased",
      subtitle: subtitleParts.join(" · "),
      amount: Number(document.total_amount || 0),
      createdAt: saleDate,
      receiptNumber: document.receipt_number || "",
      stationName,
      cashierName,
      paymentMethod: buildReceiptPaymentMethodDisplay({
        paymentMethodCode:
          document.payment_method_code || document.payment_method || "",
        paymentMethodLabel: document.payment_method_label || "",
        paymentMethod: document.payment_method || "",
        paymentStatus: document.payment_status || "",
      }),
    };
  });
}

export const getInventoryData = cache(async () => {
  const documents = await getInventoryDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      productId: document.product_id || "",
      name: document.product_name || "",
      station: document.station_name || "",
      quantity: Number(document.quantity || 0),
      unit: document.unit || "",
      reorderLevel: Number(document.reorder_level || 0),
      status: document.status || "",
    }))
    .filter((record) => record.name && record.station);
});

export const getFuelDeliveriesData = cache(async () => {
  const documents = await getFuelDeliveryDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      deliveryDate: `${document.delivery_date || ""}`,
      date: `${document.delivery_date || ""}`.slice(0, 10),
      station: document.station_name || "",
      quantity: Number(document.quantity || 0),
      type: document.product_name || "",
      status: document.status || "",
      recordedBy:
        document.recorded_by ||
        extractRecordedByFromNotes(document.notes) ||
        document.driver_name ||
        "",
    }))
    .filter((record) => record.date && record.station && record.type)
    .sort(
      (left, right) =>
        `${right.deliveryDate || ""}`.localeCompare(
          `${left.deliveryDate || ""}`,
        ) || left.station.localeCompare(right.station),
    );
});

export const getIncomingStockData = cache(async () => {
  const documents = await getIncomingStockDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      inventoryItemId: document.inventory_item_id || "",
      stationId: document.station_id || "",
      station: document.station_name || "",
      productId: document.product_id || "",
      productName: document.product_name || "",
      quantityAdded: Number(document.quantity_added || 0),
      previousQuantity: Number(document.previous_quantity || 0),
      newQuantity: Number(document.new_quantity || 0),
      unit: document.unit || "",
      recordedAt: `${document.recorded_at || ""}`,
      date: `${document.recorded_at || ""}`.slice(0, 10),
      recordedBy: document.recorded_by || "",
      notes: document.notes || "",
    }))
    .filter(
      (record) =>
        record.inventoryItemId && record.productName && record.station,
    )
    .sort(
      (left, right) =>
        right.recordedAt.localeCompare(left.recordedAt) ||
        right.productName.localeCompare(left.productName),
    );
});

export const getStationsData = cache(async () => {
  const documents = await getStationDocuments();

  return documents.map((document) => ({
    id: document.$id,
    name: document.name || "",
    code: document.code || "",
    location: document.location || "",
    status: document.status || "active",
    manager: document.manager_name || "",
    managerPhone: document.manager_phone || "",
    latitude: toNullableNumber(document.latitude),
    longitude: toNullableNumber(document.longitude),
  }));
});

export const getProductsData = cache(async () => {
  const documents = await getProductDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      name: document.name || "",
      sku: document.sku || "",
      category: document.category || "",
      unit: document.unit || "",
      status: document.status || "active",
      price: Number(document.selling_price || 0),
    }))
    .filter((record) => record.name && record.status === "active");
});

export const getProductSettingsData = cache(async () => {
  const documents = await getProductDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      name: document.name || "",
      sku: document.sku || "",
      category: document.category || "",
      unit: document.unit || "",
      status: document.status || "active",
      price: Number(document.selling_price || 0),
      description: document.description || "",
    }))
    .filter((record) => record.name)
    .sort((left, right) => left.name.localeCompare(right.name));
});

export const getProductPriceHistoryData = cache(async () => {
  const documents = await getProductPriceHistoryDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      productId: document.product_id || "",
      productName: document.product_name || "",
      previousPrice: Number(document.previous_price || 0),
      newPrice: Number(document.new_price || 0),
      changedAt: document.changed_at || "",
      changedByUserId: document.changed_by_user_id || "",
      changedByName: document.changed_by_name || "",
      notes: document.notes || "",
    }))
    .filter(
      (record) => record.productId && record.productName && record.changedAt,
    )
    .sort((left, right) => right.changedAt.localeCompare(left.changedAt));
});

export const getPaymentMethodSettingsData = cache(async () => {
  try {
    const documents = await getPaymentMethodDocuments();

    return buildPaymentMethodRecords(documents);
  } catch (error) {
    if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
      return buildPaymentMethodRecords([]);
    }

    throw error;
  }
});

export const getActivePaymentMethodsData = cache(async () => {
  const records = await getPaymentMethodSettingsData();
  const enabledRecords = records.filter((record) => record.isEnabled);

  return enabledRecords.length > 0
    ? enabledRecords
    : buildPaymentMethodRecords([]);
});

export const getCouponCompaniesData = cache(async () => {
  const documents = await getCouponCompanyDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      name: document.name || "",
      dateJoined: document.date_joined || "",
      status: document.status || "active",
      notes: document.notes || "",
      createdAt: document.created_at || "",
      updatedAt: document.updated_at || "",
    }))
    .filter((record) => record.name)
    .sort(
      (left, right) =>
        `${right.dateJoined || ""}`.localeCompare(`${left.dateJoined || ""}`) ||
        left.name.localeCompare(right.name),
    );
});

export const getCouponPurchasesData = cache(async () => {
  const documents = await getCouponPurchaseDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      companyId: document.company_id || "",
      companyName: document.company_name || "",
      purchaseReference: document.purchase_reference || "",
      purchaseDate: document.purchase_date || "",
      totalAmount: Number(document.total_amount || 0),
      couponCount: Number(document.coupon_count || 0),
      couponValue: Number(document.coupon_value || 0),
      generatedTotalValue: Number(document.generated_total_value || 0),
      remainingTotalValue: Number(document.remaining_total_value || 0),
      status: document.status || "draft",
      createdByUserId: document.created_by_user_id || "",
      createdByName: document.created_by_name || "",
      notes: document.notes || "",
      createdAt: document.created_at || "",
      updatedAt: document.updated_at || "",
    }))
    .filter((record) => record.companyId && record.companyName)
    .sort(
      (left, right) =>
        `${right.purchaseDate || ""}`.localeCompare(`${left.purchaseDate || ""}`) ||
        `${right.createdAt || ""}`.localeCompare(`${left.createdAt || ""}`),
    );
});

export const getCouponsData = cache(async () => {
  const documents = await getCouponDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      companyId: document.company_id || "",
      companyName: document.company_name || "",
      purchaseId: document.purchase_id || "",
      purchaseReference: document.purchase_reference || "",
      code: document.code || "",
      faceValue: Number(document.face_value || 0),
      remainingValue: Number(document.remaining_value || 0),
      status: document.status || "active",
      createdByUserId: document.created_by_user_id || "",
      createdByName: document.created_by_name || "",
      createdAt: document.created_at || "",
      lastUsedAt: document.last_used_at || "",
      lastReceiptId: document.last_receipt_id || "",
      lastReceiptNumber: document.last_receipt_number || "",
      notes: document.notes || "",
    }))
    .filter((record) => record.code && record.companyName)
    .sort(
      (left, right) =>
        `${right.createdAt || ""}`.localeCompare(`${left.createdAt || ""}`) ||
        left.code.localeCompare(right.code),
    );
});

export const getCouponMovementsData = cache(async () => {
  const documents = await getCouponMovementDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      couponId: document.coupon_id || "",
      couponCode: document.coupon_code || "",
      companyId: document.company_id || "",
      companyName: document.company_name || "",
      purchaseId: document.purchase_id || "",
      purchaseReference: document.purchase_reference || "",
      receiptId: document.receipt_id || "",
      receiptNumber: document.receipt_number || "",
      stationId: document.station_id || "",
      stationName: document.station_name || "",
      movementDate: document.movement_date || "",
      direction: document.direction || "",
      amountDelta: Number(document.amount_delta || 0),
      balanceAfter: Number(document.balance_after || 0),
      actorUserId: document.actor_user_id || "",
      actorName: document.actor_name || "",
      notes: document.notes || "",
    }))
    .filter((record) => record.couponId && record.movementDate)
    .sort((left, right) =>
      `${right.movementDate || ""}`.localeCompare(`${left.movementDate || ""}`),
    );
});

export const getBulkFuelClientsData = cache(async () => {
  try {
    const documents = await getBulkFuelClientDocuments();

    return documents
      .map((document) => ({
        id: document.$id,
        name: document.name || "",
        phone: document.phone || "",
        address: document.address || "",
        dateJoined: document.date_joined || "",
        status: document.status || "active",
        notes: document.notes || "",
        createdAt: document.created_at || "",
        updatedAt: document.updated_at || "",
      }))
      .filter((record) => record.name && record.phone)
      .sort(
        (left, right) =>
          `${right.dateJoined || ""}`.localeCompare(`${left.dateJoined || ""}`) ||
          left.name.localeCompare(right.name),
      );
  } catch (error) {
    if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
      return [];
    }

    throw error;
  }
});

export const getCustomerBalanceAccountsData = cache(async () => {
  const documents = await getCustomerBalanceDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      accountType: document.account_type || "",
      referenceCode: document.reference_code || "",
      customerName: document.customer_name || "",
      customerPhone: document.customer_phone || "",
      customerEmail: document.customer_email || "",
      stationId: document.station_id || "",
      stationName: document.station_name || "",
      productId: document.product_id || "",
      productName: document.product_name || "",
      productCategory: document.product_category || "",
      balanceAmount: Number(document.balance_amount || 0),
      balanceQuantity: Number(document.balance_quantity || 0),
      unit: document.unit || "",
      dueDate: document.due_date || "",
      status: document.status || "active",
      createdAt: document.created_at || "",
      updatedAt: document.updated_at || "",
      notes: document.notes || "",
    }))
    .filter(
      (record) =>
        record.accountType &&
        record.customerName &&
        record.customerPhone,
    )
    .sort(
      (left, right) =>
        `${right.updatedAt || right.createdAt || ""}`.localeCompare(
          `${left.updatedAt || left.createdAt || ""}`,
        ) || left.customerName.localeCompare(right.customerName),
    );
});

export const getCustomerBalanceMovementsData = cache(async () => {
  const documents = await getCustomerBalanceMovementDocuments();

  return documents
    .map((document) => ({
      id: document.$id,
      accountId: document.account_id || "",
      accountType: document.account_type || "",
      receiptId: document.receipt_id || "",
      receiptNumber: document.receipt_number || "",
      stationId: document.station_id || "",
      stationName: document.station_name || "",
      productId: document.product_id || "",
      productName: document.product_name || "",
      movementDate: document.movement_date || "",
      direction: document.direction || "",
      amountDelta: Number(document.amount_delta || 0),
      quantityDelta: Number(document.quantity_delta || 0),
      balanceAmount: Number(document.balance_amount || 0),
      balanceQuantity: Number(document.balance_quantity || 0),
      dueDate: document.due_date || "",
      actorUserId: document.actor_user_id || "",
      actorName: document.actor_name || "",
      referenceCode: document.reference_code || "",
      notes: document.notes || "",
    }))
    .filter((record) => record.accountId && record.movementDate)
    .sort((left, right) =>
      `${right.movementDate || ""}`.localeCompare(`${left.movementDate || ""}`),
    );
});

export const getDashboardData = cache(async () => {
  const [summaryRecords, inventoryData] = await Promise.all([
    getDashboardSummaryData(),
    getInventoryData(),
  ]);

  if (summaryRecords.length > 0) {
    return buildDashboardDataFromSummaryRecords(summaryRecords, inventoryData);
  }

  return buildDashboardDataFromRecords(
    await getDashboardSalesData(),
    inventoryData,
  );
});

export function buildDashboardDataFromRecords(salesData, inventoryData) {
  const salesByStation = buildSalesByStation(salesData);
  const salesByDay = buildSalesByDay(salesData);
  const latestSalesDate = getLatestDate(salesData);
  const todayDate = getTodayDateString();
  const todaySalesRecords = salesData.filter(
    (record) => record.date === todayDate,
  );
  const fuelPetrolSales = sumAmountByTypeAndItem(
    todaySalesRecords,
    "Fuel",
    "petrol",
  );
  const fuelDieselSales = sumAmountByTypeAndItem(
    todaySalesRecords,
    "Fuel",
    "diesel",
  );
  const riceSales = sumAmountByTypeAndItem(todaySalesRecords, "Shop", "rice");
  const cookingSales = sumAmountByTypeAndItem(
    todaySalesRecords,
    "Shop",
    "cooking oil",
  );
  const totalShopBreakdownSales = todaySalesRecords
    .filter((record) => record.type === "Shop")
    .reduce((sum, record) => sum + record.amount, 0);
  const otherShopSales = totalShopBreakdownSales - riceSales - cookingSales;
  const cementBagsSold = todaySalesRecords
    .filter((record) => record.type === "Cement")
    .reduce((sum, record) => sum + record.quantity, 0);
  const lowStockAlerts = buildLowStockAlerts(inventoryData);
  const topStations = salesByStation.map((station, index) => ({
    rank: index + 1,
    name: station.station,
    sales: station.total,
    fuel: station.fuel,
    shop: station.shop,
    cement: station.cement,
  }));
  const totalTodaySales =
    sumAmountByType(todaySalesRecords, "Fuel") +
    sumAmountByType(todaySalesRecords, "Shop") +
    sumAmountByType(todaySalesRecords, "Cement");

  return {
    salesByStation,
    salesByDay,
    lowStockAlerts,
    todaySales: {
      fuel: sumAmountByType(todaySalesRecords, "Fuel"),
      shop: sumAmountByType(todaySalesRecords, "Shop"),
      cement: sumAmountByType(todaySalesRecords, "Cement"),
    },
    topStations,
    latestSalesDate,
    fuelPetrolSales,
    fuelDieselSales,
    riceSales,
    cookingSales,
    otherShopSales,
    cementBagsSold,
    totalTodaySales,
    bestStation: topStations[0] || null,
    alertCount: lowStockAlerts.length,
    todayTransactionCount: todaySalesRecords.length,
  };
}

export function buildDashboardDataFromSummaryRecords(
  summaryRecords,
  inventoryData,
) {
  const salesByStation = buildSalesByStationFromSummary(summaryRecords);
  const salesByDay = buildSalesByDayFromSummary(summaryRecords);
  const latestSalesDate = getLatestDate(summaryRecords);
  const todayDate = getTodayDateString();
  const todaySummaryRecords = summaryRecords.filter(
    (record) => record.date === todayDate,
  );
  const lowStockAlerts = buildLowStockAlerts(inventoryData);
  const topStations = salesByStation.map((station, index) => ({
    rank: index + 1,
    name: station.station,
    sales: station.total,
    fuel: station.fuel,
    shop: station.shop,
    cement: station.cement,
  }));
  const todayFuelSales = todaySummaryRecords.reduce(
    (total, record) => total + record.fuelSales,
    0,
  );
  const todayShopSales = todaySummaryRecords.reduce(
    (total, record) => total + record.shopSales,
    0,
  );
  const todayCementSales = todaySummaryRecords.reduce(
    (total, record) => total + record.cementSales,
    0,
  );
  const fuelPetrolSales = todaySummaryRecords.reduce(
    (total, record) => total + record.petrolSales,
    0,
  );
  const fuelDieselSales = todaySummaryRecords.reduce(
    (total, record) => total + record.dieselSales,
    0,
  );
  const riceSales = todaySummaryRecords.reduce(
    (total, record) => total + record.riceSales,
    0,
  );
  const cookingSales = todaySummaryRecords.reduce(
    (total, record) => total + record.cookingOilSales,
    0,
  );
  const otherShopSales = todaySummaryRecords.reduce(
    (total, record) => total + record.otherShopSales,
    0,
  );
  const cementBagsSold = todaySummaryRecords.reduce(
    (total, record) => total + record.cementBagsSold,
    0,
  );
  const totalTodaySales = todaySummaryRecords.reduce(
    (total, record) => total + record.totalSales,
    0,
  );
  const todayTransactionCount = todaySummaryRecords.reduce(
    (total, record) => total + record.transactions,
    0,
  );

  return {
    salesByStation,
    salesByDay,
    lowStockAlerts,
    todaySales: {
      fuel: todayFuelSales,
      shop: todayShopSales,
      cement: todayCementSales,
    },
    topStations,
    latestSalesDate,
    fuelPetrolSales,
    fuelDieselSales,
    riceSales,
    cookingSales,
    otherShopSales,
    cementBagsSold,
    totalTodaySales,
    bestStation: topStations[0] || null,
    alertCount: lowStockAlerts.length,
    todayTransactionCount,
  };
}

function toDisplayCategory(category) {
  if (category === "fuel") {
    return "Fuel";
  }
  if (category === "cement") {
    return "Cement";
  }
  return "Shop";
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sumAmountByType(records, type) {
  return records
    .filter((record) => record.type === type)
    .reduce((total, record) => total + record.amount, 0);
}

function sumAmountByTypeAndItem(records, type, item) {
  return records
    .filter(
      (record) =>
        record.type === type &&
        normalizeProductName(record.item).includes(normalizeProductName(item)),
    )
    .reduce((total, record) => total + record.amount, 0);
}

function normalizeProductName(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function getLatestDate(records) {
  return records.reduce(
    (latest, record) => (record.date > latest ? record.date : latest),
    records[0]?.date || "",
  );
}

function normalizeDashboardSummaryDocument(document) {
  return {
    id: document.$id,
    date: document.date || "",
    stationId: document.station_id || "",
    station: document.station_name || "",
    cashierName: document.cashier_name || "",
    fuelSales: Number(document.fuel_sales || 0),
    petrolSales: Number(document.petrol_sales || 0),
    dieselSales: Number(document.diesel_sales || 0),
    shopSales: Number(document.shop_sales || 0),
    riceSales: Number(document.rice_sales || 0),
    cookingOilSales: Number(document.cooking_oil_sales || 0),
    otherShopSales: Number(document.other_shop_sales || 0),
    cementSales: Number(document.cement_sales || 0),
    cementBagsSold: Number(document.cement_bags_sold || 0),
    totalSales: Number(document.total_sales || 0),
    transactions: Number(document.transactions || 0),
  };
}

function normalizeStationProductSummaryDocument(document) {
  return {
    id: document.$id || "",
    date: document.date || "",
    stationId: document.station_id || "",
    station: document.station_name || "",
    productId: document.product_id || "",
    productName: document.product_name || "",
    category: toDisplayCategory(document.category),
    categoryKey: `${document.category || ""}`.trim().toLowerCase(),
    unit: document.unit || "",
    receivedQuantity: Number(document.received_quantity || 0),
    soldQuantity: Number(document.sold_quantity || 0),
    soldAmount: Number(document.sold_amount || 0),
    netQuantity: Number(document.net_quantity || 0),
    transactions: Number(document.transactions || 0),
  };
}

function normalizeStationCategorySummaryDocument(document) {
  return {
    id: document.$id || "",
    date: document.date || "",
    stationId: document.station_id || "",
    station: document.station_name || "",
    category: toDisplayCategory(document.category),
    categoryKey: `${document.category || ""}`.trim().toLowerCase(),
    totalQuantity: Number(document.total_quantity || 0),
    totalAmount: Number(document.total_amount || 0),
    transactions: Number(document.transactions || 0),
  };
}

function buildPaymentMethodRecords(documents = []) {
  const recordsByCode = new Map(
    getDefaultPaymentMethods().map((defaultRecord) => [
      defaultRecord.code,
      {
        id: `payment-method-${defaultRecord.code}`,
        ...defaultRecord,
        isPersisted: false,
        isDefault: true,
      },
    ]),
  );

  (Array.isArray(documents) ? documents : []).forEach((document) => {
    const code = normalizePaymentMethodCode(document.code);

    if (!code) {
      return;
    }

    const defaultRecord = getDefaultPaymentMethodByCode(code);
    const existingRecord = recordsByCode.get(code);
    const sortOrder = Number(document.sort_order);

    recordsByCode.set(code, {
      id: document.$id || existingRecord?.id || `payment-method-${code}`,
      code,
      label:
        document.label ||
        existingRecord?.label ||
        buildPaymentMethodFallbackLabel(code),
      description: document.description || existingRecord?.description || "",
      isEnabled:
        typeof document.is_enabled === "boolean"
          ? document.is_enabled
          : (existingRecord?.isEnabled ?? true),
      sortOrder:
        Number.isFinite(sortOrder) && sortOrder >= 0
          ? sortOrder
          : (existingRecord?.sortOrder ?? recordsByCode.size),
      isPersisted: Boolean(document.$id),
      isDefault: Boolean(defaultRecord),
    });
  });

  return Array.from(recordsByCode.values()).sort(
    (left, right) =>
      Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
      left.label.localeCompare(right.label),
  );
}

function buildPaymentMethodFallbackLabel(code) {
  const fallbackCode = buildPaymentMethodCodeFromLabel(code);

  return fallbackCode
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function mapSalesItemDocumentToRecord(document, receiptsById = new Map()) {
  const receiptMetadata = receiptsById.get(document.receipt_id || "") || {};

  return {
    id: document.$id,
    receiptId: document.receipt_id || "",
    receiptNumber: receiptMetadata.receiptNumber || "",
    date: `${document.sale_date || ""}`.slice(0, 10),
    saleDate: `${document.sale_date || ""}`,
    stationId: document.station_id || "",
    station: document.station_name || "",
    type: toDisplayCategory(document.category),
    category: toDisplayCategory(document.category),
    item: document.product_name || "",
    amount: Number(document.line_total || 0),
    quantity: Number(document.quantity || 0),
    cashierName: receiptMetadata.cashierName || "",
    customerName: receiptMetadata.customerName || "",
    customerPhone: receiptMetadata.customerPhone || "",
    paymentMethod:
      receiptMetadata.paymentMethodDisplay ||
      receiptMetadata.paymentMethodLabel ||
      receiptMetadata.paymentMethod ||
      "",
    paymentStatus: receiptMetadata.paymentStatus || "",
    receiptStatus: receiptMetadata.status || "",
    source: receiptMetadata.source || "",
  };
}

function sortPosReceiptRecords(left, right) {
  return (
    `${right.saleDate || ""}`.localeCompare(`${left.saleDate || ""}`) ||
    Number(right.amount || 0) - Number(left.amount || 0) ||
    `${right.receiptId || right.id || ""}`.localeCompare(
      `${left.receiptId || left.id || ""}`,
    )
  );
}

function sortSalesTransactionRecords(left, right) {
  return (
    `${right.saleDate || ""}`.localeCompare(`${left.saleDate || ""}`) ||
    Number(right.amount || 0) - Number(left.amount || 0) ||
    `${right.id || ""}`.localeCompare(`${left.id || ""}`)
  );
}

function buildSalesByStation(records) {
  const grouped = new Map();

  records.forEach((record) => {
    if (!grouped.has(record.station)) {
      grouped.set(record.station, {
        station: record.station,
        fuel: 0,
        shop: 0,
        cement: 0,
        total: 0,
        lastDate: record.date,
      });
    }

    const station = grouped.get(record.station);
    const bucket =
      record.type === "Fuel"
        ? "fuel"
        : record.type === "Cement"
          ? "cement"
          : "shop";

    station[bucket] += record.amount;
    station.total += record.amount;
    if (record.date > station.lastDate) {
      station.lastDate = record.date;
    }
  });

  return Array.from(grouped.values()).sort(
    (left, right) => right.total - left.total,
  );
}

function buildSalesByDay(records) {
  const grouped = new Map();

  records.forEach((record) => {
    grouped.set(record.date, (grouped.get(record.date) || 0) + record.amount);
  });

  return Array.from(grouped.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, total]) => ({ date, total }));
}

function buildSalesByStationFromSummary(records) {
  const grouped = new Map();

  records.forEach((record) => {
    if (!grouped.has(record.station)) {
      grouped.set(record.station, {
        station: record.station,
        fuel: 0,
        shop: 0,
        cement: 0,
        total: 0,
        lastDate: record.date,
      });
    }

    const station = grouped.get(record.station);
    station.fuel += record.fuelSales;
    station.shop += record.shopSales;
    station.cement += record.cementSales;
    station.total += record.totalSales;
    if (record.date > station.lastDate) {
      station.lastDate = record.date;
    }
  });

  return Array.from(grouped.values()).sort(
    (left, right) => right.total - left.total,
  );
}

function buildSalesByDayFromSummary(records) {
  const grouped = new Map();

  records.forEach((record) => {
    grouped.set(
      record.date,
      (grouped.get(record.date) || 0) + record.totalSales,
    );
  });

  return Array.from(grouped.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, total]) => ({ date, total }));
}

function buildLowStockAlerts(inventoryData) {
  return inventoryData
    .filter((record) => record.quantity <= record.reorderLevel)
    .sort(
      (left, right) =>
        left.quantity / Math.max(left.reorderLevel, 1) -
        right.quantity / Math.max(right.reorderLevel, 1),
    )
    .slice(0, 3)
    .map((record, index) => ({
      id: index + 1,
      item: record.name,
      station: record.station,
      current: record.quantity,
      required: record.reorderLevel,
    }));
}

async function queryCollectionDocuments(
  collectionId,
  {
    pageLimit = DEFAULT_PAGE_LIMIT,
    timeoutMs = DEFAULT_COLLECTION_TIMEOUT_MS,
    select = null,
    filterQueries = [],
    retryAttempts = DEFAULT_COLLECTION_RETRY_ATTEMPTS,
    requestLabel = collectionId,
  } = {},
) {
  if (!hasServerAppwriteConfig()) {
    return [];
  }

  const config = getServerAppwriteConfig();
  const documents = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (documents.length < total) {
    const queries = [
      ...filterQueries,
      Query.limit(pageLimit),
      Query.offset(offset),
    ];

    if (Array.isArray(select) && select.length > 0) {
      queries.unshift(Query.select(select));
    }

    const payload = await runCollectionRequestWithRetry(
      () =>
        listCollectionDocumentsPage(
          config,
          collectionId,
          queries,
          requestLabel,
          timeoutMs,
        ),
      requestLabel,
      retryAttempts,
    );
    const batch = payload.documents || [];

    total = payload.total ?? batch.length;
    documents.push(...batch);

    if (batch.length < pageLimit) {
      break;
    }

    offset += pageLimit;
  }

  return documents;
}

async function queryCollectionDocumentsPage(
  collectionId,
  {
    limit = DEFAULT_PAGE_LIMIT,
    timeoutMs = DEFAULT_COLLECTION_TIMEOUT_MS,
    select = null,
    filterQueries = [],
    sortQueries = [],
    cursorAfter = "",
    retryAttempts = DEFAULT_COLLECTION_RETRY_ATTEMPTS,
    requestLabel = collectionId,
  } = {},
) {
  if (!hasServerAppwriteConfig()) {
    return { documents: [] };
  }

  const config = getServerAppwriteConfig();
  const queries = [...filterQueries, ...sortQueries, Query.limit(limit)];

  if (cursorAfter) {
    queries.push(Query.cursorAfter(cursorAfter));
  }

  if (Array.isArray(select) && select.length > 0) {
    queries.unshift(Query.select(select));
  }

  return runCollectionRequestWithRetry(
    () =>
      listCollectionDocumentsPage(
        config,
        collectionId,
        queries,
        requestLabel,
        timeoutMs,
      ),
    requestLabel,
    retryAttempts,
  );
}

async function listCollectionDocumentsPage(
  config,
  collectionId,
  queries,
  requestLabel,
  timeoutMs = DEFAULT_COLLECTION_TIMEOUT_MS,
) {
  const endpoint = buildAppwriteDocumentsUrl(
    config.apiBaseUrl,
    config.databaseId,
    collectionId,
    queries,
  );

  return performJsonRequest(
    endpoint,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Appwrite-Project": config.projectId,
        "X-Appwrite-Key": config.apiKey,
      },
    },
    requestLabel,
    timeoutMs,
  );
}

function buildAppwriteDocumentsUrl(
  apiBaseUrl,
  databaseId,
  collectionId,
  queries = [],
) {
  const url = new URL(
    `${trimTrailingSlash(apiBaseUrl)}/databases/${databaseId}/collections/${collectionId}/documents`,
  );

  queries.forEach((query) => {
    url.searchParams.append("queries[]", query);
  });

  return url;
}

function performJsonRequest(
  url,
  options = {},
  requestLabel = "request",
  timeoutMs = DEFAULT_COLLECTION_TIMEOUT_MS,
) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "http:" ? http : https;
    const request = transport.request(
      url,
      {
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          clearTimeout(timeoutId);

          const payload = safeParseJson(responseBody);

          if (
            response.statusCode &&
            response.statusCode >= 200 &&
            response.statusCode < 300
          ) {
            resolve(payload);
            return;
          }

          reject(
            new Error(
              payload?.message ||
                `Failed to fetch Appwrite collection "${requestLabel}".`,
            ),
          );
        });
      },
    );

    const timeoutId = setTimeout(() => {
      request.destroy(
        new Error(
          `Appwrite collection "${requestLabel}" timed out after ${timeoutMs}ms.`,
        ),
      );
    }, timeoutMs);

    request.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    request.end();
  });
}

async function getScopedSalesData({
  startDate = "",
  endDate = "",
  stationId = "",
  branchName = "",
  cashierName = "",
  categories = [],
  includeCashierMetadata = false,
  cacheNamespace = "scoped-sales-data",
  useMemoryCache = true,
  itemsTimeoutMs = getPositiveInteger(
    process.env.APPWRITE_SALES_ITEMS_TIMEOUT_MS,
    DEFAULT_COLLECTION_TIMEOUT_MS,
  ),
  receiptsTimeoutMs = getPositiveInteger(
    process.env.APPWRITE_SALES_RECEIPTS_TIMEOUT_MS,
    DEFAULT_COLLECTION_TIMEOUT_MS,
  ),
  pageLimit = DEFAULT_DASHBOARD_PAGE_LIMIT,
} = {}) {
  const normalizedStartDate = normalizeDateValue(startDate);
  const normalizedEndDate = normalizeDateValue(endDate);
  const rangeStart =
    normalizedStartDate && normalizedEndDate
      ? normalizedStartDate <= normalizedEndDate
        ? normalizedStartDate
        : normalizedEndDate
      : normalizedStartDate || normalizedEndDate || getTodayDateString();
  const rangeEnd =
    normalizedStartDate && normalizedEndDate
      ? normalizedStartDate <= normalizedEndDate
        ? normalizedEndDate
        : normalizedStartDate
      : normalizedEndDate || normalizedStartDate || getTodayDateString();
  const normalizedStationId = `${stationId || ""}`.trim();
  const normalizedBranchName = `${branchName || ""}`.trim();
  const normalizedCashierName = `${cashierName || ""}`.trim();
  const normalizedCategories = Array.from(
    new Set(
      (Array.isArray(categories) ? categories : [])
        .map((value) => `${value || ""}`.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort();
  const shouldLoadCashierMetadata = Boolean(includeCashierMetadata);
  const cacheKey = [
    cacheNamespace,
    rangeStart,
    rangeEnd,
    pageLimit,
    normalizedStationId || "all-stations-by-id",
    normalizedBranchName || "all-branches",
    normalizedCategories.join(",") || "all-categories",
    shouldLoadCashierMetadata
      ? normalizedCashierName || "all-cashiers"
      : "no-cashier",
  ].join(":");

  const loadSalesData = async () => {
    const salesItemsFilterQueries = buildSalesDateRangeQueries(
      rangeStart,
      rangeEnd,
    );

    if (normalizedStationId) {
      salesItemsFilterQueries.push(
        Query.equal("station_id", normalizedStationId),
      );
    } else if (normalizedBranchName) {
      salesItemsFilterQueries.push(
        Query.equal("station_name", normalizedBranchName),
      );
    }

    if (normalizedCategories.length === 1) {
      salesItemsFilterQueries.push(
        Query.equal("category", normalizedCategories[0]),
      );
    } else if (normalizedCategories.length > 1) {
      salesItemsFilterQueries.push(
        Query.equal("category", normalizedCategories),
      );
    }

    const documentsPromise = queryCollectionDocuments(
      COLLECTIONS.salesReceiptItems,
      {
        pageLimit,
        timeoutMs: itemsTimeoutMs,
        select:
          COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceiptItems]?.select,
        filterQueries: salesItemsFilterQueries,
        retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
        requestLabel: `${cacheNamespace}_items`,
      },
    );

    const receiptsPromise = shouldLoadCashierMetadata
      ? queryCollectionDocuments(COLLECTIONS.salesReceipts, {
          pageLimit,
          timeoutMs: receiptsTimeoutMs,
          select: COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.select,
          filterQueries: buildSalesReceiptQueries(rangeStart, rangeEnd, {
            stationId: normalizedStationId,
            branchName: normalizedBranchName,
            cashierName: normalizedCashierName,
          }),
          retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
          requestLabel: `${cacheNamespace}_receipts`,
        })
      : Promise.resolve([]);

    const [documents, receipts] = await Promise.all([
      documentsPromise,
      receiptsPromise,
    ]);
    const receiptsById = new Map(
      receipts.map((receipt) => [
        receipt.$id,
        {
          cashierName: receipt.cashier_name || "",
          customerName: receipt.customer_name || "",
          customerPhone:
            receipt.customer_phone ||
            extractCustomerPhoneFromNotes(receipt.notes) ||
            "",
          status: receipt.status || "",
          source: receipt.source || "",
        },
      ]),
    );

    return documents
      .map((document) => ({
        id: document.$id,
        date: `${document.sale_date || ""}`.slice(0, 10),
        saleDate: `${document.sale_date || ""}`,
        stationId: document.station_id || "",
        station: document.station_name || "",
        type: toDisplayCategory(document.category),
        item: document.product_name || "",
        amount: Number(document.line_total || 0),
        quantity: Number(document.quantity || 0),
        cashierName: receiptsById.get(document.receipt_id)?.cashierName || "",
        customerName: receiptsById.get(document.receipt_id)?.customerName || "",
        customerPhone:
          receiptsById.get(document.receipt_id)?.customerPhone || "",
        receiptStatus: receiptsById.get(document.receipt_id)?.status || "",
        source: receiptsById.get(document.receipt_id)?.source || "",
      }))
      .filter(
        (record) =>
          record.date &&
          record.station &&
          record.item &&
          (!record.receiptStatus || record.receiptStatus === "completed"),
      )
      .sort(
        (left, right) =>
          left.date.localeCompare(right.date) ||
          left.station.localeCompare(right.station) ||
          left.item.localeCompare(right.item),
      );
  };

  if (!useMemoryCache) {
    return loadSalesData();
  }

  return getCachedResource(
    cacheKey,
    DEFAULT_COLLECTION_CACHE_TTL_MS,
    loadSalesData,
    cacheNamespace,
  );
}

async function loadSalesData({ useMemoryCache = true } = {}) {
  const [documents, receipts] = await Promise.all([
    useMemoryCache
      ? getSalesReceiptItemDocuments()
      : queryCollectionDocuments(COLLECTIONS.salesReceiptItems, {
          pageLimit:
            COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceiptItems]
              ?.pageLimit ?? DEFAULT_PAGE_LIMIT,
          timeoutMs:
            COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceiptItems]
              ?.timeoutMs ?? DEFAULT_COLLECTION_TIMEOUT_MS,
          select:
            COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceiptItems]?.select,
          retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
          requestLabel: "sales-data_items",
        }),
    useMemoryCache
      ? getSalesReceiptDocuments()
      : queryCollectionDocuments(COLLECTIONS.salesReceipts, {
          pageLimit:
            COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.pageLimit ??
            DEFAULT_PAGE_LIMIT,
          timeoutMs:
            COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.timeoutMs ??
            DEFAULT_COLLECTION_TIMEOUT_MS,
          select: COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.select,
          retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
          requestLabel: "sales-data_receipts",
        }),
  ]);

  const receiptsById = new Map(
    receipts.map((receipt) => [
      receipt.$id,
      {
        cashierName: receipt.cashier_name || "",
        customerName: receipt.customer_name || "",
        customerPhone:
          receipt.customer_phone ||
          extractCustomerPhoneFromNotes(receipt.notes) ||
          "",
        status: receipt.status || "",
        source: receipt.source || "",
      },
    ]),
  );

  return documents
    .map((document) => ({
      id: document.$id,
      date: `${document.sale_date || ""}`.slice(0, 10),
      saleDate: `${document.sale_date || ""}`,
      stationId: document.station_id || "",
      station: document.station_name || "",
      type: toDisplayCategory(document.category),
      item: document.product_name || "",
      amount: Number(document.line_total || 0),
      quantity: Number(document.quantity || 0),
      cashierName: receiptsById.get(document.receipt_id)?.cashierName || "",
      customerName: receiptsById.get(document.receipt_id)?.customerName || "",
      customerPhone: receiptsById.get(document.receipt_id)?.customerPhone || "",
      receiptStatus: receiptsById.get(document.receipt_id)?.status || "",
      source: receiptsById.get(document.receipt_id)?.source || "",
    }))
    .filter(
      (record) =>
        record.date &&
        record.station &&
        record.item &&
        (!record.receiptStatus || record.receiptStatus === "completed"),
    )
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.station.localeCompare(right.station) ||
        left.item.localeCompare(right.item),
    );
}

function buildSalesDateRangeQueries(startDate, endDate) {
  return [
    Query.greaterThanEqual("sale_date", toStartOfDayIso(startDate)),
    Query.lessThanEqual("sale_date", toEndOfDayIso(endDate)),
  ];
}

function buildSalesReceiptQueries(
  startDate,
  endDate,
  { stationId = "", branchName = "", cashierName = "" } = {},
) {
  const queries = buildSalesDateRangeQueries(startDate, endDate);

  if (stationId) {
    queries.push(Query.equal("station_id", stationId));
  } else if (branchName) {
    queries.push(Query.equal("station_name", branchName));
  }

  if (cashierName) {
    queries.push(Query.equal("cashier_name", cashierName));
  }

  return queries;
}

async function getSalesReceiptMetadataByIds(receiptIds = []) {
  const uniqueReceiptIds = Array.from(
    new Set(
      (Array.isArray(receiptIds) ? receiptIds : [])
        .map((value) => `${value || ""}`.trim())
        .filter(Boolean),
    ),
  );

  if (uniqueReceiptIds.length === 0) {
    return new Map();
  }

  const documents = [];

  for (
    let index = 0;
    index < uniqueReceiptIds.length;
    index += MAX_TRANSACTION_PAGE_SIZE
  ) {
    const batch = uniqueReceiptIds.slice(
      index,
      index + MAX_TRANSACTION_PAGE_SIZE,
    );
    const payload = await queryCollectionDocumentsPage(
      COLLECTIONS.salesReceipts,
      {
        limit: batch.length,
        timeoutMs:
          COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.timeoutMs ??
          DEFAULT_COLLECTION_TIMEOUT_MS,
        select: COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceipts]?.select,
        filterQueries: [Query.equal("$id", batch)],
        retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
        requestLabel: "sales-transaction-receipts",
      },
    );

    documents.push(...(payload?.documents || []));
  }

  const creditBalancesByReceiptId = await getCreditBalanceMetadataByReceiptIds(
    documents.map((document) => document.$id || ""),
  );

  return new Map(
    documents.map((document) => [
      document.$id,
      (() => {
        const creditBalanceMetadata =
          creditBalancesByReceiptId.get(document.$id) || null;

        return {
          receiptNumber: document.receipt_number || "",
          stationId: document.station_id || "",
          stationName: document.station_name || "",
          saleDate: document.sale_date || "",
          totalAmount: Number(document.total_amount || 0),
          cashierName: document.cashier_name || "",
          customerName: document.customer_name || "",
          customerPhone:
            document.customer_phone ||
            extractCustomerPhoneFromNotes(document.notes) ||
            "",
          status: document.status || "",
          paymentMethodLabel: document.payment_method_label || "",
          paymentMethod: document.payment_method || "",
          paymentStatus: document.payment_status || "",
          paymentMethodDisplay: buildReceiptPaymentMethodDisplay({
            paymentMethodCode:
              document.payment_method_code || document.payment_method || "",
            paymentMethodLabel: document.payment_method_label || "",
            paymentMethod: document.payment_method || "",
            paymentStatus: document.payment_status || "",
            creditBalanceAmount: creditBalanceMetadata?.balanceAmount,
          }),
          source: document.source || "",
        };
      })(),
    ]),
  );
}

async function getSalesReceiptItemSummariesByReceiptIds(receiptIds = []) {
  const uniqueReceiptIds = Array.from(
    new Set(
      (Array.isArray(receiptIds) ? receiptIds : [])
        .map((value) => `${value || ""}`.trim())
        .filter(Boolean),
    ),
  );

  if (uniqueReceiptIds.length === 0) {
    return new Map();
  }

  const documents = [];

  for (
    let index = 0;
    index < uniqueReceiptIds.length;
    index += MAX_TRANSACTION_PAGE_SIZE
  ) {
    const batch = uniqueReceiptIds.slice(index, index + MAX_TRANSACTION_PAGE_SIZE);
    const batchDocuments = await queryCollectionDocuments(COLLECTIONS.salesReceiptItems, {
      pageLimit:
        COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceiptItems]?.pageLimit,
      timeoutMs:
        COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceiptItems]?.timeoutMs ??
        DEFAULT_COLLECTION_TIMEOUT_MS,
      select: COLLECTION_QUERY_SETTINGS[COLLECTIONS.salesReceiptItems]?.select,
      filterQueries: [Query.equal("receipt_id", batch)],
      retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
      requestLabel: "pos-receipt-item-summaries",
    });

    documents.push(...batchDocuments);
  }

  const grouped = new Map();

  documents.forEach((document) => {
    const receiptId = `${document.receipt_id || ""}`.trim();

    if (!receiptId) {
      return;
    }

    const current = grouped.get(receiptId) || {
      itemCount: 0,
      itemNames: [],
    };

    current.itemCount += 1;

    if (document.product_name) {
      current.itemNames.push(document.product_name);
    }

    grouped.set(receiptId, current);
  });

  return new Map(
    Array.from(grouped.entries()).map(([receiptId, value]) => {
      const uniqueItemNames = Array.from(new Set(value.itemNames.filter(Boolean)));
      const itemSummary =
        uniqueItemNames.length <= 2
          ? uniqueItemNames.join(", ")
          : `${uniqueItemNames.slice(0, 2).join(", ")} +${uniqueItemNames.length - 2} more`;

      return [
        receiptId,
        {
          itemCount: value.itemCount,
          itemSummary,
        },
      ];
    }),
  );
}

async function getCreditBalanceMetadataByReceiptIds(receiptIds = []) {
  const uniqueReceiptIds = Array.from(
    new Set(
      (Array.isArray(receiptIds) ? receiptIds : [])
        .map((value) => `${value || ""}`.trim())
        .filter(Boolean),
    ),
  );

  if (uniqueReceiptIds.length === 0) {
    return new Map();
  }

  const movementDocuments = [];

  for (
    let index = 0;
    index < uniqueReceiptIds.length;
    index += MAX_TRANSACTION_PAGE_SIZE
  ) {
    const batch = uniqueReceiptIds.slice(index, index + MAX_TRANSACTION_PAGE_SIZE);
    const payload = await queryCollectionDocumentsPage(
      COLLECTIONS.customerBalanceMovements,
      {
        limit: batch.length,
        timeoutMs: DEFAULT_COLLECTION_TIMEOUT_MS,
        select: ["$id", "account_id", "receipt_id"],
        filterQueries: [
          Query.equal("account_type", "credit"),
          Query.equal("receipt_id", batch),
        ],
        retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
        requestLabel: "sales-transaction-credit-movements",
      },
    );

    movementDocuments.push(...(payload?.documents || []));
  }

  const accountIds = Array.from(
    new Set(
      movementDocuments
        .map((document) => `${document.account_id || ""}`.trim())
        .filter(Boolean),
    ),
  );

  if (accountIds.length === 0) {
    return new Map();
  }

  const accountDocuments = [];

  for (
    let index = 0;
    index < accountIds.length;
    index += MAX_TRANSACTION_PAGE_SIZE
  ) {
    const batch = accountIds.slice(index, index + MAX_TRANSACTION_PAGE_SIZE);
    const payload = await queryCollectionDocumentsPage(
      COLLECTIONS.customerBalances,
      {
        limit: batch.length,
        timeoutMs: DEFAULT_COLLECTION_TIMEOUT_MS,
        select: ["$id", "balance_amount", "status"],
        filterQueries: [
          Query.equal("account_type", "credit"),
          Query.equal("$id", batch),
        ],
        retryAttempts: DEFAULT_COLLECTION_RETRY_ATTEMPTS,
        requestLabel: "sales-transaction-credit-balances",
      },
    );

    accountDocuments.push(...(payload?.documents || []));
  }

  const accountsById = new Map(
    accountDocuments.map((document) => [
      document.$id,
      {
        balanceAmount: Number(document.balance_amount || 0),
        status: document.status || "",
      },
    ]),
  );

  return new Map(
    movementDocuments.map((document) => {
      const account = accountsById.get(document.account_id || "") || null;

      return [
        document.receipt_id || "",
        {
          accountId: document.account_id || "",
          balanceAmount: Number(account?.balanceAmount || 0),
          status: account?.status || "",
        },
      ];
    }),
  );
}

function buildReceiptPaymentMethodDisplay({
  paymentMethodCode = "",
  paymentMethodLabel = "",
  paymentMethod = "",
  paymentStatus = "",
  creditBalanceAmount = null,
} = {}) {
  const normalizedCode = normalizePaymentMethodCode(
    paymentMethodCode || paymentMethod || paymentMethodLabel,
  );

  if (normalizedCode === "credit") {
    const normalizedStatus = `${paymentStatus || ""}`.trim().toLowerCase();
    const hasBalanceMetadata =
      creditBalanceAmount !== null && creditBalanceAmount !== undefined;
    const balanceAmount = Number(creditBalanceAmount || 0);

    if (normalizedStatus === "paid") {
      return "Credit (paid)";
    }

    if (hasBalanceMetadata && Number.isFinite(balanceAmount) && balanceAmount <= 0) {
      return "Credit (paid)";
    }

    if (hasBalanceMetadata && Number.isFinite(balanceAmount) && balanceAmount > 0) {
      return `Credit (bal: ${formatCompactCurrency(balanceAmount)})`;
    }

    return "Credit";
  }

  return paymentMethodLabel || paymentMethod || "";
}

function formatCompactCurrency(value) {
  return `D${Number(value || 0).toLocaleString()}`;
}

function normalizeDateValue(value) {
  const normalizedValue = `${value || ""}`.slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + amount);

  return date.toISOString().slice(0, 10);
}

function toStartOfDayIso(dateString) {
  return `${dateString}T00:00:00.000Z`;
}

function toEndOfDayIso(dateString) {
  return `${dateString}T23:59:59.999Z`;
}

function trimTrailingSlash(value) {
  return `${value || ""}`.replace(/\/+$/, "");
}

function safeParseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractRecordedByFromNotes(notes) {
  const match = `${notes || ""}`.match(/Recorded by:\s*([^·\n\r]+)/i);

  return match?.[1]?.trim() || "";
}

function extractCustomerPhoneFromNotes(notes) {
  const match = `${notes || ""}`.match(/Customer phone:\s*([^·\n\r]+)/i);

  return match?.[1]?.trim() || "";
}

function extractReceiptNoteValue(notes, label) {
  const escapedLabel = `${label || ""}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = `${notes || ""}`.match(new RegExp(`${escapedLabel}:\\s*([^\\n\\r]+)`, "i"));

  return match?.[1]?.trim() || "";
}

function getCachedResource(
  resourceKey,
  cacheTtlMs,
  loader,
  errorLabel = resourceKey,
) {
  const freshCachedData = getFreshCollectionCache(resourceKey, cacheTtlMs);

  if (freshCachedData) {
    return Promise.resolve(freshCachedData);
  }

  const staleCachedData = getStaleCollectionCache(resourceKey);
  const activeRequest = collectionInFlightRequests.get(resourceKey);

  if (activeRequest) {
    return activeRequest.catch((error) => {
      if (staleCachedData) {
        console.warn(
          `Appwrite resource "${errorLabel}" failed to refresh. Using stale cached data instead.`,
        );
        return staleCachedData;
      }

      throw error;
    });
  }

  const requestPromise = (async () => {
    const data = await loader();

    setCollectionCache(resourceKey, data);

    return data;
  })()
    .catch((error) => {
      if (staleCachedData) {
        console.warn(
          `Appwrite resource "${errorLabel}" failed to refresh. Using stale cached data instead.`,
        );
        return staleCachedData;
      }

      throw error;
    })
    .finally(() => {
      collectionInFlightRequests.delete(resourceKey);
    });

  collectionInFlightRequests.set(resourceKey, requestPromise);

  return requestPromise;
}

function getPositiveInteger(value, fallbackValue) {
  const parsed = Number.parseInt(`${value || ""}`, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return parsed;
}

async function runCollectionRequestWithRetry(
  operation,
  collectionId,
  retryAttempts = DEFAULT_COLLECTION_RETRY_ATTEMPTS,
) {
  let lastError = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < retryAttempts) {
        console.warn(
          `Appwrite collection "${collectionId}" request failed on attempt ${attempt}/${retryAttempts}. Retrying...`,
        );
      }
    }
  }

  throw lastError;
}

function getFreshCollectionCache(collectionId, cacheTtlMs) {
  const cacheEntry = collectionMemoryCache.get(collectionId);

  if (!cacheEntry) {
    return null;
  }

  if (Date.now() - cacheEntry.updatedAt > cacheTtlMs) {
    return null;
  }

  return cacheEntry.documents;
}

function getStaleCollectionCache(collectionId) {
  return collectionMemoryCache.get(collectionId)?.documents || null;
}

function setCollectionCache(collectionId, documents) {
  collectionMemoryCache.set(collectionId, {
    documents,
    updatedAt: Date.now(),
  });
}

function getStartDateIsoForLastDays(days) {
  const normalizedDays = Math.max(1, Number(days) || 1);
  const startDate = new Date();

  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCDate(startDate.getUTCDate() - (normalizedDays - 1));

  return startDate.toISOString();
}

export function invalidateAppwriteCollectionCache(collectionIds = []) {
  if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
    collectionMemoryCache.clear();
    collectionInFlightRequests.clear();
    return;
  }

  const cachePrefixesToClear = new Set();

  if (
    collectionIds.includes(COLLECTIONS.salesReceipts) ||
    collectionIds.includes(COLLECTIONS.salesReceiptItems)
  ) {
    cachePrefixesToClear.add("sales-range-data:");
    cachePrefixesToClear.add("dashboard-sales-data:");
  }

  if (
    collectionIds.includes(COLLECTIONS.stationDailySummary) ||
    collectionIds.includes(COLLECTIONS.cashierDailySummary)
  ) {
    cachePrefixesToClear.add("dashboard-summary-data:");
  }

  if (collectionIds.includes(COLLECTIONS.stationProductDailySummary)) {
    cachePrefixesToClear.add("station-product-summary-data:");
  }

  if (collectionIds.includes(COLLECTIONS.stationCategoryDailySummary)) {
    cachePrefixesToClear.add("station-category-summary-data:");
  }

  collectionIds.forEach((collectionId) => {
    collectionMemoryCache.delete(collectionId);
    collectionInFlightRequests.delete(collectionId);
  });

  if (cachePrefixesToClear.size === 0) {
    return;
  }

  Array.from(collectionMemoryCache.keys()).forEach((cacheKey) => {
    if (
      Array.from(cachePrefixesToClear).some((prefix) =>
        `${cacheKey}`.startsWith(prefix),
      )
    ) {
      collectionMemoryCache.delete(cacheKey);
      collectionInFlightRequests.delete(cacheKey);
    }
  });
}
