"use server";

import { Client, Databases, ID, Query } from "appwrite";
import { revalidatePath } from "next/cache";

import {
  buildBulkFuelPurchaseReference,
  normalizeBulkFuelPhone,
} from "@/features/bulk-fuel/helpers";
import { requireModuleAccess } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { invalidateAppwriteCollectionCache } from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  bulkFuelClients: "bulk_fuel_clients",
  customerBalances: "customer_balances",
  customerBalanceMovements: "customer_balance_movements",
};

const CLIENT_STATUSES = new Set(["active", "inactive"]);
const PURCHASE_STATUSES = new Set(["active", "inactive", "suspended"]);

export async function createBulkFuelClientAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  await requireModuleAccess("bulk-fuel-purchase-settings");

  const values = normalizeClientPayload(payload);

  if (!values.success) {
    return values;
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();
  const now = new Date().toISOString();

  try {
    const existingClient = await findBulkFuelClientByPhone(
      databases,
      config.databaseId,
      values.phone,
    );

    if (existingClient) {
      return {
        success: false,
        message: "A bulk fuel client with that phone number already exists.",
      };
    }

    const clientDocument = await databases.createDocument(
      config.databaseId,
      COLLECTIONS.bulkFuelClients,
      ID.unique(),
      {
        name: values.name,
        phone: values.phone,
        address: values.address,
        date_joined: values.dateJoined,
        status: values.status,
        notes: values.notes,
        created_at: now,
        updated_at: now,
      },
    );

    revalidateBulkFuelPages();

    return {
      success: true,
      clientId: clientDocument.$id,
      message: "Bulk fuel client created successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Bulk Fuel Purchase Settings",
        genericLabel: "create this bulk fuel client",
        fallbackMessage: "Failed to create bulk fuel client.",
      }),
    };
  }
}

export async function updateBulkFuelClientAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  await requireModuleAccess("bulk-fuel-purchase-settings");

  const clientId = `${payload?.clientId || ""}`.trim();

  if (!clientId) {
    return {
      success: false,
      message: "Select a bulk fuel client before updating.",
    };
  }

  const values = normalizeClientPayload(payload);

  if (!values.success) {
    return values;
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    const existingClient = await databases.getDocument(
      config.databaseId,
      COLLECTIONS.bulkFuelClients,
      clientId,
    );
    const duplicateClient = await findBulkFuelClientByPhone(
      databases,
      config.databaseId,
      values.phone,
    );

    if (duplicateClient && duplicateClient.$id !== clientId) {
      return {
        success: false,
        message: "Another bulk fuel client already uses that phone number.",
      };
    }

    await databases.updateDocument(
      config.databaseId,
      COLLECTIONS.bulkFuelClients,
      clientId,
      {
        name: values.name,
        phone: values.phone,
        address: values.address,
        date_joined: values.dateJoined,
        status: values.status,
        notes: values.notes,
        updated_at: new Date().toISOString(),
      },
    );

    const previousPhone = normalizeBulkFuelPhone(existingClient.phone);

    if (
      previousPhone &&
      previousPhone !== values.phone &&
      `${existingClient.status || ""}`.trim()
    ) {
      const linkedPurchases = await listBulkFuelPurchasesByPhone(
        databases,
        config.databaseId,
        previousPhone,
      );

      await Promise.all(
        linkedPurchases.map((purchase) =>
          databases.updateDocument(
            config.databaseId,
            COLLECTIONS.customerBalances,
            purchase.$id,
            {
              customer_name: values.name,
              customer_phone: values.phone,
              updated_at: new Date().toISOString(),
            },
          ),
        ),
      );
    } else {
      const linkedPurchases = await listBulkFuelPurchasesByPhone(
        databases,
        config.databaseId,
        values.phone,
      );

      await Promise.all(
        linkedPurchases.map((purchase) =>
          databases.updateDocument(
            config.databaseId,
            COLLECTIONS.customerBalances,
            purchase.$id,
            {
              customer_name: values.name,
              customer_phone: values.phone,
              updated_at: new Date().toISOString(),
            },
          ),
        ),
      );
    }

    revalidateBulkFuelPages();

    return {
      success: true,
      clientId,
      message: "Bulk fuel client updated successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Bulk Fuel Purchase Settings",
        genericLabel: "update this bulk fuel client",
        fallbackMessage: "Failed to update bulk fuel client.",
      }),
    };
  }
}

export async function createBulkFuelPurchaseAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  const session = await requireModuleAccess("bulk-fuel-purchase-settings");
  const clientId = `${payload?.clientId || ""}`.trim();
  const purchaseDate = normalizeDateInput(payload?.purchaseDate);
  const productId = `${payload?.productId || ""}`.trim();
  const productName = `${payload?.productName || ""}`.trim();
  const productCategory = `${payload?.productCategory || ""}`.trim().toLowerCase();
  const status = normalizePurchaseStatus(payload?.status);
  const notes = `${payload?.notes || ""}`.trim();
  const rawAmount = Number(payload?.purchaseAmount ?? 0);
  const purchaseAmount = Number.isFinite(rawAmount)
    ? Number(rawAmount.toFixed(2))
    : Number.NaN;

  if (!clientId) {
    return {
      success: false,
      message: "Select a client first.",
    };
  }

  if (!purchaseDate) {
    return {
      success: false,
      message: "Purchase date is required.",
    };
  }

  if (!productId || !productName || productCategory !== "fuel") {
    return {
      success: false,
      message: "Select a valid fuel product for this purchase.",
    };
  }

  if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
    return {
      success: false,
      message: "Purchase amount must be greater than zero.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    const clientDocument = await databases.getDocument(
      config.databaseId,
      COLLECTIONS.bulkFuelClients,
      clientId,
    );

    if (`${clientDocument.status || ""}`.trim().toLowerCase() !== "active") {
      return {
        success: false,
        message: "Only active clients can receive new bulk fuel purchases.",
      };
    }

    const referenceCode =
      `${payload?.referenceCode || ""}`.trim() ||
      buildBulkFuelPurchaseReference({
        clientPhone: clientDocument.phone,
        productName,
        purchaseDate,
      });

    const duplicatePurchase = await findBulkFuelPurchaseByReference(
      databases,
      config.databaseId,
      referenceCode,
    );

    if (duplicatePurchase) {
      return {
        success: false,
        message: "Another bulk fuel purchase already uses that reference code.",
      };
    }

    const purchaseTimestamp = toPurchaseTimestamp(purchaseDate);
    const purchaseDocument = await databases.createDocument(
      config.databaseId,
      COLLECTIONS.customerBalances,
      ID.unique(),
      {
        account_type: "bulk_redeem",
        reference_code: referenceCode,
        customer_name: clientDocument.name || "",
        customer_phone: clientDocument.phone || "",
        station_id: "",
        station_name: "",
        product_id: productId,
        product_name: productName,
        product_category: "fuel",
        balance_amount: purchaseAmount,
        balance_quantity: 0,
        unit: "",
        status,
        created_at: purchaseTimestamp,
        updated_at: purchaseTimestamp,
        notes,
      },
    );

    await databases.createDocument(
      config.databaseId,
      COLLECTIONS.customerBalanceMovements,
      ID.unique(),
      {
        account_id: purchaseDocument.$id,
        account_type: "bulk_redeem",
        receipt_id: "",
        receipt_number: "",
        station_id: "",
        station_name: "",
        product_id: productId,
        product_name: productName,
        movement_date: purchaseTimestamp,
        direction: "credit",
        amount_delta: purchaseAmount,
        quantity_delta: 0,
        balance_amount: purchaseAmount,
        balance_quantity: 0,
        actor_user_id: session.userId || "",
        actor_name: session.fullName || "System",
        reference_code: referenceCode,
        notes: notes || "Bulk fuel purchase created from settings.",
      },
    );

    revalidateBulkFuelPages();

    return {
      success: true,
      purchaseId: purchaseDocument.$id,
      message: "Bulk fuel purchase created successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Bulk Fuel Purchase Settings",
        genericLabel: "create this bulk fuel purchase",
        fallbackMessage: "Failed to create bulk fuel purchase.",
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

function normalizeClientPayload(payload) {
  const name = `${payload?.name || ""}`.trim();
  const phone = normalizeBulkFuelPhone(payload?.phone);
  const address = `${payload?.address || ""}`.trim();
  const dateJoined = normalizeDateInput(payload?.dateJoined);
  const status = normalizeClientStatus(payload?.status);
  const notes = `${payload?.notes || ""}`.trim();

  if (!name) {
    return {
      success: false,
      message: "Client name is required.",
    };
  }

  if (!phone) {
    return {
      success: false,
      message: "Client phone number is required.",
    };
  }

  if (!address) {
    return {
      success: false,
      message: "Client address is required.",
    };
  }

  if (!dateJoined) {
    return {
      success: false,
      message: "Date joined is required.",
    };
  }

  return {
    success: true,
    name,
    phone,
    address,
    dateJoined,
    status,
    notes,
  };
}

function normalizeDateInput(value) {
  const normalizedValue = `${value || ""}`.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

function toPurchaseTimestamp(dateValue) {
  return new Date(`${dateValue}T12:00:00.000Z`).toISOString();
}

function normalizeClientStatus(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();
  return CLIENT_STATUSES.has(normalizedValue) ? normalizedValue : "active";
}

function normalizePurchaseStatus(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();
  return PURCHASE_STATUSES.has(normalizedValue) ? normalizedValue : "active";
}

async function findBulkFuelClientByPhone(databases, databaseId, phone) {
  const response = await databases.listDocuments(
    databaseId,
    COLLECTIONS.bulkFuelClients,
    [Query.equal("phone", phone), Query.limit(1)],
  );

  return response.documents?.[0] || null;
}

async function listBulkFuelPurchasesByPhone(databases, databaseId, phone) {
  const response = await databases.listDocuments(
    databaseId,
    COLLECTIONS.customerBalances,
    [
      Query.equal("account_type", "bulk_redeem"),
      Query.equal("customer_phone", phone),
      Query.limit(1000),
    ],
  );

  return Array.isArray(response?.documents) ? response.documents : [];
}

async function findBulkFuelPurchaseByReference(databases, databaseId, referenceCode) {
  const response = await databases.listDocuments(
    databaseId,
    COLLECTIONS.customerBalances,
    [
      Query.equal("account_type", "bulk_redeem"),
      Query.equal("reference_code", referenceCode),
      Query.limit(1),
    ],
  );

  return response.documents?.[0] || null;
}

function revalidateBulkFuelPages() {
  invalidateAppwriteCollectionCache([
    COLLECTIONS.bulkFuelClients,
    COLLECTIONS.customerBalances,
    COLLECTIONS.customerBalanceMovements,
  ]);
  revalidatePath("/bulk-fuel-purchases");
  revalidatePath("/bulk-fuel-purchase-settings");
  revalidatePath("/balance-management");
  revalidatePath("/pos");
}
