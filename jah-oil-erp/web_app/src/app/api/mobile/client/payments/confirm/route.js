import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getRoleById, getUserById } from "@/features/auth/data";
import { isFuelSales } from "@/features/auth/scopes";
import {
  applyClientRewardMovement,
  creditClientRewardForSale,
  getClientRewardAccountByClientUserId,
  getClientUserById,
  getRewardSettings,
} from "@/features/client-users/data";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { normalizePaymentMethodCode } from "@/features/payments/constants";
import { completePosSaleAction } from "@/app/pos/actions";
import {
  CLIENT_PAYMENT_CONTRACT_VERSION,
  normalizeCashierQrCode,
  resolveVerifiedCashier,
} from "@/app/api/mobile/client/_lib";
import {
  getActivePaymentMethodsData,
  getCustomerBalanceAccountsData,
  getProductsData,
} from "@/lib/data/appwrite-data";

import { getClientRequestSession } from "../../auth/_shared";

export const dynamic = "force-dynamic";

const ALLOWED_CHECKOUT_TYPES = new Set(["fuel_purchase", "bulk_redeem"]);
const ALLOWED_PROVIDER_STATUSES = new Set(["pending", "authorized", "confirmed", "failed"]);

function getPaymentConfirmationErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Mobile Client",
    genericLabel: "confirm this payment",
    fallbackMessage:
      "We could not confirm this payment right now. Try again, and if the issue continues, contact support.",
  });
}

function normalizePositiveNumber(value) {
  const parsedValue = Number(value || 0);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
}

function normalizeComparable(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function buildCashierSession(user, role) {
  return {
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
    roleId: role.id,
    roleName: role.name,
    modules: role.modules,
    branchId: user.branchId,
    branchName: user.branchName,
    mustChangePassword: Boolean(user.mustChangePassword),
    status: user.status || "active",
  };
}

function getCashierFlowErrorMessage(checkoutType) {
  return checkoutType === "bulk_redeem"
    ? "The scanned cashier cannot process bulk fuel redemptions."
    : "The scanned cashier cannot process fuel sales.";
}

function resolveMobilePaymentMethod({
  checkoutType,
  providerCode,
  cashbackAmountToRedeem,
  activePaymentMethodCodes,
}) {
  if (checkoutType === "bulk_redeem") {
    return activePaymentMethodCodes.has("bulk-redeem") ? "bulk-redeem" : "";
  }

  const normalizedProviderCode = `${normalizePaymentMethodCode(providerCode) || ""}`.trim();

  if (normalizedProviderCode && activePaymentMethodCodes.has(normalizedProviderCode)) {
    return normalizedProviderCode;
  }

  if (cashbackAmountToRedeem > 0 && activePaymentMethodCodes.has("mixed")) {
    return "mixed";
  }

  if (activePaymentMethodCodes.has("transfer")) {
    return "transfer";
  }

  return "";
}

async function findFuelProductByCode(productCode) {
  const products = await getProductsData();

  return (
    products.find(
      (product) =>
        `${product.category || ""}`.trim().toLowerCase() === "fuel" &&
        normalizeComparable(product.name) === normalizeComparable(productCode),
    ) || null
  );
}

async function findClientBulkReferenceCode(clientPhone, product) {
  const accounts = await getCustomerBalanceAccountsData();
  const matchingAccounts = accounts
    .filter(
      (account) =>
        account.accountType === "bulk_redeem" &&
        `${account.status || ""}`.trim().toLowerCase() === "active" &&
        Number(account.balanceAmount || 0) > 0 &&
        normalizeComparable(account.customerPhone) === normalizeComparable(clientPhone) &&
        normalizeComparable(account.productName) === normalizeComparable(product.name),
    )
    .sort(
      (left, right) =>
        `${left.createdAt || ""}`.localeCompare(`${right.createdAt || ""}`) ||
        `${left.updatedAt || ""}`.localeCompare(`${right.updatedAt || ""}`),
    );

  return matchingAccounts[0]?.referenceCode || "";
}

export async function POST(request) {
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

    const payload = await request.json().catch(() => null);
    const checkoutType = `${payload?.checkoutType || ""}`.trim().toLowerCase();
    const providerCode = `${payload?.providerCode || ""}`.trim().toLowerCase();
    const providerStatus = `${payload?.providerStatus || "confirmed"}`
      .trim()
      .toLowerCase();
    const productCode = `${payload?.productCode || ""}`.trim().toLowerCase();
    const providerReference = `${payload?.providerReference || ""}`.trim();
    const currency = `${payload?.currency || "GMD"}`.trim().toUpperCase();
    const qrCode = normalizeCashierQrCode(payload?.cashierQrCode || payload?.qrCode);
    const amount = normalizePositiveNumber(payload?.amount);
    const cashbackAmountToRedeem = Math.max(
      0,
      Number(payload?.cashbackAmountToRedeem ?? payload?.pointsToRedeem ?? 0),
    );

    if (!ALLOWED_CHECKOUT_TYPES.has(checkoutType)) {
      return NextResponse.json(
        {
          success: false,
          message: "Checkout type is invalid.",
        },
        { status: 400 },
      );
    }

    if (!qrCode) {
      return NextResponse.json(
        {
          success: false,
          message: "Cashier QR code is required.",
        },
        { status: 400 },
      );
    }

    if (checkoutType === "fuel_purchase" && !providerCode) {
      return NextResponse.json(
        {
          success: false,
          message: "Payment provider is required.",
        },
        { status: 400 },
      );
    }

    if (!ALLOWED_PROVIDER_STATUSES.has(providerStatus)) {
      return NextResponse.json(
        {
          success: false,
          message: "Provider status is invalid.",
        },
        { status: 400 },
      );
    }

    if (!productCode) {
      return NextResponse.json(
        {
          success: false,
          message: "Product code is required.",
        },
        { status: 400 },
      );
    }

    if (!amount) {
      return NextResponse.json(
        {
          success: false,
          message: "Amount must be greater than zero.",
        },
        { status: 400 },
      );
    }

    const clientUser = await getClientUserById(session.userId);

    if (!clientUser || clientUser.status !== "active") {
      return NextResponse.json(
        {
          success: false,
          message: "Client account could not be found.",
        },
        { status: 404 },
      );
    }

    const cashier = await resolveVerifiedCashier(qrCode);

    if (!cashier) {
      return NextResponse.json(
        {
          success: false,
          message: "The scanned cashier QR code is not recognized.",
          contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
        },
        { status: 404 },
      );
    }

    const capabilityKey =
      checkoutType === "bulk_redeem" ? "redeemBulkFuel" : "buyFuel";

    if (!cashier.capabilities?.[capabilityKey] || !isFuelSales(cashier.roleName)) {
      return NextResponse.json(
        {
          success: false,
          message: getCashierFlowErrorMessage(checkoutType),
          contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
        },
        { status: 403 },
      );
    }

    if (providerStatus === "failed") {
      return NextResponse.json(
        {
          success: false,
          contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
          message: "Payment provider marked this payment as failed.",
        },
        { status: 400 },
      );
    }

    if (providerStatus === "pending") {
      return NextResponse.json(
        {
          success: true,
          contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
          message: "Payment is pending confirmation. No sale has been recorded yet.",
          confirmation: {
            confirmationId: `mcp_${Date.now().toString(36)}`,
            status: "pending",
            providerCode,
            providerStatus,
            providerReference,
            checkoutType,
            productCode,
            amount,
            currency,
            recordedSale: false,
            verifiedAt: new Date().toISOString(),
          },
          cashier,
        },
        { status: 202 },
      );
    }

    const rewardAccount = await getClientRewardAccountByClientUserId(session.userId);

    if (
      checkoutType === "fuel_purchase" &&
      cashbackAmountToRedeem > Number(rewardAccount?.balanceAmount || 0)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Cash back balance is not enough for this redemption.",
        },
        { status: 400 },
      );
    }

    const cashierUser = await getUserById(cashier.id);
    const [clientCashierRole, product, rewardSettings, activePaymentMethods] = await Promise.all([
      cashierUser?.roleId ? getRoleById(cashierUser.roleId) : Promise.resolve(null),
      findFuelProductByCode(productCode),
      getRewardSettings(),
      getActivePaymentMethodsData(),
    ]);

    if (!cashierUser || !clientCashierRole) {
      return NextResponse.json(
        {
          success: false,
          message: "The cashier account linked to this QR code could not be loaded.",
        },
        { status: 404 },
      );
    }

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          message: "The selected fuel product could not be found.",
        },
        { status: 404 },
      );
    }

    const activePaymentMethodCodes = new Set(
      activePaymentMethods.map((method) => `${method.code || ""}`.trim().toLowerCase()),
    );
    const resolvedPaymentMethod = resolveMobilePaymentMethod({
      checkoutType,
      providerCode,
      cashbackAmountToRedeem,
      activePaymentMethodCodes,
    });

    if (!resolvedPaymentMethod) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No active payment method is configured for this mobile payment. Update payment methods and try again.",
        },
        { status: 400 },
      );
    }

    const bulkReferenceCode =
      checkoutType === "bulk_redeem"
        ? await findClientBulkReferenceCode(clientUser.phone, product)
        : "";

    if (checkoutType === "bulk_redeem" && !bulkReferenceCode) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No active bulk fuel balance was found for this product. Fund a bulk balance first.",
        },
        { status: 400 },
      );
    }

    const receiptPayload = {
      clientSaleId: payload?.clientSaleId || `client-sale-${randomUUID()}`,
      stationId: cashierUser.branchId,
      paymentMethod: resolvedPaymentMethod,
      customerName:
        clientUser.userType === "company" && clientUser.companyName
          ? clientUser.companyName
          : clientUser.fullName,
      customerPhone: clientUser.phone,
      companyOrOrganizationName: clientUser.companyName || "",
      billableTo: "",
      bulkReferenceCode,
      paymentNote:
        checkoutType === "fuel_purchase"
          ? [
              `Client mobile payment via ${providerCode || "wallet"}`,
              providerReference ? `Provider ref: ${providerReference}` : "",
              cashbackAmountToRedeem > 0
                ? `Cash back redeemed: D${cashbackAmountToRedeem.toFixed(2)}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : `Client bulk fuel redemption${providerReference ? ` · ${providerReference}` : ""}`,
      saleDate: new Date().toISOString(),
      items: [
        {
          productId: product.id,
          productName: product.name,
          name: product.name,
          category: "fuel",
          unit: product.unit || "litre",
          amount: Number(amount.toFixed(2)),
          price: Number(product.price || 0),
          qty: Number((amount / Number(product.price || 1)).toFixed(3)),
        },
      ],
    };

    const saleResult = await completePosSaleAction(receiptPayload, {
      sessionOverride: buildCashierSession(cashierUser, clientCashierRole),
    });

    if (!saleResult.success) {
      return NextResponse.json(
        {
          success: false,
          contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
          message: saleResult.message || "We could not record this sale.",
        },
        { status: 400 },
      );
    }

    let updatedRewardAccount = rewardAccount;
    let earnedCashBack = Number(saleResult.earnedCashBack || 0);

    if (checkoutType === "fuel_purchase" && cashbackAmountToRedeem > 0) {
      updatedRewardAccount = await applyClientRewardMovement({
        clientUserId: clientUser.id,
        clientName: clientUser.fullName,
        clientPhone: clientUser.phone,
        direction: "debit",
        movementType: "redeem",
        amount: cashbackAmountToRedeem,
        stationId: cashierUser.branchId,
        stationName: cashierUser.branchName,
        actorUserId: cashierUser.id,
        actorName: cashierUser.fullName,
        receiptNumber: saleResult.receiptNumber || "",
        referenceCode: `${saleResult.receiptNumber || payload?.clientSaleId || "sale"}-cashback-redeem`,
        notes: "Redeemed during a client fuel purchase.",
      });
    }

    if (checkoutType === "fuel_purchase") {
      const rewardResult = await creditClientRewardForSale({
        clientUserId: clientUser.id,
        clientName: clientUser.fullName,
        clientPhone: clientUser.phone,
        amount,
        cashBackPercent: Number(rewardSettings.cashBackPercent || 0),
        receiptId: "",
        receiptNumber: saleResult.receiptNumber || "",
        stationId: cashierUser.branchId,
        stationName: cashierUser.branchName,
        actorUserId: cashierUser.id,
        actorName: cashierUser.fullName,
        notes: "Earned from a client fuel purchase.",
      });

      earnedCashBack = Number(rewardResult.earnedCashBack || 0);
      updatedRewardAccount = rewardResult.rewardAccount || updatedRewardAccount;
    } else if (checkoutType === "bulk_redeem") {
      updatedRewardAccount = await getClientRewardAccountByClientUserId(session.userId);
    }

    return NextResponse.json(
      {
        success: true,
        contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
        message: "Payment confirmed and sale recorded successfully.",
        confirmation: {
          confirmationId: payload?.clientSaleId || `mcp_${Date.now().toString(36)}`,
          status: "accepted",
          providerCode,
          providerStatus,
          providerReference,
          checkoutType,
          productCode,
          amount,
          currency,
          cashbackAmountToRedeem,
          recordedSale: true,
          receiptNumber: saleResult.receiptNumber || "",
          earnedCashBack,
          verifiedAt: new Date().toISOString(),
        },
        cashier,
        client: {
          fullName: clientUser.fullName,
          phone: clientUser.phone,
          userType: clientUser.userType,
          companyName: clientUser.companyName || "",
        },
        rewardAccount: updatedRewardAccount
          ? {
              balanceAmount: Number(updatedRewardAccount.balanceAmount || 0),
              totalEarned: Number(updatedRewardAccount.totalEarned || 0),
              totalRedeemed: Number(updatedRewardAccount.totalRedeemed || 0),
            }
          : {
              balanceAmount: 0,
              totalEarned: 0,
              totalRedeemed: 0,
            },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
        message: getPaymentConfirmationErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
