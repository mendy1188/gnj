"use server";

import { Client, Databases, ID, Query } from "appwrite";
import { revalidatePath, revalidateTag } from "next/cache";

import { requireCurrentSession } from "@/features/auth/server";
import { filterInventoryRecordsForSession } from "@/features/auth/scopes";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { STATION_PRODUCT_DAILY_SUMMARY_COLLECTION, upsertStationProductDailySummary } from "@/features/reports/station-product-summary";
import { invalidateAppwriteCollectionCache } from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  inventoryItems: "inventory_items",
  incomingStockRecords: "incoming_stock_records",
  fuelDeliveries: "fuel_deliveries",
  stationProductDailySummary: STATION_PRODUCT_DAILY_SUMMARY_COLLECTION,
};

export async function recordIncomingStockAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  const session = await requireCurrentSession();

  if (!session.modules?.includes("incoming-stock")) {
    return {
      success: false,
      message: "You do not have access to Incoming Stock.",
    };
  }

  const inventoryItemId = `${payload?.inventoryItemId || ""}`.trim();
  const quantityAdded = Number(payload?.quantityAdded || 0);
  const notes = `${payload?.notes || ""}`.trim();

  if (!inventoryItemId) {
    return {
      success: false,
      message: "Select a stock record before recording stock.",
    };
  }

  if (!Number.isFinite(quantityAdded) || quantityAdded <= 0) {
    return {
      success: false,
      message: "Incoming stock quantity must be greater than zero.",
    };
  }

  const databases = createServerDatabases();
  const config = getServerAppwriteConfig();

  try {
    const inventoryDocument = await databases.getDocument(
      config.databaseId,
      COLLECTIONS.inventoryItems,
      inventoryItemId,
    );
    const allowedInventory = filterInventoryRecordsForSession(
      [
        {
          id: inventoryDocument.$id,
          station: inventoryDocument.station_name || "",
        },
      ],
      session,
    );

    if (allowedInventory.length === 0) {
      return {
        success: false,
        message: "You do not have access to update this branch stock.",
      };
    }

    const previousQuantity = Number(inventoryDocument.quantity || 0);
    const newQuantity = previousQuantity + quantityAdded;
    const reorderLevel = Number(inventoryDocument.reorder_level || 0);
    const recordedAt = new Date().toISOString();
    const canWriteStationProductSummary = await isCollectionReady(
      databases,
      COLLECTIONS.stationProductDailySummary,
    );

    await databases.createDocument(
      config.databaseId,
      COLLECTIONS.incomingStockRecords,
      ID.unique(),
      {
        inventory_item_id: inventoryDocument.$id,
        station_id: inventoryDocument.station_id || "",
        station_name: inventoryDocument.station_name || "",
        product_id: inventoryDocument.product_id || "",
        product_name: inventoryDocument.product_name || "",
        quantity_added: quantityAdded,
        previous_quantity: previousQuantity,
        new_quantity: newQuantity,
        unit: inventoryDocument.unit || "",
        recorded_at: recordedAt,
        recorded_by: session.fullName || "",
        notes,
      },
    );

    await databases.updateDocument(
      config.databaseId,
      COLLECTIONS.inventoryItems,
      inventoryDocument.$id,
      {
        quantity: newQuantity,
        status: getInventoryStatus(newQuantity, reorderLevel),
        last_updated_at: recordedAt,
      },
    );

    if (canWriteStationProductSummary) {
      await upsertStationProductDailySummary(databases, {
        date: recordedAt,
        stationId: inventoryDocument.station_id || "",
        stationName: inventoryDocument.station_name || "",
        productId: inventoryDocument.product_id || "",
        productName: inventoryDocument.product_name || "",
        category: inventoryDocument.category || "",
        unit: inventoryDocument.unit || "",
        receivedQuantityDelta: quantityAdded,
      });
    }

    if (isFuelDeliveryProduct(inventoryDocument.product_name)) {
      await createFuelDeliveryRecord(databases, config.databaseId, {
        stationId: inventoryDocument.station_id || "",
        stationName: inventoryDocument.station_name || "",
        productId: inventoryDocument.product_id || "",
        productName: inventoryDocument.product_name || "",
        quantity: quantityAdded,
        unit: inventoryDocument.unit || "",
        deliveryDate: recordedAt,
        recordedBy: session.fullName || "",
        notes,
      });
    }

    invalidateAppwriteCollectionCache([
      COLLECTIONS.inventoryItems,
      COLLECTIONS.incomingStockRecords,
      COLLECTIONS.fuelDeliveries,
      COLLECTIONS.stationProductDailySummary,
    ]);
    revalidateTag("inventory-data");
    revalidateTag("incoming-stock-data");
    revalidateTag("dashboard-data");
    revalidatePath("/inventory");
    revalidatePath("/incoming-stock");
    revalidatePath("/fuel-deliveries");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `Recorded ${quantityAdded.toLocaleString()} ${inventoryDocument.unit || "units"} for ${inventoryDocument.product_name || "stock item"}.`,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Incoming Stock",
        genericLabel: "record this incoming stock",
        fallbackMessage: "Failed to record incoming stock.",
      }),
    };
  }
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

function createServerDatabases() {
  const config = getServerAppwriteConfig();
  const client = new Client()
    .setEndpoint(config.apiBaseUrl)
    .setProject(config.projectId);
  client.headers["X-Appwrite-Key"] = config.apiKey;
  return new Databases(client);
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

function isNotFoundError(error) {
  return (
    `${error?.code || ""}` === "404" ||
    `${error?.type || ""}` === "document_not_found" ||
    `${error?.type || ""}` === "collection_not_found"
  );
}

function isFuelDeliveryProduct(productName) {
  const normalizedName = `${productName || ""}`.trim().toLowerCase();

  return normalizedName === "diesel" || normalizedName === "petrol";
}

async function createFuelDeliveryRecord(
  databases,
  databaseId,
  {
    stationId,
    stationName,
    productId,
    productName,
    quantity,
    unit,
    deliveryDate,
    recordedBy,
    notes,
  },
) {
  const referenceNo = buildFuelDeliveryReferenceNo(productName, deliveryDate);
  const normalizedRecordedBy = `${recordedBy || ""}`.trim();
  const normalizedNotes = buildFuelDeliveryNotes(normalizedRecordedBy, notes);
  const payload = {
    station_id: stationId,
    station_name: stationName,
    product_id: productId,
    product_name: productName,
    delivery_date: deliveryDate,
    quantity,
    unit,
    status: "delivered",
    supplier: "Incoming Stock",
    reference_no: referenceNo,
    driver_name: "",
    recorded_by: normalizedRecordedBy,
    notes: normalizedNotes,
  };

  try {
    await databases.createDocument(
      databaseId,
      COLLECTIONS.fuelDeliveries,
      ID.unique(),
      payload,
    );
  } catch (error) {
    if (!isUnknownAttributeError(error, "recorded_by")) {
      throw error;
    }

    const { recorded_by, ...legacyPayload } = payload;

    await databases.createDocument(
      databaseId,
      COLLECTIONS.fuelDeliveries,
      ID.unique(),
      legacyPayload,
    );
  }
}

function buildFuelDeliveryReferenceNo(productName, deliveryDate) {
  const normalizedProductName = `${productName || ""}`
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  const normalizedTimestamp = `${deliveryDate || ""}`
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);

  return `INC-${normalizedProductName || "FUEL"}-${normalizedTimestamp || "NOW"}`.slice(
    0,
    128,
  );
}

function buildFuelDeliveryNotes(recordedBy, notes) {
  const parts = [];

  if (recordedBy) {
    parts.push(`Recorded by: ${recordedBy}`);
  }

  if (`${notes || ""}`.trim()) {
    parts.push(`${notes}`.trim());
  }

  return parts.join(" · ").slice(0, 2000);
}

function isUnknownAttributeError(error, attributeName) {
  const message = `${error?.message || ""}`.toLowerCase();
  const type = `${error?.type || ""}`.toLowerCase();
  const normalizedAttribute = `${attributeName || ""}`.toLowerCase();

  return (
    message.includes(normalizedAttribute) &&
    (message.includes("unknown") || message.includes("attribute")) ||
    type.includes("attribute_unknown")
  );
}
