"use server";

import { createHash } from "node:crypto";

import { ID, Client, Databases, Query } from "appwrite";
import { revalidatePath, revalidateTag } from "next/cache";

import { getCurrentSession } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { roundCurrency, sumCurrency } from "@/features/money/minor-units";
import {
  filterProductsForSession,
  filterStationsForPosSession,
  isFuelSales,
  isGeneralSales,
} from "@/features/auth/scopes";
import {
  buildCouponStatusFromRemainingValue,
  COUPON_COLLECTIONS,
  findCouponByCode,
  isCouponActiveStatus,
  normalizeCouponCompanyName,
  refreshCouponPurchaseTotals,
} from "@/features/coupons/server";
import {
  applyClientRewardMovement,
  creditClientRewardForSale,
  findClientUserByPhone,
  getClientRewardAccountByClientUserId,
  getClientRewardEarnReversalCandidate,
  getRewardSettings,
  reverseClientRewardEarnForReceipt,
  syncFuelGiftPurchaseByGiftCodeId,
} from "@/features/client-users/data";
import { normalizePaymentMethodCode } from "@/features/payments/constants";
import {
  STATION_PRODUCT_DAILY_SUMMARY_COLLECTION,
  upsertStationProductDailySummariesForSale,
} from "@/features/reports/station-product-summary";
import { getActivePaymentMethodsData, invalidateAppwriteCollectionCache } from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  stations: "stations",
  products: "products",
  inventoryItems: "inventory_items",
  salesReceipts: "sales_receipts",
  salesReceiptItems: "sales_receipt_items",
  salesPayments: "sales_payments",
  inventoryMovements: "inventory_movements",
  stationDailySummary: "station_daily_summary",
  cashierDailySummary: "cashier_daily_summary",
  stationProductDailySummary: STATION_PRODUCT_DAILY_SUMMARY_COLLECTION,
  stationCategoryDailySummary: "station_category_daily_summary",
  customerBalances: "customer_balances",
  customerBalanceMovements: "customer_balance_movements",
  auditLogs: "audit_logs",
  couponCompanies: COUPON_COLLECTIONS.companies,
  couponPurchases: COUPON_COLLECTIONS.purchases,
  coupons: COUPON_COLLECTIONS.coupons,
  couponMovements: COUPON_COLLECTIONS.movements,
  fuelGiftCodes: "fuel_gift_codes",
  fuelGiftPurchases: "fuel_gift_purchases",
  rewardAccounts: "client_reward_accounts",
  rewardMovements: "client_reward_movements",
  posTransactionEnvelopes: "pos_transaction_envelopes",
};
const summaryWriteLocks = globalThis.__jahOilSummaryWriteLocks || new Map();
const SUMMARY_READ_RETRY_ATTEMPTS = 5;
const SUMMARY_READ_RETRY_DELAY_MS = 120;

if (!globalThis.__jahOilSummaryWriteLocks) {
  globalThis.__jahOilSummaryWriteLocks = summaryWriteLocks;
}

export async function completePosSaleAction(payload, options = {}) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  const stationId = `${payload?.stationId || ""}`.trim();
  const paymentMethod = `${payload?.paymentMethod || "cash"}`
    .trim()
    .toLowerCase();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const session = options.sessionOverride || (await getCurrentSession());
  const customerName = `${payload?.customerName || ""}`.trim();
  const customerPhone = `${payload?.customerPhone || ""}`.trim();
  const customerEmail = `${payload?.customerEmail || ""}`.trim().toLowerCase();
  const vehicleRegistrationNumber = `${payload?.vehicleRegistrationNumber || ""}`.trim();
  const companyOrOrganizationName = `${payload?.companyOrOrganizationName || ""}`.trim();
  const billableTo = `${payload?.billableTo || ""}`.trim();
  const clientSaleId = `${payload?.clientSaleId || ""}`.trim();
  const couponCode = `${payload?.couponCode || ""}`.trim();
  const bulkReferenceCode = `${payload?.bulkReferenceCode || ""}`.trim();
  const fuelGiftCode = `${payload?.fuelGiftCode || ""}`.trim();
  const creditDueDate = normalizeDateOnlyInput(payload?.creditDueDate);
  const paymentNote = `${payload?.paymentNote || ""}`.trim();
  const saleDate =
    normalizeSaleDateInput(payload?.saleDate) || new Date().toISOString();
  const activePaymentMethods = await getActivePaymentMethodsData();
  const validPaymentMethods = new Set(
    activePaymentMethods.map((method) => `${method.code || ""}`.trim().toLowerCase()),
  );
  const selectedPaymentMethod =
    activePaymentMethods.find((method) => method.code === paymentMethod) || null;
  const paymentFlow = getPaymentFlow(paymentMethod);
  const requiresVehicleRegistration = items.some(
    (item) => normalizeCategory(item?.category, item?.name || item?.productName) === "fuel",
  );

  if (!session) {
    return {
      success: false,
      message: "Your session has expired. Sign in again.",
    };
  }

  if (!session.modules?.includes("pos")) {
    return {
      success: false,
      message: "You do not have access to the POS module.",
    };
  }

  const cashierName = `${session.fullName || payload?.cashierName || "POS Counter"}`.trim();

  if (!stationId) {
    return {
      success: false,
      message: "Select a station before completing the sale.",
    };
  }

  if (!validPaymentMethods.has(paymentMethod)) {
    return {
      success: false,
      message: "Select an available payment method.",
    };
  }

  if (paymentFlow === "coupon" && !couponCode) {
    return {
      success: false,
      message: "Enter a coupon code to redeem this sale.",
    };
  }

  if (
    paymentFlow === "coupon" &&
    (!customerName ||
      !customerPhone ||
      (requiresVehicleRegistration && !vehicleRegistrationNumber) ||
      !companyOrOrganizationName)
  ) {
    return {
      success: false,
      message:
        requiresVehicleRegistration
          ? "Fuel coupon sales require customer name, phone number, vehicle registration number, and company or organization name."
          : "Coupon sales require customer name, phone number, and company or organization name.",
    };
  }

  if (paymentFlow === "bulk-redeem" && !bulkReferenceCode) {
    return {
      success: false,
      message: "Enter the bulk redemption reference before completing the sale.",
    };
  }

  if (paymentFlow === "fuel-gift" && !fuelGiftCode) {
    return {
      success: false,
      message: "Enter the fuel gift code before completing the sale.",
    };
  }

  if (
    paymentFlow === "credit" &&
    (!customerName ||
      !customerPhone ||
      (requiresVehicleRegistration && !vehicleRegistrationNumber) ||
      !billableTo)
  ) {
    return {
      success: false,
      message:
        requiresVehicleRegistration
          ? "Fuel credit sales require customer name, phone number, vehicle registration number, and billable-to details."
          : "Credit sales require customer name, phone number, and billable-to details.",
    };
  }

  if (items.length === 0) {
    return {
      success: false,
      message: "Add at least one product to complete the sale.",
    };
  }

  const normalizedItems = items
    .map((item, index) => ({
      index,
      productId: `${item?.productId || ""}`.trim(),
      productName: `${item?.name || item?.productName || ""}`.trim(),
      category: normalizeCategory(
        item?.category,
        item?.name || item?.productName,
      ),
      quantity: Number(item?.qty ?? item?.quantity ?? 0),
      amount: Number(item?.amount ?? 0),
      unit: `${item?.unit || ""}`.trim(),
      unitPrice: Number(item?.price ?? item?.unitPrice ?? 0),
    }))
    .filter((item) => {
      if (!item.productName || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
        return false;
      }

      if (item.category === "fuel") {
        return Number.isFinite(item.amount) && item.amount > 0;
      }

      return Number.isFinite(item.quantity) && item.quantity > 0;
    });

  if (normalizedItems.length === 0) {
    return {
      success: false,
      message: "Cart contains invalid products.",
    };
  }

  let transactionEnvelopeDatabases = null;
  let transactionEnvelopeId = "";
  let transactionEnvelopeCollectionReady = false;

  try {
    const databases = createServerDatabases();
    transactionEnvelopeDatabases = databases;
    const enhancedWriteSupport = await getEnhancedWriteSupport(databases);
    transactionEnvelopeCollectionReady =
      Boolean(enhancedWriteSupport.posTransactionEnvelopes);
    const receiptId = clientSaleId
      ? buildClientSaleDocumentId(clientSaleId)
      : ID.unique();
    const existingReceipt = await getDocumentOrNull(
      databases,
      COLLECTIONS.salesReceipts,
      receiptId,
    );

    if (existingReceipt) {
      return {
        success: true,
        message: `Sale saved as ${existingReceipt.receipt_number || buildReceiptNumber({ saleDate, clientSaleId })}.`,
        receiptNumber:
          existingReceipt.receipt_number || buildReceiptNumber({ saleDate, clientSaleId }),
        };
    }

    if (isAdvancedPaymentFlow(paymentFlow)) {
      ensureAdvancedPaymentSupport(enhancedWriteSupport, paymentFlow);
    }

    const station = await fetchStation(databases, stationId);

    if (!station) {
      return {
        success: false,
        message: "Selected station could not be found.",
      };
    }

    const allowedStations = filterStationsForPosSession(
      [
        {
          id: station.$id,
          name: station.name || "",
        },
      ],
      session,
    );

    if (allowedStations.length === 0) {
      return {
        success: false,
        message: "You do not have access to sell from the selected station.",
      };
    }

    const resolvedItems = await Promise.all(
      normalizedItems.map(async (item) => {
        const product = await fetchProduct(
          databases,
          item.productId,
          item.productName,
        );

        if (!product) {
          throw new Error(`Product "${item.productName}" could not be found.`);
        }

        if (`${product.status || "active"}` !== "active") {
          throw new Error(`Product "${item.productName}" is currently disabled.`);
        }

        const resolvedCategory = normalizeCategory(
          product.category,
          product.name || item.productName,
        );
        const requestedUnitPrice = Number(item.unitPrice ?? 0);
        const productSellingPrice = Number(product.selling_price ?? 0);
        const resolvedUnitPrice =
          (Number.isFinite(requestedUnitPrice) && requestedUnitPrice > 0
            ? requestedUnitPrice
            : 0) ||
          (Number.isFinite(productSellingPrice) && productSellingPrice > 0
            ? productSellingPrice
            : 0);
        const resolvedQuantity = resolveSaleQuantity({
          ...item,
          category: resolvedCategory,
          unitPrice: resolvedUnitPrice,
        });
        const resolvedLineTotal = resolveSaleLineTotal({
          ...item,
          category: resolvedCategory,
          quantity: resolvedQuantity,
          unitPrice: resolvedUnitPrice,
        });

        if (!Number.isFinite(resolvedQuantity) || resolvedQuantity <= 0) {
          throw new Error(`Enter a valid sale value for ${item.productName}.`);
        }

        if (!Number.isFinite(resolvedLineTotal) || resolvedLineTotal <= 0) {
          throw new Error(`Enter a valid amount for ${item.productName}.`);
        }

        return {
          ...item,
          productId: product.$id,
          productName: product.name || item.productName,
          category: resolvedCategory,
          unit: product.unit || item.unit || "unit",
          unitPrice: resolvedUnitPrice,
          quantity: resolvedQuantity,
          lineTotal: resolvedLineTotal,
        };
      }),
    );

    const allowedProducts = filterProductsForSession(
      resolvedItems.map((item) => ({
        id: item.productId,
        name: item.productName,
        category: item.category,
      })),
      session,
    );
    const allowedProductIds = new Set(allowedProducts.map((product) => product.id));

    if (resolvedItems.some((item) => !allowedProductIds.has(item.productId))) {
      const message = isFuelSales(session.roleName)
        ? "Fuel Sales can only sell Petrol and Diesel."
        : isGeneralSales(session.roleName)
          ? "General Sales can only sell commodity and cement products."
          : "One or more products are not allowed for your role.";

      return {
        success: false,
        message,
      };
    }

    const inventoryItems = await Promise.all(
      resolvedItems.map((item) =>
        fetchInventoryItem(databases, station.$id, item.productId),
      ),
    );

    if (inventoryItems.some((inventoryItem) => !inventoryItem)) {
      return {
        success: false,
        message:
          "One or more products are missing from branch inventory. Update inventory before completing this sale.",
      };
    }

    const subtotal = sumCurrency(resolvedItems.map((item) => item.lineTotal));
    const totalAmount = subtotal;
    const receiptNumber = buildReceiptNumber({ saleDate, clientSaleId });
    const transactionEnvelope = await createPosTransactionEnvelopeRecord(
      databases,
      {
        transactionType: "sale_create",
        status: "applying",
        idempotencyKey: clientSaleId || receiptId,
        receiptId,
        receiptNumber,
        stationId: station.$id,
        stationName: station.name || "",
        cashierName: cashierName || "POS Counter",
        totalAmount,
        payloadSummary: JSON.stringify({
          paymentMethod,
          paymentFlow,
          itemCount: resolvedItems.length,
          saleDate,
        }),
      },
      {
        collectionReady: enhancedWriteSupport.posTransactionEnvelopes,
      },
    );
    transactionEnvelopeId = transactionEnvelope?.$id || "";
    const paymentStatus =
      paymentFlow === "credit" ? "pending" : "paid";
    const balanceOperation = await prepareCustomerBalanceOperation(databases, {
      paymentFlow,
      station,
      customerName,
      customerPhone,
      customerEmail,
      companyOrOrganizationName,
      couponCode,
      bulkReferenceCode,
      fuelGiftCode,
      creditDueDate,
      saleDate,
      totalAmount,
      items: resolvedItems,
    });
    const resolvedSaleCustomerName =
      paymentFlow === "fuel-gift"
        ? customerName ||
          balanceOperation?.recipientName ||
          balanceOperation?.clientName ||
          "Gift Recipient"
        : customerName || "Walk-in Customer";
    const resolvedSaleCustomerPhone =
      paymentFlow === "fuel-gift"
        ? customerPhone || balanceOperation?.clientPhone || ""
        : customerPhone;
    const inventoryAdjustments = resolvedItems.map((item, index) => {
      const inventoryItem = inventoryItems[index];
      const currentQuantity = Number(inventoryItem.quantity || 0);
      const nextQuantity = currentQuantity - Number(item.quantity);
      const reorderLevel = Number(inventoryItem.reorder_level || 0);

      if (nextQuantity < 0) {
        throw new Error(
          `Insufficient stock for ${item.productName}. Available: ${currentQuantity} ${inventoryItem.unit || item.unit}.`,
        );
      }

      return {
        documentId: inventoryItem.$id,
        nextQuantity,
        nextStatus: getInventoryStatus(nextQuantity, reorderLevel),
      };
    });

    await createSalesReceiptDocument(
      databases,
      receiptId,
      {
        receipt_number: receiptNumber,
        station_id: station.$id,
        station_name: station.name || "",
        sale_date: saleDate,
        source: "pos",
        subtotal,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        payment_method_code: paymentMethod,
        payment_method_label: selectedPaymentMethod?.label || paymentMethod,
        payment_status: paymentStatus,
        status: "completed",
        cashier_name: cashierName || "POS Counter",
        customer_name: resolvedSaleCustomerName,
        customer_phone: resolvedSaleCustomerPhone,
        vehicle_registration_number: vehicleRegistrationNumber || "",
        company_name: companyOrOrganizationName || "",
        billable_to: billableTo || "",
        notes: buildReceiptNotes({
          customerPhone: resolvedSaleCustomerPhone,
          vehicleRegistrationNumber,
          companyOrOrganizationName,
          billableTo,
          paymentFlow,
          couponCode:
            paymentFlow === "coupon"
              ? balanceOperation?.referenceCode || couponCode
              : couponCode,
          bulkReferenceCode,
          fuelGiftCode:
            paymentFlow === "fuel-gift"
              ? balanceOperation?.referenceCode || fuelGiftCode
              : fuelGiftCode,
          fuelGiftBulkFunding:
            paymentFlow === "fuel-gift"
              ? serializeFuelGiftBulkFunding(balanceOperation?.bulkAllocations || [])
              : "",
          fuelGiftRewardFunding:
            paymentFlow === "fuel-gift"
              ? Number(balanceOperation?.rewardAllocation?.amount || 0)
              : 0,
          creditDueDate,
          paymentNote,
        }),
        ...(clientSaleId ? { idempotency_key: clientSaleId } : {}),
      },
    );

    await Promise.all(
      resolvedItems.map((item, index) =>
        databases.createDocument(
          getServerAppwriteConfig().databaseId,
          COLLECTIONS.salesReceiptItems,
          ID.unique(),
          {
            receipt_id: receiptId,
            receipt_number: receiptNumber,
            sale_date: saleDate,
            station_id: station.$id,
            station_name: station.name || "",
            product_id: item.productId,
            product_name: item.productName,
            category: item.category,
            line_number: index + 1,
            quantity: Number(item.quantity),
            unit: item.unit,
            unit_price: Number(item.unitPrice),
            line_total: roundCurrency(item.lineTotal),
          },
        ),
      ),
    );
    await Promise.all(
      inventoryAdjustments.map((adjustment) =>
        databases.updateDocument(
          getServerAppwriteConfig().databaseId,
          COLLECTIONS.inventoryItems,
          adjustment.documentId,
          {
            quantity: adjustment.nextQuantity,
            status: adjustment.nextStatus,
            last_updated_at: saleDate,
          },
        ),
      ),
    );
    await createSalesPaymentRecord(
      databases,
      {
        receiptId,
        receiptNumber,
        saleDate,
        stationId: station.$id,
        stationName: station.name || "",
        paymentMethodCode: paymentMethod,
        paymentMethodLabel: selectedPaymentMethod?.label || paymentMethod,
        amount: totalAmount,
        paymentStatus,
        referenceCode: getPaymentReferenceCode({
          paymentFlow,
          couponCode:
            paymentFlow === "coupon"
              ? balanceOperation?.referenceCode || couponCode
              : couponCode,
          bulkReferenceCode,
          fuelGiftCode:
            paymentFlow === "fuel-gift"
              ? balanceOperation?.referenceCode || fuelGiftCode
              : fuelGiftCode,
        }),
        customerName: resolvedSaleCustomerName,
        customerPhone: resolvedSaleCustomerPhone,
        notes: buildPaymentRecordNotes({
          paymentFlow,
          fuelGiftCode:
            paymentFlow === "fuel-gift"
              ? balanceOperation?.referenceCode || fuelGiftCode
              : fuelGiftCode,
          fuelGiftRecipientName: balanceOperation?.recipientName || "",
          vehicleRegistrationNumber,
          companyOrOrganizationName,
          billableTo,
          creditDueDate,
          paymentNote,
        }),
      },
      {
        strict: isAdvancedPaymentFlow(paymentFlow),
        collectionReady: enhancedWriteSupport.salesPayments,
      },
    );
    await applyCustomerBalanceOperation(databases, balanceOperation, {
      receiptId,
      receiptNumber,
      saleDate,
      stationId: station.$id,
      stationName: station.name || "",
      customerName: resolvedSaleCustomerName,
      customerPhone: resolvedSaleCustomerPhone,
      actorUserId: session.userId || "",
      actorName: cashierName || "POS Counter",
    });
    const rewardOutcome = await applyCashBackForRedeemedSale({
      paymentFlow,
      balanceOperation,
      totalAmount,
      receiptId,
      receiptNumber,
      stationId: station.$id,
      stationName: station.name || "",
      actorUserId: session.userId || "",
      actorName: cashierName || "POS Counter",
    });
    await recordInventoryMovements(
      databases,
      resolvedItems,
      inventoryItems,
      inventoryAdjustments,
      {
        receiptId,
        receiptNumber,
        saleDate,
        stationId: station.$id,
        stationName: station.name || "",
        actorUserId: session.userId || "",
        actorName: cashierName || "POS Counter",
      },
      {
        collectionReady: enhancedWriteSupport.inventoryMovements,
      },
    );
    await Promise.all([
      upsertStationDailySummary(databases, {
        saleDate,
        stationId: station.$id,
        stationName: station.name || "",
        items: resolvedItems,
      }),
      upsertCashierDailySummary(databases, {
        saleDate,
        stationId: station.$id,
        stationName: station.name || "",
        cashierUserId: session.userId || "",
        cashierName,
        items: resolvedItems,
      }),
      ...(enhancedWriteSupport.stationCategoryDailySummary
        ? [
            upsertStationCategoryDailySummary(databases, {
              saleDate,
              stationId: station.$id,
              stationName: station.name || "",
              items: resolvedItems,
            }),
          ]
        : []),
      ...(enhancedWriteSupport.stationProductDailySummary
        ? [
            upsertStationProductDailySummariesForSale(databases, {
              saleDate,
              stationId: station.$id,
              stationName: station.name || "",
              items: resolvedItems,
            }),
          ]
        : []),
    ]);
    await createAuditLogRecord(
      databases,
      {
        actorUserId: session.userId || "",
        actorName: cashierName || "POS Counter",
        action: "pos_sale_completed",
        entityType: "sales_receipt",
        entityId: receiptId,
        stationId: station.$id,
        stationName: station.name || "",
        newValue: JSON.stringify({
          receiptNumber,
          paymentMethod,
          paymentStatus,
          totalAmount,
          items: resolvedItems.length,
        }),
      },
      {
        collectionReady: enhancedWriteSupport.auditLogs,
      },
    );
    await updatePosTransactionEnvelopeRecord(
      databases,
      transactionEnvelopeId,
      {
        status: "applied",
        error_message: "",
      },
      {
        collectionReady: enhancedWriteSupport.posTransactionEnvelopes,
      },
    );

    invalidateAppwriteCollectionCache([
      COLLECTIONS.salesReceipts,
      COLLECTIONS.salesReceiptItems,
      COLLECTIONS.salesPayments,
      COLLECTIONS.stationDailySummary,
      COLLECTIONS.cashierDailySummary,
      COLLECTIONS.stationCategoryDailySummary,
      COLLECTIONS.stationProductDailySummary,
      COLLECTIONS.inventoryItems,
      COLLECTIONS.inventoryMovements,
      COLLECTIONS.customerBalances,
      COLLECTIONS.customerBalanceMovements,
      COLLECTIONS.couponCompanies,
      COLLECTIONS.couponPurchases,
      COLLECTIONS.coupons,
      COLLECTIONS.couponMovements,
      COLLECTIONS.fuelGiftCodes,
      COLLECTIONS.fuelGiftPurchases,
      COLLECTIONS.auditLogs,
      COLLECTIONS.posTransactionEnvelopes,
      COLLECTIONS.products,
      COLLECTIONS.stations,
    ]);
    revalidateTag("sales-documents");
    revalidateTag("sales-data");
    revalidateTag("dashboard-data");
    revalidateTag("inventory-data");
    revalidatePath("/dashboard");
    revalidatePath("/stations");
    revalidatePath("/commodities-sales");
    revalidatePath("/cement");
    revalidatePath("/fuel-sales");
    revalidatePath("/inventory");
    revalidatePath("/incoming-stock");
    revalidatePath("/bulk-fuel-purchases");
    revalidatePath("/bulk-fuel-purchase-settings");
    revalidatePath("/pos");

    return {
      success: true,
      message: `Sale saved as ${receiptNumber}.`,
      receiptNumber,
      earnedCashBack: Number(rewardOutcome?.earnedCashBack || 0),
    };
  } catch (error) {
    await updatePosTransactionEnvelopeRecord(
      transactionEnvelopeDatabases,
      transactionEnvelopeId,
      {
        status: "repair_needed",
        error_message: `${error?.message || "POS sale failed."}`.slice(0, 1000),
      },
      {
        collectionReady: transactionEnvelopeCollectionReady,
      },
    );

    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "POS",
        genericLabel: "save this sale",
        fallbackMessage: "Failed to save sale.",
      }),
    };
  }
}

export async function reversePosSaleAction(payload, options = {}) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  const receiptId = `${payload?.receiptId || ""}`.trim();
  const reversalNote = `${payload?.reversalNote || ""}`.trim();
  const session = options.sessionOverride || (await getCurrentSession());
  const reversedAt = normalizeSaleDateInput(payload?.reversedAt) || new Date().toISOString();
  const todayDate = new Date().toISOString().slice(0, 10);
  let transactionEnvelopeDatabases = null;
  let transactionEnvelopeId = "";
  let transactionEnvelopeCollectionReady = false;

  if (!session) {
    return {
      success: false,
      message: "Your session has expired. Sign in again.",
    };
  }

  if (!session.modules?.includes("pos")) {
    return {
      success: false,
      message: "You do not have access to the POS module.",
    };
  }

  if (!isCashierPosRole(session.roleName)) {
    return {
      success: false,
      message: "Only cashiers can reverse POS transactions.",
    };
  }

  if (!receiptId) {
    return {
      success: false,
      message: "A transaction receipt is required before it can be reversed.",
    };
  }

  try {
    const databases = createServerDatabases();
    transactionEnvelopeDatabases = databases;
    const enhancedWriteSupport = await getEnhancedWriteSupport(databases);
    transactionEnvelopeCollectionReady =
      Boolean(enhancedWriteSupport.posTransactionEnvelopes);
    const receipt = await getDocumentOrNull(
      databases,
      COLLECTIONS.salesReceipts,
      receiptId,
    );

    if (!receipt) {
      return {
        success: false,
        message: "The selected transaction could not be found.",
      };
    }

    if (`${receipt.source || ""}` !== "pos") {
      return {
        success: false,
        message: "Only POS transactions can be reversed from this screen.",
      };
    }

    if (`${receipt.status || ""}` === "voided") {
      return {
        success: true,
        message: "Transaction already reversed.",
        receiptNumber: receipt.receipt_number || "",
      };
    }

    if (`${receipt.status || ""}` !== "completed") {
      return {
        success: false,
        message: "Only completed POS transactions can be reversed.",
      };
    }

    if (`${receipt.sale_date || ""}`.slice(0, 10) !== todayDate) {
      return {
        success: false,
        message: "Only today's POS transactions can be reversed.",
      };
    }

    if (`${receipt.cashier_name || ""}`.trim() !== `${session.fullName || ""}`.trim()) {
      return {
        success: false,
        message: "You can only reverse your own transactions.",
      };
    }

    if (
      session.branchId &&
      `${receipt.station_id || ""}`.trim() !== `${session.branchId || ""}`.trim()
    ) {
      return {
        success: false,
        message: "You can only reverse transactions from your assigned station.",
      };
    }

    const receiptItems = await listReceiptItemsByReceiptId(databases, receiptId);

    if (receiptItems.length === 0) {
      return {
        success: false,
        message: "This transaction has no sale lines to reverse.",
      };
    }

    const resolvedItems = receiptItems.map((item) => ({
      productId: item.product_id || "",
      productName: item.product_name || "",
      category: normalizeCategory(item.category, item.product_name || ""),
      quantity: Number(item.quantity || 0),
      unit: item.unit || "",
      unitPrice: Number(item.unit_price || 0),
      lineTotal: Number(item.line_total || 0),
    }));

    const inventoryItems = await Promise.all(
      resolvedItems.map((item) =>
        fetchInventoryItem(databases, receipt.station_id || "", item.productId),
      ),
    );

    if (inventoryItems.some((item) => !item)) {
      return {
        success: false,
        message:
          "One or more branch inventory records are missing. Restore inventory setup before reversing this transaction.",
      };
    }

    const inventoryAdjustments = resolvedItems.map((item, index) => {
      const inventoryItem = inventoryItems[index];
      const currentQuantity = Number(inventoryItem.quantity || 0);
      const nextQuantity = currentQuantity + Number(item.quantity || 0);
      const reorderLevel = Number(inventoryItem.reorder_level || 0);

      return {
        documentId: inventoryItem.$id,
        previousQuantity: currentQuantity,
        nextQuantity,
        nextStatus: getInventoryStatus(nextQuantity, reorderLevel),
      };
    });

    const rewardReversalCandidate = await getClientRewardEarnReversalCandidate({
      receiptId: receipt.$id,
      receiptNumber: receipt.receipt_number || "",
    });

    if (rewardReversalCandidate.status === "ready") {
      if (!rewardReversalCandidate.rewardAccount) {
        return {
          success: false,
          message:
            "This sale earned cash back, but the linked reward account could not be found. Contact an administrator before reversing it.",
        };
      }

      if (
        Number(rewardReversalCandidate.rewardAccount.balanceAmount || 0) + 0.009 <
        Number(rewardReversalCandidate.amount || 0)
      ) {
        return {
          success: false,
          message:
            "This sale already granted cash back that has since been used. Restore the client's reward balance before reversing the sale.",
        };
      }
    }

    const transactionEnvelope = await createPosTransactionEnvelopeRecord(
      databases,
      {
        transactionType: "sale_reverse",
        status: "applying",
        idempotencyKey: `${receipt.$id || receiptId}-reverse`,
        receiptId: receipt.$id,
        receiptNumber: receipt.receipt_number || "",
        stationId: receipt.station_id || "",
        stationName: receipt.station_name || "",
        cashierName: session.fullName || "POS Counter",
        totalAmount: Number(receipt.total_amount || 0),
        payloadSummary: JSON.stringify({
          originalStatus: receipt.status || "",
          itemCount: resolvedItems.length,
          reversedAt,
        }),
      },
      {
        collectionReady: enhancedWriteSupport.posTransactionEnvelopes,
      },
    );
    transactionEnvelopeId = transactionEnvelope?.$id || "";

    await reverseReceiptPaymentEffects(databases, receipt, {
      resolvedItems,
      reversedAt,
      actorUserId: session.userId || "",
      actorName: session.fullName || "POS Counter",
    });

    await reverseClientRewardEarnForReceipt({
      receiptId: receipt.$id,
      receiptNumber: receipt.receipt_number || "",
      actorUserId: session.userId || "",
      actorName: session.fullName || "POS Counter",
      notes: "Cash back reversed from POS transaction reversal.",
    });

    await Promise.all(
      inventoryAdjustments.map((adjustment) =>
        databases.updateDocument(
          getServerAppwriteConfig().databaseId,
          COLLECTIONS.inventoryItems,
          adjustment.documentId,
          {
            quantity: adjustment.nextQuantity,
            status: adjustment.nextStatus,
            last_updated_at: reversedAt,
          },
        ),
      ),
    );

    await recordInventoryReversalMovements(
      databases,
      resolvedItems,
      inventoryAdjustments,
      {
        receiptId,
        receiptNumber: receipt.receipt_number || "",
        stationId: receipt.station_id || "",
        stationName: receipt.station_name || "",
        reversedAt,
        actorUserId: session.userId || "",
        actorName: session.fullName || "POS Counter",
      },
      {
        collectionReady: enhancedWriteSupport.inventoryMovements,
      },
    );

    const updatedReceiptNotes = appendReversalReceiptNotes(receipt.notes, {
      reversedAt,
      reversedBy: session.fullName || "POS Counter",
      reversalNote,
    });

    await databases.updateDocument(
      getServerAppwriteConfig().databaseId,
      COLLECTIONS.salesReceipts,
      receipt.$id,
      {
        status: "voided",
        payment_status: "voided",
        notes: updatedReceiptNotes,
      },
    );

    if (enhancedWriteSupport.salesPayments) {
      await voidSalesPaymentRecordsForReceipt(databases, receipt.$id, {
        reversedAt,
        reversedBy: session.fullName || "POS Counter",
      });
    }

    await Promise.all([
      upsertStationDailySummary(databases, {
        saleDate: `${receipt.sale_date || ""}`,
        stationId: receipt.station_id || "",
        stationName: receipt.station_name || "",
        items: resolvedItems,
        multiplier: -1,
      }),
      upsertCashierDailySummary(databases, {
        saleDate: `${receipt.sale_date || ""}`,
        stationId: receipt.station_id || "",
        stationName: receipt.station_name || "",
        cashierUserId: session.userId || "",
        cashierName: receipt.cashier_name || "",
        items: resolvedItems,
        multiplier: -1,
      }),
      ...(enhancedWriteSupport.stationCategoryDailySummary
        ? [
            upsertStationCategoryDailySummary(databases, {
              saleDate: `${receipt.sale_date || ""}`,
              stationId: receipt.station_id || "",
              stationName: receipt.station_name || "",
              items: resolvedItems,
              multiplier: -1,
            }),
          ]
        : []),
      ...(enhancedWriteSupport.stationProductDailySummary
        ? [
            upsertStationProductDailySummariesForSale(databases, {
              saleDate: `${receipt.sale_date || ""}`,
              stationId: receipt.station_id || "",
              stationName: receipt.station_name || "",
              items: resolvedItems,
              multiplier: -1,
            }),
          ]
        : []),
    ]);

    await createAuditLogRecord(
      databases,
      {
        actorUserId: session.userId || "",
        actorName: session.fullName || "POS Counter",
        action: "pos_sale_reversed",
        entityType: "sales_receipt",
        entityId: receipt.$id,
        stationId: receipt.station_id || "",
        stationName: receipt.station_name || "",
        oldValue: JSON.stringify({
          status: receipt.status || "",
          paymentStatus: receipt.payment_status || "",
        }),
        newValue: JSON.stringify({
          status: "voided",
          paymentStatus: "voided",
          reversedAt,
          reversedBy: session.fullName || "POS Counter",
        }),
      },
      {
        collectionReady: enhancedWriteSupport.auditLogs,
      },
    );
    await updatePosTransactionEnvelopeRecord(
      databases,
      transactionEnvelopeId,
      {
        status: "applied",
        error_message: "",
      },
      {
        collectionReady: enhancedWriteSupport.posTransactionEnvelopes,
      },
    );

    invalidateAppwriteCollectionCache([
      COLLECTIONS.salesReceipts,
      COLLECTIONS.salesReceiptItems,
      COLLECTIONS.salesPayments,
      COLLECTIONS.stationDailySummary,
      COLLECTIONS.cashierDailySummary,
      COLLECTIONS.stationCategoryDailySummary,
      COLLECTIONS.stationProductDailySummary,
      COLLECTIONS.inventoryItems,
      COLLECTIONS.inventoryMovements,
      COLLECTIONS.customerBalances,
      COLLECTIONS.customerBalanceMovements,
      COLLECTIONS.couponPurchases,
      COLLECTIONS.coupons,
      COLLECTIONS.couponMovements,
      COLLECTIONS.fuelGiftCodes,
      COLLECTIONS.fuelGiftPurchases,
      COLLECTIONS.rewardAccounts,
      COLLECTIONS.rewardMovements,
      COLLECTIONS.auditLogs,
      COLLECTIONS.posTransactionEnvelopes,
    ]);
    revalidateTag("sales-documents");
    revalidateTag("sales-data");
    revalidateTag("dashboard-data");
    revalidateTag("inventory-data");
    revalidatePath("/dashboard");
    revalidatePath("/stations");
    revalidatePath("/commodities-sales");
    revalidatePath("/cement");
    revalidatePath("/fuel-sales");
    revalidatePath("/inventory");
    revalidatePath("/balance-management");
    revalidatePath("/bulk-fuel-purchases");
    revalidatePath("/coupons");
    revalidatePath("/pos");
    revalidatePath("/rewards-management");
    revalidatePath("/reverse-transactions");

    return {
      success: true,
      message: "Transaction reversed successfully.",
      receiptNumber: receipt.receipt_number || "",
    };
  } catch (error) {
    await updatePosTransactionEnvelopeRecord(
      transactionEnvelopeDatabases,
      transactionEnvelopeId,
      {
        status: "repair_needed",
        error_message: `${error?.message || "POS reversal failed."}`.slice(0, 1000),
      },
      {
        collectionReady: transactionEnvelopeCollectionReady,
      },
    );

    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "POS",
        genericLabel: "reverse this transaction",
        fallbackMessage: "Failed to reverse transaction.",
      }),
    };
  }
}

function createServerDatabases() {
  const config = getServerAppwriteConfig();
  const client = new Client()
    .setEndpoint(config.apiBaseUrl)
    .setProject(config.projectId);
  client.headers["X-Appwrite-Key"] = config.apiKey;
  return new Databases(client);
}

async function getEnhancedWriteSupport(databases) {
  const collectionEntries = [
    ["salesPayments", COLLECTIONS.salesPayments],
    ["inventoryMovements", COLLECTIONS.inventoryMovements],
    ["stationCategoryDailySummary", COLLECTIONS.stationCategoryDailySummary],
    ["stationProductDailySummary", COLLECTIONS.stationProductDailySummary],
    ["customerBalances", COLLECTIONS.customerBalances],
    ["customerBalanceMovements", COLLECTIONS.customerBalanceMovements],
    ["couponCompanies", COLLECTIONS.couponCompanies],
    ["couponPurchases", COLLECTIONS.couponPurchases],
    ["coupons", COLLECTIONS.coupons],
    ["couponMovements", COLLECTIONS.couponMovements],
    ["fuelGiftCodes", COLLECTIONS.fuelGiftCodes],
    ["fuelGiftPurchases", COLLECTIONS.fuelGiftPurchases],
    ["rewardAccounts", COLLECTIONS.rewardAccounts],
    ["rewardMovements", COLLECTIONS.rewardMovements],
    ["posTransactionEnvelopes", COLLECTIONS.posTransactionEnvelopes],
    ["auditLogs", COLLECTIONS.auditLogs],
  ];
  const results = await Promise.all(
    collectionEntries.map(async ([key, collectionId]) => [
      key,
      await isCollectionReady(databases, collectionId),
    ]),
  );

  return Object.fromEntries(results);
}

async function isCollectionReady(databases, collectionId) {
  try {
    await databases.listDocuments(
      getServerAppwriteConfig().databaseId,
      collectionId,
      [Query.limit(1), Query.select(["$id"])],
    );
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

function getPaymentFlow(paymentMethodCode) {
  const normalizedCode = `${paymentMethodCode || ""}`.trim().toLowerCase();

  if (normalizedCode === "coupon") {
    return "coupon";
  }

  if (normalizedCode === "credit") {
    return "credit";
  }

  if (normalizedCode === "bulk-redeem") {
    return "bulk-redeem";
  }

  if (normalizedCode === "fuel-gift") {
    return "fuel-gift";
  }

  return "standard";
}

function isCashierPosRole(roleName) {
  return isGeneralSales(roleName) || isFuelSales(roleName);
}

function isAdvancedPaymentFlow(paymentFlow) {
  return ["coupon", "credit", "bulk-redeem", "fuel-gift"].includes(paymentFlow);
}

async function resolveRewardClientForRedeemedSale(paymentFlow, balanceOperation) {
  if (!balanceOperation) {
    return null;
  }

  if (paymentFlow === "fuel-gift") {
    if (`${balanceOperation.clientUserId || ""}`.trim()) {
      return {
        clientUserId: `${balanceOperation.clientUserId || ""}`.trim(),
        clientName: `${balanceOperation.clientName || ""}`.trim(),
        clientPhone: `${balanceOperation.clientPhone || ""}`.trim(),
      };
    }

    const clientPhone = `${balanceOperation.clientPhone || ""}`.trim();

    if (!clientPhone) {
      return null;
    }

    const clientUser = await findClientUserByPhone(clientPhone);

    if (!clientUser || `${clientUser.status || ""}`.trim().toLowerCase() !== "active") {
      return null;
    }

    return {
      clientUserId: clientUser.id,
      clientName: clientUser.fullName,
      clientPhone: clientUser.phone,
    };
  }

  if (paymentFlow === "bulk-redeem") {
    const clientPhone = `${balanceOperation.customerPhone || ""}`.trim();

    if (!clientPhone) {
      return null;
    }

    const clientUser = await findClientUserByPhone(clientPhone);

    if (!clientUser || `${clientUser.status || ""}`.trim().toLowerCase() !== "active") {
      return null;
    }

    return {
      clientUserId: clientUser.id,
      clientName: clientUser.fullName,
      clientPhone: clientUser.phone,
    };
  }

  return null;
}

async function applyCashBackForRedeemedSale({
  paymentFlow,
  balanceOperation,
  totalAmount,
  receiptId,
  receiptNumber,
  stationId,
  stationName,
  actorUserId = "",
  actorName = "",
}) {
  if (!["bulk-redeem", "fuel-gift"].includes(paymentFlow)) {
    return {
      earnedCashBack: 0,
      rewardAccount: null,
    };
  }

  const rewardClient = await resolveRewardClientForRedeemedSale(
    paymentFlow,
    balanceOperation,
  );

  if (!rewardClient?.clientUserId) {
    return {
      earnedCashBack: 0,
      rewardAccount: null,
    };
  }

  const rewardSettings = await getRewardSettings();

  return creditClientRewardForSale({
    clientUserId: rewardClient.clientUserId,
    clientName: rewardClient.clientName,
    clientPhone: rewardClient.clientPhone,
    amount: totalAmount,
    cashBackPercent: Number(rewardSettings.cashBackPercent || 0),
    receiptId,
    receiptNumber,
    stationId,
    stationName,
    actorUserId,
    actorName,
    notes:
      paymentFlow === "fuel-gift"
        ? "Earned from redeemed fuel gift sale."
        : "Earned from redeemed bulk fuel sale.",
  });
}

function ensureAdvancedPaymentSupport(enhancedWriteSupport, paymentFlow) {
  const requiredFlags =
    paymentFlow === "coupon"
      ? ["salesPayments", "couponCompanies", "couponPurchases", "coupons", "couponMovements"]
      : paymentFlow === "fuel-gift"
        ? [
            "salesPayments",
            "fuelGiftCodes",
            "customerBalances",
            "customerBalanceMovements",
            "rewardAccounts",
            "rewardMovements",
          ]
      : ["salesPayments", "customerBalances", "customerBalanceMovements"];
  const missingCapabilities = requiredFlags.filter(
    (key) => !enhancedWriteSupport?.[key],
  );

  if (missingCapabilities.length === 0) {
    return;
  }

  const paymentLabel =
    paymentFlow === "bulk-redeem"
      ? "bulk redemption"
      : paymentFlow === "fuel-gift"
        ? "fuel gift"
      : paymentFlow;

  throw new Error(
    `The latest Appwrite schema update is required before ${paymentLabel} sales can be recorded.`,
  );
}

async function prepareCustomerBalanceOperation(
  databases,
  {
    paymentFlow,
    station,
    customerName,
    customerPhone,
    customerEmail,
    companyOrOrganizationName,
    couponCode,
    bulkReferenceCode,
    fuelGiftCode,
    creditDueDate,
    saleDate,
    totalAmount,
    items,
  },
) {
  if (!isAdvancedPaymentFlow(paymentFlow)) {
    return null;
  }

  if (paymentFlow === "coupon") {
    return prepareCouponBalanceOperation(databases, {
      companyOrOrganizationName,
      couponCode,
      saleDate,
      totalAmount,
    });
  }

  if (paymentFlow === "fuel-gift") {
    return prepareFuelGiftRedemptionOperation(databases, {
      fuelGiftCode,
      saleDate,
      totalAmount,
      items,
    });
  }

  const accountType = toBalanceAccountType(paymentFlow);
  const normalizedAmount = Number(totalAmount || 0);
  const normalizedCustomerName = `${customerName || ""}`.trim() || "Walk-in Customer";
  const normalizedCustomerPhone = `${customerPhone || ""}`.trim();
  const normalizedCustomerEmail = `${customerEmail || ""}`.trim().toLowerCase();
  const referenceCode =
    paymentFlow === "bulk-redeem"
        ? `${bulkReferenceCode || ""}`.trim()
        : "";
  const productCategory = deriveBalanceProductCategory(items);
  const productBinding = deriveSingleProductBinding(items);

  if (paymentFlow === "credit") {
    const existingAccount = await findCustomerBalanceAccount(databases, {
      accountType,
      customerPhone: normalizedCustomerPhone,
      stationId: station.$id,
    });
    const previousBalance = Number(existingAccount?.balance_amount || 0);

    return {
      strict: true,
      accountType,
      mode: existingAccount ? "update" : "create",
      accountDocument: existingAccount,
      customerName: normalizedCustomerName,
      customerPhone: normalizedCustomerPhone,
      customerEmail: normalizedCustomerEmail || existingAccount?.customer_email || "",
      stationId: station.$id,
      stationName: station.name || "",
      productId: existingAccount?.product_id || productBinding.productId || "",
      productName:
        existingAccount?.product_name ||
        productBinding.productName ||
        (productBinding.hasMixedProducts ? "Multiple products" : ""),
      referenceCode:
        existingAccount?.reference_code ||
        buildCustomerBalanceReference({
          accountType,
          stationCode: station.code || station.name || "",
          customerPhone: normalizedCustomerPhone,
        }),
      productCategory,
      amountDelta: normalizedAmount,
      direction: "credit",
      previousBalance,
      nextBalance: Number((previousBalance + normalizedAmount).toFixed(2)),
      saleDate,
      dueDate: creditDueDate || existingAccount?.due_date || "",
      notes: buildCustomerBalanceAccountNotes({
        paymentFlow,
        creditDueDate,
      }),
    };
  }

  const existingAccount = await findCustomerBalanceAccount(databases, {
    accountType,
    referenceCode,
  });

  if (!existingAccount) {
    throw new Error("Bulk redemption balance could not be found.");
  }

  if (`${existingAccount.status || ""}` !== "active") {
    throw new Error("Bulk redemption balance is not active.");
  }

  const previousBalance = Number(existingAccount.balance_amount || 0);

  if (previousBalance < normalizedAmount) {
    throw new Error("Bulk redemption balance is not enough for this sale.");
  }

  if (paymentFlow === "bulk-redeem") {
    ensureBulkBalanceMatchesSaleItems(existingAccount, productBinding);
  }

  return {
    strict: true,
    accountType,
    mode: "update",
    accountDocument: existingAccount,
    customerName: existingAccount.customer_name || normalizedCustomerName,
    customerPhone:
      existingAccount.customer_phone || normalizedCustomerPhone,
    customerEmail:
      existingAccount.customer_email || normalizedCustomerEmail,
    stationId:
      existingAccount.station_id || station.$id,
    stationName:
      existingAccount.station_name || station.name || "",
    productId:
      existingAccount.product_id || productBinding.productId || "",
    productName:
      existingAccount.product_name || productBinding.productName || "",
    referenceCode,
    productCategory:
      existingAccount.product_category || productCategory,
    amountDelta: Number((-normalizedAmount).toFixed(2)),
    direction: "debit",
    previousBalance,
    nextBalance: Number((previousBalance - normalizedAmount).toFixed(2)),
    saleDate,
    notes: buildCustomerBalanceAccountNotes({
      paymentFlow,
      creditDueDate,
    }),
  };
}

async function findCustomerBalanceAccount(
  databases,
  {
    accountType,
    referenceCode = "",
    customerPhone = "",
    stationId = "",
  },
) {
  const queries = [Query.equal("account_type", accountType), Query.limit(1)];
  const normalizedReferenceCode = `${referenceCode || ""}`.trim();
  const normalizedCustomerPhone = `${customerPhone || ""}`.trim();
  const normalizedStationId = `${stationId || ""}`.trim();

  if (normalizedReferenceCode) {
    queries.push(Query.equal("reference_code", normalizedReferenceCode));
  } else if (normalizedCustomerPhone) {
    queries.push(Query.equal("customer_phone", normalizedCustomerPhone));

    if (normalizedStationId) {
      queries.push(Query.equal("station_id", normalizedStationId));
    }
  } else {
    return null;
  }

  const response = await databases.listDocuments(
    getServerAppwriteConfig().databaseId,
    COLLECTIONS.customerBalances,
    queries,
  );

  return response.documents?.[0] || null;
}

async function findFuelGiftCodeByCode(databases, fuelGiftCode) {
  const normalizedFuelGiftCode = `${fuelGiftCode || ""}`.trim().toUpperCase();

  if (!normalizedFuelGiftCode) {
    return null;
  }

  const response = await databases.listDocuments(
    getServerAppwriteConfig().databaseId,
    COLLECTIONS.fuelGiftCodes,
    [Query.equal("code", normalizedFuelGiftCode), Query.limit(1)],
  );

  return response.documents?.[0] || null;
}

async function applyCustomerBalanceOperation(databases, operation, context) {
  if (!operation) {
    return null;
  }

  if (operation.kind === "coupon") {
    return applyCouponBalanceOperation(databases, operation, context);
  }

  if (operation.kind === "fuel-gift") {
    return applyFuelGiftRedemptionOperation(databases, operation, context);
  }

  const databaseId = getServerAppwriteConfig().databaseId;
  let accountDocument = operation.accountDocument || null;

  if (!accountDocument) {
    accountDocument = await createCustomerBalanceDocument(
      databases,
      databaseId,
      {
        account_type: operation.accountType,
        reference_code: operation.referenceCode,
        customer_name: operation.customerName,
        customer_phone: operation.customerPhone,
        customer_email: operation.customerEmail || "",
        station_id: operation.stationId,
        station_name: operation.stationName,
        product_id: operation.productId || "",
        product_name: operation.productName || "",
        product_category: operation.productCategory,
        balance_amount: operation.nextBalance,
        balance_quantity: 0,
        unit: "",
        due_date: operation.accountType === "credit" ? operation.dueDate || "" : "",
        status: "active",
        created_at: context.saleDate,
        updated_at: context.saleDate,
        notes: operation.notes,
      },
    );
  } else {
    accountDocument = await updateCustomerBalanceDocument(
      databases,
      databaseId,
      accountDocument.$id,
      {
        customer_name: operation.customerName,
        customer_phone: operation.customerPhone,
        customer_email: operation.customerEmail || accountDocument.customer_email || "",
        station_id: operation.stationId,
        station_name: operation.stationName,
        product_id: operation.productId || "",
        product_name: operation.productName || "",
        product_category: operation.productCategory,
        balance_amount: operation.nextBalance,
        due_date:
          operation.accountType === "credit"
            ? operation.dueDate || accountDocument.due_date || ""
            : accountDocument.due_date || "",
        updated_at: context.saleDate,
        notes: operation.notes,
      },
    );
  }

  await databases.createDocument(
    databaseId,
    COLLECTIONS.customerBalanceMovements,
    ID.unique(),
    {
      account_id: accountDocument.$id,
      account_type: operation.accountType,
      receipt_id: context.receiptId,
      receipt_number: context.receiptNumber,
      station_id: context.stationId,
      station_name: context.stationName,
      product_id: operation.productId || "",
      product_name: operation.productName || "",
      movement_date: context.saleDate,
      direction: operation.direction,
      amount_delta: operation.amountDelta,
      quantity_delta: 0,
      balance_amount: operation.nextBalance,
      balance_quantity: 0,
      due_date: operation.accountType === "credit" ? operation.dueDate || "" : "",
      actor_user_id: context.actorUserId,
      actor_name: context.actorName,
      reference_code: operation.referenceCode,
      notes: operation.notes,
    },
  );

  return accountDocument;
}

async function createCustomerBalanceDocument(databases, databaseId, payload) {
  try {
    return await databases.createDocument(
      databaseId,
      COLLECTIONS.customerBalances,
      ID.unique(),
      payload,
    );
  } catch (error) {
    if (!isUnsupportedCustomerEmailError(error)) {
      throw error;
    }

    const { customer_email: _ignoredCustomerEmail, ...legacyPayload } = payload;
    return databases.createDocument(
      databaseId,
      COLLECTIONS.customerBalances,
      ID.unique(),
      legacyPayload,
    );
  }
}

async function updateCustomerBalanceDocument(
  databases,
  databaseId,
  documentId,
  payload,
) {
  try {
    return await databases.updateDocument(
      databaseId,
      COLLECTIONS.customerBalances,
      documentId,
      payload,
    );
  } catch (error) {
    if (!isUnsupportedCustomerEmailError(error)) {
      throw error;
    }

    const { customer_email: _ignoredCustomerEmail, ...legacyPayload } = payload;
    return databases.updateDocument(
      databaseId,
      COLLECTIONS.customerBalances,
      documentId,
      legacyPayload,
    );
  }
}

function isUnsupportedCustomerEmailError(error) {
  return `${error?.message || ""}`.toLowerCase().includes("customer_email");
}

async function prepareCouponBalanceOperation(
  databases,
  {
    companyOrOrganizationName,
    couponCode,
    saleDate,
    totalAmount,
  },
) {
  const databaseId = getServerAppwriteConfig().databaseId;
  const normalizedCouponCode = `${couponCode || ""}`.trim().toUpperCase();
  const normalizedCompanyName = `${companyOrOrganizationName || ""}`.trim();
  const couponDocument = await findCouponByCode(
    databases,
    databaseId,
    normalizedCouponCode,
  );

  if (!couponDocument) {
    throw new Error("Coupon could not be found.");
  }

  if (!isCouponActiveStatus(couponDocument.status)) {
    throw new Error("Coupon is not active.");
  }

  if (
    normalizeCouponCompanyName(couponDocument.company_name) !==
    normalizeCouponCompanyName(normalizedCompanyName)
  ) {
    throw new Error(
      "Selected coupon does not belong to the entered company or organization.",
    );
  }

  const previousBalance = Number(couponDocument.remaining_value || 0);
  const normalizedAmount = Number(totalAmount || 0);

  if (previousBalance < normalizedAmount) {
    throw new Error("Coupon balance is not enough for this sale.");
  }

  const nextBalance = Number((previousBalance - normalizedAmount).toFixed(2));

  return {
    kind: "coupon",
    couponDocument,
    companyId: couponDocument.company_id || "",
    companyName: couponDocument.company_name || normalizedCompanyName,
    purchaseId: couponDocument.purchase_id || "",
    purchaseReference: couponDocument.purchase_reference || "",
    referenceCode: couponDocument.code || normalizedCouponCode,
    previousBalance,
    nextBalance,
    amountDelta: Number((-normalizedAmount).toFixed(2)),
    direction: "redeem",
    saleDate,
    status: buildCouponStatusFromRemainingValue(
      Number(couponDocument.face_value || 0),
      nextBalance,
    ),
  };
}

async function applyCouponBalanceOperation(databases, operation, context) {
  const databaseId = getServerAppwriteConfig().databaseId;
  const updatedCoupon = await databases.updateDocument(
    databaseId,
    COLLECTIONS.coupons,
    operation.couponDocument.$id,
    {
      remaining_value: operation.nextBalance,
      status: operation.status,
      last_used_at: context.saleDate,
      last_receipt_id: context.receiptId,
      last_receipt_number: context.receiptNumber,
    },
  );

  await databases.createDocument(
    databaseId,
    COLLECTIONS.couponMovements,
    ID.unique(),
    {
      coupon_id: updatedCoupon.$id,
      coupon_code: updatedCoupon.code || operation.referenceCode,
      company_id: operation.companyId,
      company_name: operation.companyName,
      purchase_id: operation.purchaseId,
      purchase_reference: operation.purchaseReference,
      receipt_id: context.receiptId,
      receipt_number: context.receiptNumber,
      station_id: context.stationId,
      station_name: context.stationName,
      movement_date: context.saleDate,
      direction: operation.direction,
      amount_delta: operation.amountDelta,
      balance_after: operation.nextBalance,
      actor_user_id: context.actorUserId,
      actor_name: context.actorName,
      notes: "Coupon redeemed through POS.",
    },
  );

  if (operation.purchaseId) {
    await refreshCouponPurchaseTotals(databases, databaseId, {
      $id: operation.purchaseId,
      status: operation.status,
    });
  }

  return updatedCoupon;
}

async function prepareFuelGiftRedemptionOperation(
  databases,
  {
    fuelGiftCode,
    totalAmount,
    items,
  },
) {
  const normalizedFuelGiftCode = `${fuelGiftCode || ""}`.trim().toUpperCase();

  if (!normalizedFuelGiftCode) {
    throw new Error("Fuel gift code is required.");
  }

  const giftDocument = await findFuelGiftCodeByCode(
    databases,
    normalizedFuelGiftCode,
  );

  if (!giftDocument) {
    throw new Error("Fuel gift code could not be found.");
  }

  if (`${giftDocument.status || ""}`.trim().toLowerCase() !== "active") {
    throw new Error("Fuel gift code is no longer active.");
  }

  ensureFuelGiftMatchesSale(giftDocument, items, totalAmount);

  const productBinding = deriveSingleProductBinding(items);
  const bulkAllocations = [];
  let remainingAmount = Number(totalAmount || 0);

  const bulkAccounts = await listFuelGiftBulkBalanceAccounts(databases, {
    customerPhone: giftDocument.client_phone || "",
    productId: productBinding.productId || "",
    productName: productBinding.productName || giftDocument.product_name || "",
  });

  for (const accountDocument of bulkAccounts) {
    if (remainingAmount <= 0) {
      break;
    }

    const previousBalance = Number(accountDocument.balance_amount || 0);

    if (previousBalance <= 0) {
      continue;
    }

    const amountToDebit = Number(
      Math.min(previousBalance, remainingAmount).toFixed(2),
    );

    if (amountToDebit <= 0) {
      continue;
    }

    bulkAllocations.push({
      accountDocument,
      referenceCode: accountDocument.reference_code || "",
      amount: amountToDebit,
      previousBalance,
      nextBalance: Number((previousBalance - amountToDebit).toFixed(2)),
    });
    remainingAmount = Number((remainingAmount - amountToDebit).toFixed(2));
  }

  let rewardAllocation = null;

  if (remainingAmount > 0) {
    let rewardClientUserId = `${giftDocument.client_user_id || ""}`.trim();
    let rewardClientName = `${giftDocument.client_name || ""}`.trim();
    let rewardClientPhone = `${giftDocument.client_phone || ""}`.trim();

    if (!rewardClientUserId && rewardClientPhone) {
      const clientUser = await findClientUserByPhone(rewardClientPhone);

      if (clientUser && `${clientUser.status || ""}`.trim().toLowerCase() === "active") {
        rewardClientUserId = clientUser.id;
        rewardClientName = clientUser.fullName || rewardClientName;
        rewardClientPhone = clientUser.phone || rewardClientPhone;
      }
    }

    if (rewardClientUserId) {
      const rewardAccount = await getClientRewardAccountByClientUserId(
        rewardClientUserId,
      );
      const previousBalance = Number(rewardAccount?.balanceAmount || 0);
      const amountToDebit = Number(
        Math.min(previousBalance, remainingAmount).toFixed(2),
      );

      if (amountToDebit > 0) {
        rewardAllocation = {
          clientUserId: rewardClientUserId,
          clientName: rewardClientName,
          clientPhone: rewardClientPhone,
          amount: amountToDebit,
          previousBalance,
          nextBalance: Number((previousBalance - amountToDebit).toFixed(2)),
        };
        remainingAmount = Number((remainingAmount - amountToDebit).toFixed(2));
      }
    }
  }

  if (remainingAmount > 0) {
    throw new Error(
      "Fuel gift funding balance is not enough for this sale. Top up bulk fuel or cash back before redeeming this code.",
    );
  }

  return {
    kind: "fuel-gift",
    giftDocument,
    referenceCode: giftDocument.code || normalizedFuelGiftCode,
    clientUserId: giftDocument.client_user_id || "",
    clientName: giftDocument.client_name || "",
    clientPhone: giftDocument.client_phone || "",
    productCode: giftDocument.product_code || "",
    productName: giftDocument.product_name || "",
    recipientName: giftDocument.recipient_name || "",
    bulkAllocations,
    rewardAllocation,
  };
}

async function listFuelGiftBulkBalanceAccounts(
  databases,
  {
    customerPhone,
    productId,
    productName,
  } = {},
) {
  const normalizedCustomerPhone = `${customerPhone || ""}`.trim();
  const normalizedProductId = `${productId || ""}`.trim();
  const normalizedProductName = normalizeProductIdentity(productName);

  if (!normalizedCustomerPhone || (!normalizedProductId && !normalizedProductName)) {
    return [];
  }

  const response = await databases.listDocuments(
    getServerAppwriteConfig().databaseId,
    COLLECTIONS.customerBalances,
    [
      Query.equal("account_type", "bulk_redeem"),
      Query.equal("customer_phone", normalizedCustomerPhone),
      Query.equal("status", "active"),
      Query.limit(100),
    ],
  );

  return (response.documents || [])
    .filter((document) => {
      const matchesProduct =
        (normalizedProductId &&
          `${document.product_id || ""}`.trim() === normalizedProductId) ||
        normalizeProductIdentity(document.product_name || "") === normalizedProductName;

      return matchesProduct && Number(document.balance_amount || 0) > 0;
    })
    .sort((left, right) =>
      `${left.created_at || ""}`.localeCompare(`${right.created_at || ""}`),
    );
}

async function applyFuelGiftRedemptionOperation(databases, operation, context) {
  const databaseId = getServerAppwriteConfig().databaseId;

  for (const bulkAllocation of operation.bulkAllocations || []) {
    const accountDocument = bulkAllocation.accountDocument;

    await databases.updateDocument(
      databaseId,
      COLLECTIONS.customerBalances,
      accountDocument.$id,
      {
        balance_amount: bulkAllocation.nextBalance,
        updated_at: context.saleDate,
      },
    );

    await databases.createDocument(
      databaseId,
      COLLECTIONS.customerBalanceMovements,
      ID.unique(),
      {
        account_id: accountDocument.$id,
        account_type: "bulk_redeem",
        receipt_id: context.receiptId,
        receipt_number: context.receiptNumber,
        station_id: context.stationId,
        station_name: context.stationName,
        product_id: accountDocument.product_id || "",
        product_name: accountDocument.product_name || "",
        movement_date: context.saleDate,
        direction: "debit",
        amount_delta: Number((-bulkAllocation.amount).toFixed(2)),
        quantity_delta: 0,
        balance_amount: bulkAllocation.nextBalance,
        balance_quantity: Number(accountDocument.balance_quantity || 0),
        actor_user_id: context.actorUserId,
        actor_name: context.actorName,
        reference_code: bulkAllocation.referenceCode || "",
        notes: "Bulk fuel balance deducted from redeemed fuel gift.",
      },
    );
  }

  if (operation.rewardAllocation?.amount > 0 && operation.rewardAllocation.clientUserId) {
    await applyClientRewardMovement({
      clientUserId: operation.rewardAllocation.clientUserId,
      clientName: operation.rewardAllocation.clientName,
      clientPhone: operation.rewardAllocation.clientPhone,
      direction: "debit",
      movementType: "redeem",
      amount: operation.rewardAllocation.amount,
      receiptId: context.receiptId,
      receiptNumber: context.receiptNumber,
      stationId: context.stationId,
      stationName: context.stationName,
      actorUserId: context.actorUserId,
      actorName: context.actorName,
      referenceCode: `${context.receiptNumber || context.receiptId || "sale"}-fuel-gift-funding-redeem`,
      notes: "Cash back redeemed through a fuel gift sale.",
    });
  }

  const updatedGiftDocument = await databases.updateDocument(
    databaseId,
    COLLECTIONS.fuelGiftCodes,
    operation.giftDocument.$id,
    {
      status: "redeemed",
      cashier_user_id: context.actorUserId,
      cashier_name: context.actorName,
      station_id: context.stationId,
      station_name: context.stationName,
      receipt_id: context.receiptId,
      receipt_number: context.receiptNumber,
      redeemed_at: context.saleDate,
      notes: appendLineNote(
        appendLineNote(
          operation.giftDocument.notes,
          "Redeemed through POS.",
        ),
        buildFuelGiftFundingAuditNote(operation),
      ),
    },
  );

  await syncFuelGiftPurchaseByGiftCodeId({
    giftCodeId: operation.giftDocument.$id,
    status: "redeemed",
    cashierUserId: context.actorUserId,
    cashierName: context.actorName,
    stationId: context.stationId,
    stationName: context.stationName,
    receiptId: context.receiptId,
    receiptNumber: context.receiptNumber,
    redeemedAt: context.saleDate,
    notes: "Redeemed through POS.",
  });

  return updatedGiftDocument;
}

async function createSalesPaymentRecord(
  databases,
  {
    receiptId,
    receiptNumber,
    saleDate,
    stationId,
    stationName,
    paymentMethodCode,
    paymentMethodLabel,
    amount,
    paymentStatus,
    referenceCode,
    customerName,
    customerPhone,
    notes,
  },
  { strict = false, collectionReady = true } = {},
) {
  if (!collectionReady) {
    if (strict) {
      throw new Error(
        "The latest Appwrite schema update is required before this payment flow can be recorded.",
      );
    }

    return;
  }

  await runOptionalEnhancedWrite(
    () =>
      databases.createDocument(
        getServerAppwriteConfig().databaseId,
        COLLECTIONS.salesPayments,
        ID.unique(),
        {
          receipt_id: receiptId,
          receipt_number: receiptNumber,
          sale_date: saleDate,
          station_id: stationId,
          station_name: stationName,
          payment_method_code: paymentMethodCode,
          payment_method_label: paymentMethodLabel,
          amount: Number(amount || 0),
          status: paymentStatus === "pending" ? "pending" : "confirmed",
          reference_code: referenceCode || "",
          customer_name: customerName || "",
          customer_phone: customerPhone || "",
          notes: notes || "",
        },
      ),
    { strict, label: "sales payment" },
  );
}

async function voidSalesPaymentRecordsForReceipt(
  databases,
  receiptId,
  {
    reversedAt = "",
    reversedBy = "",
  } = {},
) {
  const response = await databases.listDocuments(
    getServerAppwriteConfig().databaseId,
    COLLECTIONS.salesPayments,
    [Query.equal("receipt_id", receiptId), Query.limit(100)],
  );

  await Promise.all(
    (response.documents || []).map((document) =>
      databases.updateDocument(
        getServerAppwriteConfig().databaseId,
        COLLECTIONS.salesPayments,
        document.$id,
        {
          status: "voided",
          notes: appendLineNote(
            document.notes,
            `Voided on ${reversedAt || new Date().toISOString()} by ${reversedBy || "POS Counter"}.`,
          ),
        },
      ),
    ),
  );
}

async function recordInventoryMovements(
  databases,
  resolvedItems,
  inventoryItems,
  inventoryAdjustments,
  context,
  { collectionReady = true } = {},
) {
  if (!collectionReady) {
    return;
  }

  await runOptionalEnhancedWrite(
    () =>
      Promise.all(
        resolvedItems.map((item, index) => {
          const inventoryItem = inventoryItems[index];
          const adjustment = inventoryAdjustments[index];

          return databases.createDocument(
            getServerAppwriteConfig().databaseId,
            COLLECTIONS.inventoryMovements,
            ID.unique(),
            {
              receipt_id: context.receiptId,
              receipt_number: context.receiptNumber,
              station_id: context.stationId,
              station_name: context.stationName,
              product_id: item.productId,
              product_name: item.productName,
              category: item.category,
              movement_date: context.saleDate,
              movement_type: "sale",
              quantity_delta: Number((-Number(item.quantity || 0)).toFixed(6)),
              previous_quantity: Number(inventoryItem.quantity || 0),
              new_quantity: Number(adjustment.nextQuantity || 0),
              unit: item.unit,
              actor_user_id: context.actorUserId,
              actor_name: context.actorName,
              reference_no: context.receiptNumber,
              notes: "Inventory reduced from POS sale.",
            },
          );
        }),
      ),
    { strict: false, label: "inventory movements" },
  );
}

async function recordInventoryReversalMovements(
  databases,
  resolvedItems,
  inventoryAdjustments,
  context,
  { collectionReady = true } = {},
) {
  if (!collectionReady) {
    return;
  }

  await runOptionalEnhancedWrite(
    () =>
      Promise.all(
        resolvedItems.map((item, index) => {
          const adjustment = inventoryAdjustments[index];

          return databases.createDocument(
            getServerAppwriteConfig().databaseId,
            COLLECTIONS.inventoryMovements,
            ID.unique(),
            {
              receipt_id: context.receiptId,
              receipt_number: context.receiptNumber,
              station_id: context.stationId,
              station_name: context.stationName,
              product_id: item.productId,
              product_name: item.productName,
              category: item.category,
              movement_date: context.reversedAt,
              movement_type: "reversal",
              quantity_delta: Number(Number(item.quantity || 0).toFixed(6)),
              previous_quantity: Number(adjustment.previousQuantity || 0),
              new_quantity: Number(adjustment.nextQuantity || 0),
              unit: item.unit,
              actor_user_id: context.actorUserId,
              actor_name: context.actorName,
              reference_no: context.receiptNumber,
              notes: "Inventory restored from POS transaction reversal.",
            },
          );
        }),
      ),
    { strict: false, label: "inventory reversal movements" },
  );
}

async function createAuditLogRecord(
  databases,
  {
    actorUserId,
    actorName,
    action,
    entityType,
    entityId,
    stationId,
    stationName,
    oldValue = "",
    newValue = "",
  },
  { collectionReady = true } = {},
) {
  if (!collectionReady) {
    return;
  }

  await runOptionalEnhancedWrite(
    () =>
      databases.createDocument(
        getServerAppwriteConfig().databaseId,
        COLLECTIONS.auditLogs,
        ID.unique(),
        {
          actor_user_id: actorUserId || "",
          actor_name: actorName || "System",
          action,
          entity_type: entityType,
          entity_id: entityId,
          station_id: stationId || "",
          station_name: stationName || "",
          old_value: oldValue,
          new_value: newValue,
          created_at: new Date().toISOString(),
        },
      ),
    { strict: false, label: "audit log" },
  );
}

async function createPosTransactionEnvelopeRecord(
  databases,
  {
    transactionType,
    status,
    idempotencyKey,
    receiptId,
    receiptNumber,
    stationId,
    stationName,
    cashierName,
    totalAmount,
    payloadSummary,
    errorMessage = "",
  },
  { collectionReady = true } = {},
) {
  if (!collectionReady) {
    return null;
  }

  try {
    return await databases.createDocument(
      getServerAppwriteConfig().databaseId,
      COLLECTIONS.posTransactionEnvelopes,
      ID.unique(),
      {
        transaction_type: transactionType,
        status,
        idempotency_key: idempotencyKey || "",
        receipt_id: receiptId || "",
        receipt_number: receiptNumber || "",
        station_id: stationId || "",
        station_name: stationName || "",
        cashier_name: cashierName || "",
        total_amount: Number(totalAmount || 0),
        payload_summary: payloadSummary || "",
        error_message: errorMessage || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
  } catch (error) {
    if (!isNotFoundError(error)) {
      console.error("Failed to write POS transaction envelope:", error);
    }

    return null;
  }
}

async function updatePosTransactionEnvelopeRecord(
  databases,
  envelopeId,
  values,
  { collectionReady = true } = {},
) {
  if (!collectionReady || !envelopeId) {
    return;
  }

  try {
    await databases.updateDocument(
      getServerAppwriteConfig().databaseId,
      COLLECTIONS.posTransactionEnvelopes,
      envelopeId,
      {
        ...values,
        updated_at: new Date().toISOString(),
      },
    );
  } catch (error) {
    if (!isNotFoundError(error)) {
      console.error("Failed to update POS transaction envelope:", error);
    }
  }
}

async function runOptionalEnhancedWrite(worker, { strict = false, label = "record" } = {}) {
  try {
    await worker();
  } catch (error) {
    if (strict || !isNotFoundError(error)) {
      if (!strict) {
        console.error(`Failed to write ${label}:`, error);
        return;
      }

      throw error;
    }
  }
}

async function upsertStationDailySummary(
  databases,
  { saleDate, stationId, stationName, items, multiplier = 1 },
) {
  const date = `${saleDate || ""}`.slice(0, 10);
  const summaryDelta = buildSummaryDelta(items, multiplier);
  const documentId = buildSummaryDocumentId("sds", `${date}-${stationId}`);

  await upsertSummaryDocument(
    databases,
    COLLECTIONS.stationDailySummary,
    documentId,
    {
      date,
      station_id: stationId,
      station_name: stationName,
    },
    summaryDelta,
  );
}

async function upsertCashierDailySummary(
  databases,
  { saleDate, stationId, stationName, cashierUserId, cashierName, items, multiplier = 1 },
) {
  const date = `${saleDate || ""}`.slice(0, 10);
  const summaryDelta = buildSummaryDelta(items, multiplier);
  const documentId = buildSummaryDocumentId(
    "cds",
    `${date}-${stationId}-${cashierName}`,
  );

  await upsertSummaryDocument(
    databases,
    COLLECTIONS.cashierDailySummary,
    documentId,
    {
      date,
      station_id: stationId,
      station_name: stationName,
      cashier_user_id: cashierUserId || "",
      cashier_name: cashierName,
    },
    summaryDelta,
  );
}

async function upsertStationCategoryDailySummary(
  databases,
  { saleDate, stationId, stationName, items, multiplier = 1 },
) {
  const date = `${saleDate || ""}`.slice(0, 10);
  const normalizedItems = Array.isArray(items) ? items : [];
  const grouped = new Map();
  const factor = Number(multiplier || 0) < 0 ? -1 : 1;

  normalizedItems.forEach((item) => {
    const category = normalizeCategory(item.category, item.productName);

    if (!category) {
      return;
    }

    const current = grouped.get(category) || {
      total_quantity: 0,
      total_amount: 0,
      transactions: 0,
    };

    current.total_quantity += Number(item.quantity || 0) * factor;
    current.total_amount += Number(item.lineTotal || 0) * factor;
    current.transactions += 1 * factor;
    grouped.set(category, current);
  });

  await Promise.all(
    Array.from(grouped.entries()).map(([category, summaryDelta]) =>
      upsertSummaryDocument(
        databases,
        COLLECTIONS.stationCategoryDailySummary,
        buildSummaryDocumentId("scds", `${date}-${stationId}-${category}`),
        {
          date,
          station_id: stationId,
          station_name: stationName,
          category,
        },
        summaryDelta,
      ),
    ),
  );
}

async function upsertSummaryDocument(
  databases,
  collectionId,
  documentId,
  seedData,
  summaryDelta,
) {
  return withSummaryWriteLock(`${collectionId}:${documentId}`, async () => {
    const databaseId = getServerAppwriteConfig().databaseId;
    let currentDocument = await findSummaryDocument(
      databases,
      collectionId,
      documentId,
      seedData,
    );

    if (!currentDocument) {
      try {
        await databases.createDocument(databaseId, collectionId, documentId, {
          ...seedData,
          ...summaryDelta,
        });
        return;
      } catch (error) {
        if (!isAlreadyExistsError(error)) {
          throw error;
        }

        currentDocument = await waitForSummaryDocument(
          databases,
          collectionId,
          documentId,
          seedData,
        );

        if (!currentDocument) {
          throw error;
        }
      }
    }

    const payload = { ...seedData };

    Object.entries(summaryDelta).forEach(([field, value]) => {
      payload[field] = Number(currentDocument[field] || 0) + Number(value || 0);
    });

    await databases.updateDocument(
      databaseId,
      collectionId,
      currentDocument.$id || documentId,
      payload,
    );
  });
}

async function getDocumentOrNull(databases, collectionId, documentId) {
  try {
    return await databases.getDocument(
      getServerAppwriteConfig().databaseId,
      collectionId,
      documentId,
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function findSummaryDocument(
  databases,
  collectionId,
  documentId,
  seedData,
) {
  const directDocument = await getDocumentOrNull(
    databases,
    collectionId,
    documentId,
  );

  if (directDocument) {
    return directDocument;
  }

  const queries = buildSummaryLookupQueries(collectionId, seedData);

  if (queries.length === 0) {
    return null;
  }

  const response = await databases.listDocuments(
    getServerAppwriteConfig().databaseId,
    collectionId,
    [...queries, Query.limit(1)],
  );

  return response.documents?.[0] || null;
}

async function waitForSummaryDocument(
  databases,
  collectionId,
  documentId,
  seedData,
) {
  for (
    let attempt = 1;
    attempt <= SUMMARY_READ_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    const document = await findSummaryDocument(
      databases,
      collectionId,
      documentId,
      seedData,
    );

    if (document) {
      return document;
    }

    if (attempt < SUMMARY_READ_RETRY_ATTEMPTS) {
      await sleep(SUMMARY_READ_RETRY_DELAY_MS * attempt);
    }
  }

  return null;
}

function buildSummaryLookupQueries(collectionId, seedData) {
  const date = `${seedData?.date || ""}`.trim();
  const stationId = `${seedData?.station_id || ""}`.trim();

  if (!date || !stationId) {
    return [];
  }

  const queries = [
    Query.equal("date", date),
    Query.equal("station_id", stationId),
  ];

  if (collectionId === COLLECTIONS.cashierDailySummary) {
    const cashierName = `${seedData?.cashier_name || ""}`.trim();

    if (!cashierName) {
      return [];
    }

    queries.push(Query.equal("cashier_name", cashierName));
  }

  if (collectionId === COLLECTIONS.stationCategoryDailySummary) {
    const category = `${seedData?.category || ""}`.trim().toLowerCase();

    if (!category) {
      return [];
    }

    queries.push(Query.equal("category", category));
  }

  return queries;
}

function withSummaryWriteLock(lockKey, worker) {
  const previous = summaryWriteLocks.get(lockKey) || Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(worker)
    .finally(() => {
      if (summaryWriteLocks.get(lockKey) === current) {
        summaryWriteLocks.delete(lockKey);
      }
    });

  summaryWriteLocks.set(lockKey, current);

  return current;
}

function isNotFoundError(error) {
  return (
    Number(error?.code) === 404 ||
    `${error?.type || ""}`.toLowerCase().includes("not_found") ||
    `${error?.message || ""}`.toLowerCase().includes("not found")
  );
}

function isAlreadyExistsError(error) {
  return (
    Number(error?.code) === 409 ||
    `${error?.type || ""}`.toLowerCase().includes("already_exists") ||
    `${error?.message || ""}`.toLowerCase().includes("already exists")
  );
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function buildSummaryDelta(items, multiplier = 1) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const factor = Number(multiplier || 0) < 0 ? -1 : 1;
  const summary = normalizedItems.reduce(
    (summary, item) => {
      const amount = Number(item.lineTotal || 0) * factor;
      const category = normalizeCategory(item.category, item.productName);
      const normalizedName = `${item.productName || ""}`.trim().toLowerCase();

      summary.total_sales += amount;

      if (category === "fuel") {
        summary.fuel_sales += amount;

        if (normalizedName.includes("petrol")) {
          summary.petrol_sales += amount;
        } else if (normalizedName.includes("diesel")) {
          summary.diesel_sales += amount;
        }

        return summary;
      }

      if (category === "cement") {
        summary.cement_sales += amount;
        summary.cement_bags_sold += Number(item.quantity || 0) * factor;
        return summary;
      }

      summary.shop_sales += amount;

      if (normalizedName.includes("rice")) {
        summary.rice_sales += amount;
      } else if (normalizedName.includes("cooking oil")) {
        summary.cooking_oil_sales += amount;
      } else {
        summary.other_shop_sales += amount;
      }

      return summary;
    },
    {
      fuel_sales: 0,
      petrol_sales: 0,
      diesel_sales: 0,
      shop_sales: 0,
      rice_sales: 0,
      cooking_oil_sales: 0,
      other_shop_sales: 0,
      cement_sales: 0,
      cement_bags_sold: 0,
      total_sales: 0,
      transactions: 0,
    },
  );

  summary.transactions = normalizedItems.length > 0 ? factor : 0;

  return summary;
}

async function listReceiptItemsByReceiptId(databases, receiptId) {
  const response = await databases.listDocuments(
    getServerAppwriteConfig().databaseId,
    COLLECTIONS.salesReceiptItems,
    [Query.equal("receipt_id", receiptId), Query.limit(200)],
  );

  return response.documents || [];
}

async function reverseReceiptPaymentEffects(
  databases,
  receipt,
  {
    resolvedItems,
    reversedAt,
    actorUserId = "",
    actorName = "",
  } = {},
) {
  const paymentFlow = getPaymentFlow(
    receipt.payment_method_code || receipt.payment_method || "",
  );

  if (!isAdvancedPaymentFlow(paymentFlow)) {
    return null;
  }

  if (paymentFlow === "coupon") {
    return reverseCouponPaymentEffect(databases, receipt, {
      reversedAt,
      actorUserId,
      actorName,
    });
  }

  if (paymentFlow === "fuel-gift") {
    return reverseFuelGiftPaymentEffect(databases, receipt, {
      reversedAt,
      actorUserId,
      actorName,
    });
  }

  return reverseCustomerBalancePaymentEffect(databases, receipt, {
    paymentFlow,
    resolvedItems,
    reversedAt,
    actorUserId,
    actorName,
  });
}

async function reverseCouponPaymentEffect(
  databases,
  receipt,
  {
    reversedAt,
    actorUserId = "",
    actorName = "",
  } = {},
) {
  const databaseId = getServerAppwriteConfig().databaseId;
  const couponCode = extractReceiptNoteValue(receipt.notes, "Coupon code");

  if (!couponCode) {
    throw new Error("Coupon reversal could not be completed because the coupon code is missing.");
  }

  const couponDocument = await findCouponByCode(
    databases,
    databaseId,
    couponCode.toUpperCase(),
  );

  if (!couponDocument) {
    throw new Error("Coupon reversal could not be completed because the coupon record was not found.");
  }

  const faceValue = Number(couponDocument.face_value || 0);
  const previousBalance = Number(couponDocument.remaining_value || 0);
  const nextBalance = Number((previousBalance + Number(receipt.total_amount || 0)).toFixed(2));

  if (faceValue > 0 && nextBalance - faceValue > 0.009) {
    throw new Error(
      "Coupon reversal would exceed the original coupon value. Contact an administrator.",
    );
  }

  const status = buildCouponStatusFromRemainingValue(
    faceValue,
    nextBalance,
  );

  const updatedCoupon = await databases.updateDocument(
    databaseId,
    COLLECTIONS.coupons,
    couponDocument.$id,
    {
      remaining_value: nextBalance,
      status,
      last_used_at: reversedAt,
      last_receipt_id: receipt.$id,
      last_receipt_number: receipt.receipt_number || "",
    },
  );

  await databases.createDocument(
    databaseId,
    COLLECTIONS.couponMovements,
    ID.unique(),
    {
      coupon_id: updatedCoupon.$id,
      coupon_code: updatedCoupon.code || couponCode,
      company_id: updatedCoupon.company_id || "",
      company_name: updatedCoupon.company_name || "",
      purchase_id: updatedCoupon.purchase_id || "",
      purchase_reference: updatedCoupon.purchase_reference || "",
      receipt_id: receipt.$id,
      receipt_number: receipt.receipt_number || "",
      station_id: receipt.station_id || "",
      station_name: receipt.station_name || "",
      movement_date: reversedAt,
      direction: "void",
      amount_delta: Number(receipt.total_amount || 0),
      balance_after: nextBalance,
      actor_user_id: actorUserId,
      actor_name: actorName,
      notes: "Coupon value restored from POS reversal.",
    },
  );

  if (updatedCoupon.purchase_id) {
    await refreshCouponPurchaseTotals(databases, databaseId, {
      $id: updatedCoupon.purchase_id,
      status,
    });
  }

  return updatedCoupon;
}

async function reverseFuelGiftPaymentEffect(
  databases,
  receipt,
  {
    reversedAt,
    actorUserId = "",
    actorName = "",
  } = {},
) {
  const fuelGiftCode = extractReceiptNoteValue(receipt.notes, "Fuel gift code");

  if (!fuelGiftCode) {
    throw new Error(
      "Fuel gift reversal could not be completed because the gift code is missing.",
    );
  }

  const giftDocument = await findFuelGiftCodeByCode(
    databases,
    fuelGiftCode.toUpperCase(),
  );

  if (!giftDocument) {
    throw new Error(
      "Fuel gift reversal could not be completed because the gift code record was not found.",
    );
  }

  const bulkFundingAllocations = parseFuelGiftBulkFundingNote(
    extractReceiptNoteValue(receipt.notes, "Fuel gift bulk funding"),
  );

  for (const bulkFunding of bulkFundingAllocations) {
    const balanceAccount = await findCustomerBalanceAccount(databases, {
      accountType: "bulk_redeem",
      referenceCode: bulkFunding.referenceCode,
    });

    if (!balanceAccount) {
      throw new Error(
        "Fuel gift reversal could not restore one or more linked bulk balances.",
      );
    }

    const nextBalance = Number(
      (Number(balanceAccount.balance_amount || 0) + Number(bulkFunding.amount || 0)).toFixed(2),
    );

    await databases.updateDocument(
      getServerAppwriteConfig().databaseId,
      COLLECTIONS.customerBalances,
      balanceAccount.$id,
      {
        balance_amount: nextBalance,
        updated_at: reversedAt,
      },
    );

    await databases.createDocument(
      getServerAppwriteConfig().databaseId,
      COLLECTIONS.customerBalanceMovements,
      ID.unique(),
      {
        account_id: balanceAccount.$id,
        account_type: "bulk_redeem",
        receipt_id: receipt.$id,
        receipt_number: receipt.receipt_number || "",
        station_id: receipt.station_id || "",
        station_name: receipt.station_name || "",
        product_id: balanceAccount.product_id || "",
        product_name: balanceAccount.product_name || "",
        movement_date: reversedAt,
        direction: "credit",
        amount_delta: Number(Number(bulkFunding.amount || 0).toFixed(2)),
        quantity_delta: 0,
        balance_amount: nextBalance,
        balance_quantity: Number(balanceAccount.balance_quantity || 0),
        actor_user_id: actorUserId,
        actor_name: actorName,
        reference_code: bulkFunding.referenceCode,
        notes: "Bulk fuel balance restored from fuel gift reversal.",
      },
    );
  }

  const rewardFundingAmount = parseFuelGiftRewardFundingAmount(
    extractReceiptNoteValue(receipt.notes, "Fuel gift reward funding"),
  );

  if (rewardFundingAmount > 0) {
    let rewardClientUserId = `${giftDocument.client_user_id || ""}`.trim();
    let rewardClientName = `${giftDocument.client_name || ""}`.trim();
    let rewardClientPhone = `${giftDocument.client_phone || ""}`.trim();

    if (!rewardClientUserId && rewardClientPhone) {
      const clientUser = await findClientUserByPhone(rewardClientPhone);

      if (clientUser && `${clientUser.status || ""}`.trim().toLowerCase() === "active") {
        rewardClientUserId = clientUser.id;
        rewardClientName = clientUser.fullName || rewardClientName;
        rewardClientPhone = clientUser.phone || rewardClientPhone;
      }
    }

    if (!rewardClientUserId) {
      throw new Error(
        "Fuel gift reversal could not restore the linked cash back balance.",
      );
    }

    await applyClientRewardMovement({
      clientUserId: rewardClientUserId,
      clientName: rewardClientName,
      clientPhone: rewardClientPhone,
      direction: "credit",
      movementType: "reversal",
      amount: rewardFundingAmount,
      receiptId: receipt.$id,
      receiptNumber: receipt.receipt_number || "",
      stationId: receipt.station_id || "",
      stationName: receipt.station_name || "",
      actorUserId,
      actorName,
      referenceCode: `${receipt.receipt_number || receipt.$id || "sale"}-fuel-gift-funding-reversal`,
      notes: "Cash back restored from fuel gift reversal.",
    });
  }

  const updatedGiftDocument = await databases.updateDocument(
    getServerAppwriteConfig().databaseId,
    COLLECTIONS.fuelGiftCodes,
    giftDocument.$id,
    {
      status: "active",
      cashier_user_id: "",
      cashier_name: "",
      station_id: "",
      station_name: "",
      receipt_id: "",
      receipt_number: "",
      redeemed_at: null,
      notes: appendLineNote(
        giftDocument.notes,
        `Restored from POS reversal at ${reversedAt}.`,
      ),
    }
  );

  await syncFuelGiftPurchaseByGiftCodeId({
    giftCodeId: giftDocument.$id,
    status: "active",
    cashierUserId: "",
    cashierName: "",
    stationId: "",
    stationName: "",
    receiptId: "",
    receiptNumber: "",
    redeemedAt: "",
    cancelledAt: "",
    notes: `Restored from POS reversal at ${reversedAt}.`,
  });

  return updatedGiftDocument;
}

async function reverseCustomerBalancePaymentEffect(
  databases,
  receipt,
  {
    paymentFlow,
    resolvedItems,
    reversedAt,
    actorUserId = "",
    actorName = "",
  } = {},
) {
  const databaseId = getServerAppwriteConfig().databaseId;
  const accountType = toBalanceAccountType(paymentFlow);
  const receiptAmount = Number(receipt.total_amount || 0);
  let existingAccount = null;

  if (paymentFlow === "bulk-redeem") {
    const bulkReferenceCode = extractReceiptNoteValue(receipt.notes, "Bulk reference");

    existingAccount = await findCustomerBalanceAccount(databases, {
      accountType,
      referenceCode: bulkReferenceCode,
    });
  } else if (paymentFlow === "credit") {
    existingAccount = await findCustomerBalanceAccount(databases, {
      accountType,
      customerPhone:
        receipt.customer_phone || extractReceiptNoteValue(receipt.notes, "Customer phone"),
      stationId: receipt.station_id || "",
    });
  }

  if (!existingAccount) {
    throw new Error(
      paymentFlow === "credit"
        ? "Credit reversal could not be completed because the credit account was not found."
        : "Bulk balance reversal could not be completed because the balance account was not found.",
    );
  }

  const previousBalance = Number(existingAccount.balance_amount || 0);
  const isCreditFlow = paymentFlow === "credit";

  if (isCreditFlow && previousBalance + 0.009 < receiptAmount) {
    throw new Error(
      "This credit sale already has settlement activity. Reverse the settlement first before reversing the sale.",
    );
  }

  const nextBalance = isCreditFlow
    ? Number((previousBalance - receiptAmount).toFixed(2))
    : Number((previousBalance + receiptAmount).toFixed(2));

  const updatedAccount = await databases.updateDocument(
    databaseId,
    COLLECTIONS.customerBalances,
    existingAccount.$id,
    {
      balance_amount: nextBalance,
      updated_at: reversedAt,
    },
  );

  const productBinding = deriveSingleProductBinding(resolvedItems);

  await databases.createDocument(
    databaseId,
    COLLECTIONS.customerBalanceMovements,
    ID.unique(),
    {
      account_id: updatedAccount.$id,
      account_type: accountType,
      receipt_id: receipt.$id,
      receipt_number: receipt.receipt_number || "",
      station_id: receipt.station_id || "",
      station_name: receipt.station_name || "",
      product_id:
        updatedAccount.product_id || productBinding.productId || "",
      product_name:
        updatedAccount.product_name || productBinding.productName || "",
      movement_date: reversedAt,
      direction: isCreditFlow ? "debit" : "credit",
      amount_delta: isCreditFlow
        ? Number((-receiptAmount).toFixed(2))
        : Number(receiptAmount.toFixed(2)),
      quantity_delta: 0,
      balance_amount: nextBalance,
      balance_quantity: Number(existingAccount.balance_quantity || 0),
      actor_user_id: actorUserId,
      actor_name: actorName,
      reference_code: existingAccount.reference_code || "",
      notes: isCreditFlow
        ? "Credit balance reduced from POS transaction reversal."
        : "Bulk redemption balance restored from POS transaction reversal.",
    },
  );

  return updatedAccount;
}

function extractReceiptNoteValue(notes, label) {
  const escapedLabel = `${label || ""}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = `${notes || ""}`.match(new RegExp(`${escapedLabel}:\\s*([^\\n\\r]+)`, "i"));
  return match?.[1]?.trim() || "";
}

function appendReversalReceiptNotes(existingNotes, { reversedAt, reversedBy, reversalNote }) {
  let notes = existingNotes || "";

  notes = appendLineNote(notes, `Reversed at: ${reversedAt}`);
  notes = appendLineNote(notes, `Reversed by: ${reversedBy}`);

  if (reversalNote) {
    notes = appendLineNote(notes, `Reversal note: ${reversalNote}`);
  }

  return notes;
}

function appendLineNote(existingNotes, line) {
  const normalizedLine = `${line || ""}`.trim();

  if (!normalizedLine) {
    return `${existingNotes || ""}`;
  }

  const normalizedNotes = `${existingNotes || ""}`.trim();

  if (!normalizedNotes) {
    return normalizedLine;
  }

  if (normalizedNotes.includes(normalizedLine)) {
    return normalizedNotes;
  }

  return `${normalizedNotes}\n${normalizedLine}`;
}

function buildSummaryDocumentId(prefix, value) {
  return `${prefix}_${createHash("sha1")
    .update(String(value || ""))
    .digest("hex")
    .slice(0, 24)}`.slice(0, 36);
}

async function fetchStation(databases, stationId) {
  try {
    return await databases.getDocument(
      getServerAppwriteConfig().databaseId,
      COLLECTIONS.stations,
      stationId,
    );
  } catch {
    return null;
  }
}

async function fetchProduct(databases, productId, productName) {
  const databaseId = getServerAppwriteConfig().databaseId;

  if (productId) {
    try {
      return await databases.getDocument(
        databaseId,
        COLLECTIONS.products,
        productId,
      );
    } catch {
      // Fall through to name lookup.
    }
  }

  const response = await databases.listDocuments(
    databaseId,
    COLLECTIONS.products,
    [Query.equal("name", productName), Query.limit(1)],
  );

  return response.documents?.[0] || null;
}

async function fetchInventoryItem(databases, stationId, productId) {
  const response = await databases.listDocuments(
    getServerAppwriteConfig().databaseId,
    COLLECTIONS.inventoryItems,
    [
      Query.equal("station_id", stationId),
      Query.equal("product_id", productId),
      Query.limit(1),
    ],
  );

  return response.documents?.[0] || null;
}

function getInventoryStatus(quantity, reorderLevel) {
  if (quantity <= 0) {
    return "out";
  }

  if (quantity <= reorderLevel) {
    return "low";
  }

  return "in_stock";
}

function normalizeCategory(category, productName = "") {
  const normalizedCategory = `${category || ""}`.trim().toLowerCase();

  if (normalizedCategory === "fuel") {
    return "fuel";
  }

  if (normalizedCategory === "cement") {
    return "cement";
  }

  if (`${productName}`.trim().toLowerCase() === "cement") {
    return "cement";
  }

  return "shop";
}

function buildReceiptNumber({ saleDate = "", clientSaleId = "" } = {}) {
  const now = normalizeSaleDateInput(saleDate)
    ? new Date(normalizeSaleDateInput(saleDate))
    : new Date();
  const datePart = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");
  const timePart = [
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");

  const suffix = clientSaleId
    ? createHash("sha1")
        .update(clientSaleId)
        .digest("hex")
        .slice(0, 6)
        .toUpperCase()
    : Math.random().toString(36).slice(2, 6).toUpperCase();

  return `POS-${datePart}-${timePart}-${suffix}`;
}

function buildClientSaleDocumentId(clientSaleId) {
  return buildSummaryDocumentId("psr", clientSaleId);
}

function resolveSaleQuantity(item) {
  const category = normalizeCategory(item?.category, item?.productName);
  const unitPrice = Number(item?.unitPrice || 0);

  if (category === "fuel") {
    const amount = Number(item?.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      return 0;
    }

    return Number((amount / unitPrice).toFixed(6));
  }

  const quantity = Number(item?.quantity || 0);

  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function resolveSaleLineTotal(item) {
  const category = normalizeCategory(item?.category, item?.productName);

  if (category === "fuel") {
    const amount = Number(item?.amount || 0);

    return Number.isFinite(amount) && amount > 0 ? roundCurrency(amount) : 0;
  }

  return roundCurrency(Number(item?.unitPrice || 0) * Number(item?.quantity || 0));
}

async function createSalesReceiptDocument(databases, receiptId, payload) {
  const databaseId = getServerAppwriteConfig().databaseId;
  const normalizedIdempotencyKey = `${payload?.idempotency_key || ""}`.trim();
  const payloadWithoutBlankIdempotencyKey =
    normalizedIdempotencyKey || !Object.prototype.hasOwnProperty.call(payload, "idempotency_key")
      ? payload
      : Object.fromEntries(
          Object.entries(payload).filter(([key]) => key !== "idempotency_key"),
        );

  try {
    await databases.createDocument(
      databaseId,
      COLLECTIONS.salesReceipts,
      receiptId,
      payloadWithoutBlankIdempotencyKey,
    );
    return;
  } catch (error) {
    const errorMessage = `${error?.message || ""}`.toLowerCase();

    if (
      isIdempotencyKeyConstraintError(errorMessage) &&
      !normalizedIdempotencyKey &&
      payloadWithoutBlankIdempotencyKey !== payload
    ) {
      await databases.createDocument(
        databaseId,
        COLLECTIONS.salesReceipts,
        receiptId,
        payloadWithoutBlankIdempotencyKey,
      );
      return;
    }

    if (
      !isLegacyReceiptSchemaPaymentMethodCode(payloadWithoutBlankIdempotencyKey.payment_method) &&
      isPaymentMethodValueConstraintError(errorMessage)
    ) {
      try {
        await databases.createDocument(
          databaseId,
          COLLECTIONS.salesReceipts,
          receiptId,
          {
            ...payloadWithoutBlankIdempotencyKey,
            payment_method: "mixed",
          },
        );
        return;
      } catch (fallbackError) {
        const fallbackMessage = `${fallbackError?.message || ""}`.toLowerCase();

        if (
          isMissingPaymentMethodMetadataError(fallbackMessage) ||
          isMissingEnhancedReceiptFieldError(fallbackMessage)
        ) {
          await databases.createDocument(
            databaseId,
            COLLECTIONS.salesReceipts,
            receiptId,
            buildLegacyReceiptPayload({
              ...payloadWithoutBlankIdempotencyKey,
              payment_method: "mixed",
            }),
          );
          return;
        }

        throw fallbackError;
      }
    }

    if (isMissingPaymentMethodMetadataError(errorMessage)) {
      if (!isLegacyReceiptSchemaPaymentMethodCode(payloadWithoutBlankIdempotencyKey.payment_method)) {
        throw new Error(
          "Custom payment methods need the latest database schema update before they can be saved.",
        );
      }

      await databases.createDocument(
        databaseId,
        COLLECTIONS.salesReceipts,
        receiptId,
        buildLegacyReceiptPayload(payloadWithoutBlankIdempotencyKey),
      );
      return;
    }

    if (isMissingEnhancedReceiptFieldError(errorMessage)) {
      await databases.createDocument(
        databaseId,
        COLLECTIONS.salesReceipts,
        receiptId,
        buildLegacyReceiptPayload(payloadWithoutBlankIdempotencyKey),
      );
      return;
    }

    throw error;
  }
}

function isLegacyReceiptSchemaPaymentMethodCode(code) {
  return ["cash", "card", "transfer", "credit", "mixed"].includes(
    normalizePaymentMethodCode(code),
  );
}

function isPaymentMethodValueConstraintError(message) {
  return (
    message.includes("payment_method") &&
    (message.includes("invalid") ||
      message.includes("enum") ||
      message.includes("must be one of") ||
      message.includes("value is not a valid"))
  );
}

function isMissingPaymentMethodMetadataError(message) {
  return (
    message.includes("payment_method_code") ||
    message.includes("payment_method_label")
  );
}

function isMissingEnhancedReceiptFieldError(message) {
  return (
    message.includes("customer_phone") ||
    message.includes("vehicle_registration_number") ||
    message.includes("company_name") ||
    message.includes("billable_to") ||
    message.includes("idempotency_key") ||
    message.includes("payment_status")
  );
}

function isIdempotencyKeyConstraintError(message) {
  return message.includes("idempotency_key");
}

function buildLegacyReceiptPayload(payload) {
  const {
    payment_method_code: _ignoredCode,
    payment_method_label: _ignoredLabel,
    payment_status: _ignoredPaymentStatus,
    customer_phone: _ignoredCustomerPhone,
    vehicle_registration_number: _ignoredVehicleRegistrationNumber,
    company_name: _ignoredCompanyName,
    billable_to: _ignoredBillableTo,
    idempotency_key: _ignoredIdempotencyKey,
    ...legacyPayload
  } = payload;

  return legacyPayload;
}

function normalizeSaleDateInput(value) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return "";
  }

  const parsedDate = new Date(normalizedValue);

  return Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();
}

function normalizeDateOnlyInput(value) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return "";
  }

  const parsedDate = new Date(normalizedValue);

  return Number.isNaN(parsedDate.getTime())
    ? ""
    : parsedDate.toISOString().slice(0, 10);
}

function buildReceiptNotes({
  customerPhone,
  vehicleRegistrationNumber,
  companyOrOrganizationName,
  billableTo,
  paymentFlow = "standard",
  couponCode = "",
  bulkReferenceCode = "",
  fuelGiftCode = "",
  fuelGiftBulkFunding = "",
  fuelGiftRewardFunding = 0,
  creditDueDate = "",
  paymentNote = "",
} = {}) {
  const parts = ["Submitted from POS."];

  if (customerPhone) {
    parts.push(`Customer phone: ${customerPhone}`);
  }

  if (vehicleRegistrationNumber) {
    parts.push(`Vehicle registration: ${vehicleRegistrationNumber}`);
  }

  if (companyOrOrganizationName) {
    parts.push(`Company/organization: ${companyOrOrganizationName}`);
  }

  if (billableTo) {
    parts.push(`Billable to: ${billableTo}`);
  }

  if (paymentFlow === "coupon" && couponCode) {
    parts.push(`Coupon code: ${couponCode}`);
  }

  if (paymentFlow === "bulk-redeem" && bulkReferenceCode) {
    parts.push(`Bulk reference: ${bulkReferenceCode}`);
  }

  if (paymentFlow === "fuel-gift" && fuelGiftCode) {
    parts.push(`Fuel gift code: ${fuelGiftCode}`);
  }

  if (paymentFlow === "fuel-gift" && fuelGiftBulkFunding) {
    parts.push(`Fuel gift bulk funding: ${fuelGiftBulkFunding}`);
  }

  if (paymentFlow === "fuel-gift" && Number(fuelGiftRewardFunding || 0) > 0) {
    parts.push(
      `Fuel gift reward funding: ${Number(fuelGiftRewardFunding || 0).toFixed(2)}`,
    );
  }

  if (paymentFlow === "credit" && creditDueDate) {
    parts.push(`Credit due date: ${creditDueDate}`);
  }

  if (paymentNote) {
    parts.push(`Payment note: ${paymentNote}`);
  }

  return parts.join("\n");
}

function buildPaymentRecordNotes({
  paymentFlow = "standard",
  fuelGiftCode = "",
  fuelGiftRecipientName = "",
  vehicleRegistrationNumber = "",
  companyOrOrganizationName = "",
  billableTo = "",
  creditDueDate = "",
  paymentNote = "",
} = {}) {
  const parts = [];

  if (vehicleRegistrationNumber) {
    parts.push(`Vehicle: ${vehicleRegistrationNumber}`);
  }

  if (companyOrOrganizationName) {
    parts.push(`Company/organization: ${companyOrOrganizationName}`);
  }

  if (billableTo) {
    parts.push(`Billable to: ${billableTo}`);
  }

  if (paymentFlow === "fuel-gift" && fuelGiftCode) {
    parts.push(`Fuel gift: ${fuelGiftCode}`);
  }

  if (paymentFlow === "fuel-gift" && fuelGiftRecipientName) {
    parts.push(`Recipient: ${fuelGiftRecipientName}`);
  }

  if (paymentFlow === "credit" && creditDueDate) {
    parts.push(`Credit due date: ${creditDueDate}`);
  }

  if (paymentNote) {
    parts.push(paymentNote);
  }

  return parts.join(" · ");
}

function buildCustomerBalanceAccountNotes({
  paymentFlow = "standard",
  creditDueDate = "",
} = {}) {
  if (paymentFlow === "coupon") {
    return "Coupon-linked customer balance account.";
  }

  if (paymentFlow === "bulk-redeem") {
    return "Bulk fuel redemption balance account.";
  }

  if (paymentFlow === "credit") {
    return creditDueDate
      ? `Customer credit account. Due date: ${creditDueDate}.`
      : "Customer credit account.";
  }

  return "Customer balance account.";
}

function serializeFuelGiftBulkFunding(allocations = []) {
  return allocations
    .filter((allocation) => allocation?.referenceCode && Number(allocation?.amount || 0) > 0)
    .map(
      (allocation) =>
        `${allocation.referenceCode}=${Number(allocation.amount || 0).toFixed(2)}`,
    )
    .join("|");
}

function parseFuelGiftBulkFundingNote(value) {
  return `${value || ""}`
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");

      if (separatorIndex <= 0) {
        return null;
      }

      const referenceCode = entry.slice(0, separatorIndex).trim();
      const amount = Number(entry.slice(separatorIndex + 1).trim() || 0);

      if (!referenceCode || !Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      return {
        referenceCode,
        amount: Number(amount.toFixed(2)),
      };
    })
    .filter(Boolean);
}

function parseFuelGiftRewardFundingAmount(value) {
  const amount = Number(`${value || ""}`.trim() || 0);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 0;
}

function buildFuelGiftFundingAuditNote(operation) {
  const parts = [];
  const bulkFunding = serializeFuelGiftBulkFunding(operation.bulkAllocations || []);

  if (bulkFunding) {
    parts.push(`Bulk funding applied: ${bulkFunding}.`);
  }

  if (Number(operation.rewardAllocation?.amount || 0) > 0) {
    parts.push(
      `Reward funding applied: D${Number(operation.rewardAllocation.amount || 0).toFixed(2)}.`,
    );
  }

  return parts.join(" ");
}

function getPaymentReferenceCode({
  paymentFlow = "standard",
  couponCode = "",
  bulkReferenceCode = "",
  fuelGiftCode = "",
} = {}) {
  if (paymentFlow === "coupon") {
    return `${couponCode || ""}`.trim();
  }

  if (paymentFlow === "bulk-redeem") {
    return `${bulkReferenceCode || ""}`.trim();
  }

  if (paymentFlow === "fuel-gift") {
    return `${fuelGiftCode || ""}`.trim();
  }

  return "";
}

function toBalanceAccountType(paymentFlow) {
  if (paymentFlow === "coupon") {
    return "coupon";
  }

  if (paymentFlow === "credit") {
    return "credit";
  }

  if (paymentFlow === "bulk-redeem") {
    return "bulk_redeem";
  }

  return "";
}

function normalizeProductIdentity(value) {
  return `${value || ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveBalanceProductCategory(items = []) {
  const categories = Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => normalizeCategory(item?.category, item?.productName))
        .filter(Boolean),
    ),
  );

  if (categories.length === 1) {
    return categories[0];
  }

  return "all";
}

function deriveSingleProductBinding(items = []) {
  const normalizedItems = (Array.isArray(items) ? items : []).filter(
    (item) => `${item?.productName || ""}`.trim(),
  );
  const productIds = Array.from(
    new Set(
      normalizedItems
        .map((item) => `${item?.productId || ""}`.trim())
        .filter(Boolean),
    ),
  );
  const productNames = Array.from(
    new Set(
      normalizedItems
        .map((item) => `${item?.productName || ""}`.trim())
        .filter(Boolean),
    ),
  );

  return {
    productId: productIds.length === 1 ? productIds[0] : "",
    productName: productNames.length === 1 ? productNames[0] : "",
    hasMixedProducts: productIds.length > 1 || productNames.length > 1,
    productCategory: deriveBalanceProductCategory(normalizedItems),
  };
}

function ensureFuelGiftMatchesSale(giftDocument, items, totalAmount) {
  const productBinding = deriveSingleProductBinding(items);

  if (productBinding.hasMixedProducts || productBinding.productCategory !== "fuel") {
    throw new Error(
      "Fuel gift codes can only be redeemed for one fuel product at a time.",
    );
  }

  const giftAmount = Number(giftDocument?.amount || 0);
  const saleAmount = Number(totalAmount || 0);

  if (
    !Number.isFinite(giftAmount) ||
    giftAmount <= 0 ||
    !Number.isFinite(saleAmount) ||
    saleAmount <= 0
  ) {
    throw new Error("Fuel gift amount is invalid.");
  }

  if (Math.abs(giftAmount - saleAmount) > 0.009) {
    throw new Error(
      `This fuel gift code can only be redeemed for ${formatCurrencyAmount(giftAmount)}.`,
    );
  }

  const saleProductIdentity = normalizeProductIdentity(productBinding.productName);
  const giftProductCode = normalizeProductIdentity(giftDocument?.product_code || "");
  const giftProductName = normalizeProductIdentity(giftDocument?.product_name || "");
  const matchesGiftCode = giftProductCode && saleProductIdentity === giftProductCode;
  const matchesGiftName = giftProductName && saleProductIdentity === giftProductName;

  if (!matchesGiftCode && !matchesGiftName) {
    throw new Error(
      `This fuel gift code can only be redeemed for ${giftDocument?.product_name || "its assigned fuel product"}.`,
    );
  }
}

function ensureBulkBalanceMatchesSaleItems(account, productBinding) {
  if (productBinding.hasMixedProducts || !productBinding.productName) {
    throw new Error(
      "Bulk redemption can only be used for one product at a time.",
    );
  }

  const accountProductId = `${account?.product_id || ""}`.trim();
  const accountProductName = `${account?.product_name || ""}`.trim().toLowerCase();
  const accountProductCategory = `${account?.product_category || ""}`
    .trim()
    .toLowerCase();
  const saleProductName = `${productBinding.productName || ""}`.trim().toLowerCase();

  if (accountProductId && accountProductId !== productBinding.productId) {
    throw new Error(
      `This bulk balance can only be redeemed for ${account.product_name || "its assigned product"}.`,
    );
  }

  if (!accountProductId && accountProductName && accountProductName !== saleProductName) {
    throw new Error(
      `This bulk balance can only be redeemed for ${account.product_name || "its assigned product"}.`,
    );
  }

  if (
    !accountProductId &&
    !accountProductName &&
    accountProductCategory &&
    accountProductCategory !== "all" &&
    accountProductCategory !== `${productBinding.productCategory || ""}`.toLowerCase()
  ) {
    throw new Error(
      `This bulk balance can only be redeemed for ${account.product_category}.`,
    );
  }
}

function buildCustomerBalanceReference({
  accountType,
  stationCode,
  customerPhone,
}) {
  const normalizedStationCode = `${stationCode || ""}`
    .trim()
    .replace(/[^a-z0-9]+/gi, "")
    .slice(0, 8)
    .toUpperCase();
  const normalizedPhone = `${customerPhone || ""}`
    .trim()
    .replace(/[^0-9]+/g, "")
    .slice(-6);
  const typePrefix =
    accountType === "credit"
      ? "CRD"
      : accountType === "coupon"
        ? "CPN"
        : "BLK";

  return `${typePrefix}-${normalizedStationCode || "JAH"}-${normalizedPhone || "CUST"}`;
}

function formatCurrencyAmount(value) {
  return `D${Number(value || 0).toLocaleString()}`;
}
