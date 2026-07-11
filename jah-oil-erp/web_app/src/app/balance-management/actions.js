"use server";

import { Client, Databases, ID, Query } from "appwrite";
import { revalidatePath } from "next/cache";

import { requireModuleAccess } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { invalidateAppwriteCollectionCache } from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  customerBalances: "customer_balances",
  customerBalanceMovements: "customer_balance_movements",
  salesReceipts: "sales_receipts",
  salesPayments: "sales_payments",
  auditLogs: "audit_logs",
};

const MANAGED_ACCOUNT_TYPES = new Set(["bulk_redeem"]);
const PRODUCT_CATEGORIES = new Set(["fuel", "shop", "cement", "all"]);
const ACCOUNT_STATUSES = new Set(["active", "inactive", "suspended"]);

export async function saveManagedBalanceAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  const session = await requireModuleAccess("balance-management");
  const accountId = `${payload?.accountId || ""}`.trim();
  const accountType = normalizeAccountType(payload?.accountType);
  const customerName = `${payload?.customerName || ""}`.trim();
  const customerPhone = `${payload?.customerPhone || ""}`.trim();
  const referenceCode = `${payload?.referenceCode || ""}`.trim();
  const stationId = `${payload?.stationId || ""}`.trim();
  const stationName = `${payload?.stationName || ""}`.trim();
  const productId = `${payload?.productId || ""}`.trim();
  const productName = `${payload?.productName || ""}`.trim();
  const productCategory = normalizeProductCategory(payload?.productCategory);
  const status = normalizeAccountStatus(payload?.status);
  const notes = `${payload?.notes || ""}`.trim();
  const adjustmentType = `${payload?.adjustmentType || "credit"}`.trim().toLowerCase();
  const rawAmount = Number(payload?.amount ?? 0);
  const amount = Number.isFinite(rawAmount)
    ? Number(rawAmount.toFixed(2))
    : Number.NaN;

  if (!MANAGED_ACCOUNT_TYPES.has(accountType)) {
    return {
      success: false,
      message: "Select bulk balance management.",
    };
  }

  if (!customerName || !customerPhone) {
    return {
      success: false,
      message: "Customer name and phone are required.",
    };
  }

  if (!referenceCode) {
    return {
      success: false,
      message: "Reference code is required.",
    };
  }

  if (!PRODUCT_CATEGORIES.has(productCategory)) {
    return {
      success: false,
      message: "Select a valid product category.",
    };
  }

  if (!ACCOUNT_STATUSES.has(status)) {
    return {
      success: false,
      message: "Select a valid account status.",
    };
  }

  if (!Number.isFinite(amount) || amount < 0) {
    return {
      success: false,
      message: "Amount must be a valid non-negative number.",
    };
  }

  if (!["credit", "debit"].includes(adjustmentType)) {
    return {
      success: false,
      message: "Select a valid balance adjustment type.",
    };
  }

  if (!accountId && amount <= 0) {
    return {
      success: false,
      message: "New balances require an opening amount greater than zero.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();
  const now = new Date().toISOString();

  if (accountType === "bulk_redeem" && (!productId || !productName)) {
    return {
      success: false,
      message: "Bulk balances must be tied to a specific product.",
    };
  }

  try {
    const existingAccount = accountId
      ? await databases.getDocument(
          config.databaseId,
          COLLECTIONS.customerBalances,
          accountId,
        )
      : null;

    if (existingAccount && existingAccount.account_type !== accountType) {
      return {
        success: false,
        message: "Selected balance account does not match this balance type.",
      };
    }

    const duplicateAccount = await findCustomerBalanceByReference(
      databases,
      config.databaseId,
      {
        accountType,
        referenceCode,
        excludeAccountId: existingAccount?.$id || "",
      },
    );

    if (duplicateAccount) {
      return {
        success: false,
        message:
          "Another balance account already uses this reference code. Select that account instead.",
      };
    }

    const previousBalance = Number(existingAccount?.balance_amount || 0);
    const signedAmount =
      amount === 0 ? 0 : adjustmentType === "debit" ? -amount : amount;
    const nextBalance = Number((previousBalance + signedAmount).toFixed(2));

    if (nextBalance < 0) {
      return {
        success: false,
        message: "Adjustment exceeds the current balance.",
      };
    }

    const documentPayload = {
      account_type: accountType,
      reference_code: referenceCode,
      customer_name: customerName,
      customer_phone: customerPhone,
      station_id: stationId,
      station_name: stationName,
      product_id: accountType === "bulk_redeem" ? productId : "",
      product_name: accountType === "bulk_redeem" ? productName : "",
      product_category: productCategory,
      balance_amount: nextBalance,
      balance_quantity: Number(existingAccount?.balance_quantity || 0),
      unit: existingAccount?.unit || "",
      status,
      updated_at: now,
      notes,
    };

    const savedAccount = existingAccount
      ? await databases.updateDocument(
          config.databaseId,
          COLLECTIONS.customerBalances,
          existingAccount.$id,
          documentPayload,
        )
      : await databases.createDocument(
          config.databaseId,
          COLLECTIONS.customerBalances,
          ID.unique(),
          {
            ...documentPayload,
            created_at: now,
          },
        );

    if (signedAmount !== 0) {
      await databases.createDocument(
        config.databaseId,
        COLLECTIONS.customerBalanceMovements,
        ID.unique(),
        {
          account_id: savedAccount.$id,
          account_type: accountType,
          receipt_id: "",
          receipt_number: "",
          station_id: stationId,
          station_name: stationName,
          product_id: accountType === "bulk_redeem" ? productId : "",
          product_name: accountType === "bulk_redeem" ? productName : "",
          movement_date: now,
        direction: signedAmount < 0 ? "debit" : "credit",
        amount_delta: signedAmount,
        quantity_delta: 0,
        balance_amount: nextBalance,
        balance_quantity: Number(existingAccount?.balance_quantity || 0),
        due_date: "",
        actor_user_id: session.userId || "",
        actor_name: session.fullName || "System",
        reference_code: referenceCode,
        notes:
            notes ||
            (existingAccount
              ? "Balance adjusted from Balance Management."
              : "Balance created from Balance Management."),
        },
      );
    }

    await createAuditLogRecord(databases, {
      actorUserId: session.userId || "",
      actorName: session.fullName || "System",
      action: existingAccount ? "customer_balance.updated" : "customer_balance.created",
      entityType: "customer_balance",
      entityId: savedAccount.$id,
      stationId,
      stationName,
      oldValue: existingAccount ? JSON.stringify(existingAccount) : "",
      newValue: JSON.stringify({
        ...documentPayload,
        id: savedAccount.$id,
      }),
    });

    revalidateBalances();

    return {
      success: true,
      accountId: savedAccount.$id,
      message:
        signedAmount === 0
          ? "Balance details updated successfully."
          : existingAccount
            ? "Balance adjusted successfully."
            : "Balance created successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Balance Management",
        genericLabel: "save this balance account",
        fallbackMessage: "Failed to save balance account.",
      }),
    };
  }
}

export async function settleCreditBalanceAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  const session = await requireModuleAccess("balance-management");
  const accountId = `${payload?.accountId || ""}`.trim();
  const settlementNotes = `${payload?.notes || ""}`.trim();
  const nextPaymentDate = normalizeDateOnlyInput(payload?.nextPaymentDate);
  const rawSettlementAmount = Number(payload?.amount ?? 0);
  const settlementAmount = Number.isFinite(rawSettlementAmount)
    ? Number(rawSettlementAmount.toFixed(2))
    : Number.NaN;

  if (!accountId) {
    return {
      success: false,
      message: "Select a credit balance before recording a settlement.",
    };
  }

  if (!Number.isFinite(settlementAmount) || settlementAmount <= 0) {
    return {
      success: false,
      message: "Settlement amount must be greater than zero.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();
  const now = new Date().toISOString();

  try {
    const existingAccount = await databases.getDocument(
      config.databaseId,
      COLLECTIONS.customerBalances,
      accountId,
    );

    if (existingAccount.account_type !== "credit") {
      return {
        success: false,
        message: "Selected account is not a credit balance.",
      };
    }

    const previousBalance = Number(existingAccount.balance_amount || 0);

    if (previousBalance <= 0) {
      return {
        success: false,
        message: "This credit balance is already fully settled.",
      };
    }

    if (settlementAmount > previousBalance) {
      return {
        success: false,
        message: "Settlement amount cannot exceed the current outstanding balance.",
      };
    }

    const nextBalance = Number((previousBalance - settlementAmount).toFixed(2));

    if (nextBalance > 0 && !nextPaymentDate) {
      return {
        success: false,
        message:
          "Next payment date is required when the settlement does not fully clear the outstanding balance.",
      };
    }

    const updatedAccount = await databases.updateDocument(
      config.databaseId,
      COLLECTIONS.customerBalances,
      existingAccount.$id,
      {
        balance_amount: nextBalance,
        due_date: nextBalance > 0 ? nextPaymentDate : "",
        updated_at: now,
        notes: settlementNotes || existingAccount.notes || "",
      },
    );

    await databases.createDocument(
      config.databaseId,
      COLLECTIONS.customerBalanceMovements,
      ID.unique(),
      {
        account_id: updatedAccount.$id,
        account_type: "credit",
        receipt_id: "",
        receipt_number: "",
        station_id: existingAccount.station_id || "",
        station_name: existingAccount.station_name || "",
        movement_date: now,
        direction: "debit",
        amount_delta: Number((-settlementAmount).toFixed(2)),
        quantity_delta: 0,
        balance_amount: nextBalance,
        balance_quantity: Number(existingAccount.balance_quantity || 0),
        due_date: nextBalance > 0 ? nextPaymentDate : "",
        actor_user_id: session.userId || "",
        actor_name: session.fullName || "System",
        reference_code: existingAccount.reference_code || "",
        notes: settlementNotes || "Credit settlement recorded from Balance Management.",
      },
    );

    await syncCreditReceiptStatuses(databases, config.databaseId, {
      accountId: updatedAccount.$id,
      nextBalance,
    });

    await createAuditLogRecord(databases, {
      actorUserId: session.userId || "",
      actorName: session.fullName || "System",
      action: "customer_balance.credit_settlement",
      entityType: "customer_balance",
      entityId: updatedAccount.$id,
      stationId: existingAccount.station_id || "",
      stationName: existingAccount.station_name || "",
      oldValue: JSON.stringify(existingAccount),
      newValue: JSON.stringify({
        ...existingAccount,
        balance_amount: nextBalance,
        due_date: nextBalance > 0 ? nextPaymentDate : "",
        updated_at: now,
      }),
    });

    revalidateBalances();

    return {
      success: true,
      accountId: updatedAccount.$id,
      message: "Credit settlement recorded successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Balance Management",
        genericLabel: "record this credit settlement",
        fallbackMessage: "Failed to record credit settlement.",
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

function normalizeDateOnlyInput(value) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return "";
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

async function findCustomerBalanceByReference(
  databases,
  databaseId,
  { accountType, referenceCode, excludeAccountId = "" },
) {
  if (!referenceCode) {
    return null;
  }

  const response = await databases.listDocuments(
    databaseId,
    COLLECTIONS.customerBalances,
    [
      Query.equal("account_type", accountType),
      Query.equal("reference_code", referenceCode),
      Query.limit(10),
    ],
  );

  return (response.documents || []).find(
    (document) => document.$id !== excludeAccountId,
  ) || null;
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
) {
  await databases.createDocument(
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
  );
}

function normalizeAccountType(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();
  return normalizedValue === "bulk-redeem" ? "bulk_redeem" : normalizedValue;
}

function normalizeProductCategory(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();
  return PRODUCT_CATEGORIES.has(normalizedValue) ? normalizedValue : "all";
}

function normalizeAccountStatus(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();
  return ACCOUNT_STATUSES.has(normalizedValue) ? normalizedValue : "active";
}

function revalidateBalances() {
  invalidateAppwriteCollectionCache([
    COLLECTIONS.customerBalances,
    COLLECTIONS.customerBalanceMovements,
    COLLECTIONS.salesReceipts,
  ]);
  revalidatePath("/balance-management");
  revalidatePath("/pos");
  revalidatePath("/fuel-sales");
  revalidatePath("/commodities-sales");
  revalidatePath("/cement");
  revalidatePath("/stations");
}

async function syncCreditReceiptStatuses(
  databases,
  databaseId,
  { accountId, nextBalance },
) {
  const movementResponse = await databases.listDocuments(
    databaseId,
    COLLECTIONS.customerBalanceMovements,
    [
      Query.equal("account_id", accountId),
      Query.equal("account_type", "credit"),
      Query.limit(5000),
    ],
  );

  const receiptIds = Array.from(
    new Set(
      (movementResponse.documents || [])
        .map((document) => `${document.receipt_id || ""}`.trim())
        .filter(Boolean),
    ),
  );

  if (receiptIds.length === 0) {
    return;
  }

  const paymentStatus = Number(nextBalance || 0) <= 0 ? "paid" : "partially_paid";

  for (let index = 0; index < receiptIds.length; index += 100) {
    const batch = receiptIds.slice(index, index + 100);
    const receiptResponse = await databases.listDocuments(
      databaseId,
      COLLECTIONS.salesReceipts,
      [Query.equal("$id", batch), Query.limit(batch.length)],
    );

    await Promise.all(
      (receiptResponse.documents || []).map((receipt) =>
        databases.updateDocument(databaseId, COLLECTIONS.salesReceipts, receipt.$id, {
          payment_status: paymentStatus,
        }),
      ),
    );
  }
}
