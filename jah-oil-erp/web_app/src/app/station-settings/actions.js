"use server";

import { Client, Databases, ID, Query } from "appwrite";
import { revalidatePath, revalidateTag } from "next/cache";

import { requireModuleAccess } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { invalidateAppwriteCollectionCache } from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  stations: "stations",
  products: "products",
  inventoryItems: "inventory_items",
  users: "app_users",
  incomingStockRecords: "incoming_stock_records",
  fuelDeliveries: "fuel_deliveries",
  salesReceipts: "sales_receipts",
  salesReceiptItems: "sales_receipt_items",
};

const VALID_STATION_STATUSES = new Set(["active", "inactive", "maintenance"]);

export async function createStationAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  await requireModuleAccess("station-settings");
  const values = normalizeStationPayload(payload);

  if (!values.success) {
    return values;
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    const duplicateCode = await databases.listDocuments(
      config.databaseId,
      COLLECTIONS.stations,
      [Query.equal("code", values.code), Query.limit(1)],
    );

    if (duplicateCode.documents?.length) {
      return {
        success: false,
        message: "A station with that code already exists.",
      };
    }

    const duplicateName = await databases.listDocuments(
      config.databaseId,
      COLLECTIONS.stations,
      [Query.equal("name", values.name), Query.limit(1)],
    );

    if (duplicateName.documents?.length) {
      return {
        success: false,
        message: "A station with that name already exists.",
      };
    }

    const stationId = ID.unique();
    const timestamp = new Date().toISOString();

    await databases.createDocument(config.databaseId, COLLECTIONS.stations, stationId, {
      name: values.name,
      code: values.code,
      location: values.location,
      status: values.status,
      manager_name: values.managerName,
      manager_phone: values.managerPhone,
      latitude: values.latitude,
      longitude: values.longitude,
    });

    const [products, inventoryItems] = await Promise.all([
      listAllDocuments(databases, config.databaseId, COLLECTIONS.products),
      listAllDocuments(databases, config.databaseId, COLLECTIONS.inventoryItems),
    ]);
    const reorderLevelByProductId = buildReorderLevelByProductId(inventoryItems);

    await Promise.all(
      products.map((product) =>
        databases.createDocument(config.databaseId, COLLECTIONS.inventoryItems, ID.unique(), {
          station_id: stationId,
          station_name: values.name,
          product_id: product.$id,
          product_name: product.name || "",
          category: product.category || "shop",
          quantity: 0,
          unit: product.unit || "unit",
          reorder_level: reorderLevelByProductId.get(product.$id) || 0,
          status: "out",
          last_updated_at: timestamp,
        }),
      ),
    );

    revalidateStationSettings();

    return {
      success: true,
      message: `${values.name} created successfully.`,
      stationId,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Station Settings",
        genericLabel: "create this station",
        fallbackMessage: "Failed to create station.",
      }),
    };
  }
}

export async function updateStationAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  await requireModuleAccess("station-settings");

  const stationId = `${payload?.stationId || ""}`.trim();

  if (!stationId) {
    return {
      success: false,
      message: "Select a station before editing it.",
    };
  }

  const values = normalizeStationPayload(payload);

  if (!values.success) {
    return values;
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    const existingStation = await databases.getDocument(
      config.databaseId,
      COLLECTIONS.stations,
      stationId,
    );

    const [duplicateCode, duplicateName] = await Promise.all([
      databases.listDocuments(config.databaseId, COLLECTIONS.stations, [
        Query.equal("code", values.code),
        Query.limit(10),
      ]),
      databases.listDocuments(config.databaseId, COLLECTIONS.stations, [
        Query.equal("name", values.name),
        Query.limit(10),
      ]),
    ]);

    if (
      (duplicateCode.documents || []).some((document) => document.$id !== stationId)
    ) {
      return {
        success: false,
        message: "A station with that code already exists.",
      };
    }

    if (
      (duplicateName.documents || []).some((document) => document.$id !== stationId)
    ) {
      return {
        success: false,
        message: "A station with that name already exists.",
      };
    }

    await databases.updateDocument(config.databaseId, COLLECTIONS.stations, stationId, {
      name: values.name,
      code: values.code,
      location: values.location,
      status: values.status,
      manager_name: values.managerName,
      manager_phone: values.managerPhone,
      latitude: values.latitude,
      longitude: values.longitude,
    });

    if ((existingStation.name || "") !== values.name) {
      await renameStationAcrossCollections(
        databases,
        config.databaseId,
        stationId,
        values.name,
      );
    }

    revalidateStationSettings();

    return {
      success: true,
      message: `${values.name} updated successfully.`,
      stationId,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Station Settings",
        genericLabel: "update this station",
        fallbackMessage: "Failed to update station.",
      }),
    };
  }
}

function normalizeStationPayload(payload) {
  const name = `${payload?.name || ""}`.trim();
  const code = `${payload?.code || ""}`.trim().toUpperCase();
  const location = `${payload?.location || ""}`.trim();
  const status = `${payload?.status || "active"}`.trim().toLowerCase();
  const managerName = `${payload?.managerName || ""}`.trim();
  const managerPhone = `${payload?.managerPhone || ""}`.trim();
  const latitude = toNullableNumber(payload?.latitude);
  const longitude = toNullableNumber(payload?.longitude);

  if (!name || !code || !location) {
    return {
      success: false,
      message: "Name, code, and location are required.",
    };
  }

  if (!VALID_STATION_STATUSES.has(status)) {
    return {
      success: false,
      message: "Select a valid station status.",
    };
  }

  return {
    success: true,
    name,
    code,
    location,
    status,
    managerName,
    managerPhone,
    latitude,
    longitude,
  };
}

async function renameStationAcrossCollections(
  databases,
  databaseId,
  stationId,
  stationName,
) {
  const [
    inventoryItems,
    incomingStockRecords,
    fuelDeliveries,
    salesReceipts,
    salesReceiptItems,
    users,
  ] = await Promise.all([
    listAllDocuments(databases, databaseId, COLLECTIONS.inventoryItems, [
      Query.equal("station_id", stationId),
    ]),
    listAllDocuments(databases, databaseId, COLLECTIONS.incomingStockRecords, [
      Query.equal("station_id", stationId),
    ]),
    listAllDocuments(databases, databaseId, COLLECTIONS.fuelDeliveries, [
      Query.equal("station_id", stationId),
    ]),
    listAllDocuments(databases, databaseId, COLLECTIONS.salesReceipts, [
      Query.equal("station_id", stationId),
    ]),
    listAllDocuments(databases, databaseId, COLLECTIONS.salesReceiptItems, [
      Query.equal("station_id", stationId),
    ]),
    listAllDocuments(databases, databaseId, COLLECTIONS.users, [
      Query.equal("branch_station_id", stationId),
    ]),
  ]);

  await Promise.all([
    updateDocumentsInChunks(databases, databaseId, COLLECTIONS.inventoryItems, inventoryItems, {
      station_name: stationName,
    }),
    updateDocumentsInChunks(
      databases,
      databaseId,
      COLLECTIONS.incomingStockRecords,
      incomingStockRecords,
      { station_name: stationName },
    ),
    updateDocumentsInChunks(databases, databaseId, COLLECTIONS.fuelDeliveries, fuelDeliveries, {
      station_name: stationName,
    }),
    updateDocumentsInChunks(databases, databaseId, COLLECTIONS.salesReceipts, salesReceipts, {
      station_name: stationName,
    }),
    updateDocumentsInChunks(
      databases,
      databaseId,
      COLLECTIONS.salesReceiptItems,
      salesReceiptItems,
      { station_name: stationName },
    ),
    updateDocumentsInChunks(databases, databaseId, COLLECTIONS.users, users, {
      branch_station_name: stationName,
    }),
  ]);
}

function createServerDatabases() {
  const config = getServerAppwriteConfig();
  const client = new Client()
    .setEndpoint(config.apiBaseUrl)
    .setProject(config.projectId);
  client.headers["X-Appwrite-Key"] = config.apiKey;
  return new Databases(client);
}

async function listAllDocuments(databases, databaseId, collectionId, extraQueries = []) {
  const documents = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (documents.length < total) {
    const response = await databases.listDocuments(databaseId, collectionId, [
      ...extraQueries,
      Query.limit(100),
      Query.offset(offset),
    ]);
    const batch = response.documents || [];

    documents.push(...batch);
    total = response.total ?? batch.length;

    if (batch.length < 100) {
      break;
    }

    offset += 100;
  }

  return documents;
}

async function updateDocumentsInChunks(
  databases,
  databaseId,
  collectionId,
  documents,
  payload,
  chunkSize = 50,
) {
  for (let index = 0; index < documents.length; index += chunkSize) {
    const batch = documents.slice(index, index + chunkSize);

    await Promise.all(
      batch.map((document) =>
        databases.updateDocument(databaseId, collectionId, document.$id, payload),
      ),
    );
  }
}

function buildReorderLevelByProductId(inventoryItems) {
  return inventoryItems.reduce((map, inventoryItem) => {
    if (!map.has(inventoryItem.product_id || "")) {
      map.set(
        inventoryItem.product_id || "",
        Number(inventoryItem.reorder_level || 0),
      );
    }

    return map;
  }, new Map());
}

function toNullableNumber(value) {
  if (value === null || value === undefined || `${value}`.trim() === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function revalidateStationSettings() {
  invalidateAppwriteCollectionCache([
    COLLECTIONS.stations,
    COLLECTIONS.inventoryItems,
    COLLECTIONS.incomingStockRecords,
    COLLECTIONS.fuelDeliveries,
    COLLECTIONS.salesReceipts,
    COLLECTIONS.salesReceiptItems,
  ]);
  revalidateTag("stations-data");
  revalidateTag("inventory-data");
  revalidateTag("incoming-stock-data");
  revalidateTag("fuel-deliveries-data");
  revalidateTag("dashboard-data");
  revalidatePath("/station-settings");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/stations");
  revalidatePath("/inventory");
  revalidatePath("/incoming-stock");
  revalidatePath("/fuel-deliveries");
  revalidatePath("/fuel-sales");
  revalidatePath("/cement");
  revalidatePath("/commodities-sales");
  revalidatePath("/reports");
  revalidatePath("/pos");
}
