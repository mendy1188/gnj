"use server";

import { Client, Databases, ID, Query } from "appwrite";
import { revalidatePath, revalidateTag } from "next/cache";

import { requireModuleAccess } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { invalidateAppwriteCollectionCache } from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  inventoryItems: "inventory_items",
  priceHistory: "product_price_history",
  products: "products",
  stations: "stations",
};

const ACTIVE_STATUS = "active";
const INACTIVE_STATUS = "inactive";
const VALID_CATEGORIES = new Set(["fuel", "shop", "cement"]);

export async function createProductAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  const session = await requireModuleAccess("product-settings");
  const name = `${payload?.name || ""}`.trim();
  const category = `${payload?.category || ""}`.trim().toLowerCase();
  const unit = `${payload?.unit || ""}`.trim().toLowerCase();
  const description = `${payload?.description || ""}`.trim();
  const price = Number(payload?.price || 0);
  const reorderLevel = Number(payload?.reorderLevel || 0);
  const sku = buildProductSku(category, name);

  if (!name || !unit) {
    return {
      success: false,
      message: "Name and unit are required.",
    };
  }

  if (!VALID_CATEGORIES.has(category)) {
    return {
      success: false,
      message: "Select a valid product category.",
    };
  }

  if (!Number.isFinite(price) || price < 0) {
    return {
      success: false,
      message: "Price must be a valid non-negative number.",
    };
  }

  if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
    return {
      success: false,
      message: "Reorder level must be a valid non-negative number.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    const duplicateBySku = await databases.listDocuments(
      config.databaseId,
      COLLECTIONS.products,
      [Query.equal("sku", sku), Query.limit(1)],
    );

    if (duplicateBySku.documents?.length) {
      return {
        success: false,
        message: `A product with generated SKU ${sku} already exists.`,
      };
    }

    const duplicateByName = await databases.listDocuments(
      config.databaseId,
      COLLECTIONS.products,
      [Query.equal("name", name), Query.limit(1)],
    );

    if (duplicateByName.documents?.length) {
      return {
        success: false,
        message: "A product with that name already exists.",
      };
    }

    const createdAt = new Date().toISOString();
    const productId = ID.unique();

    await databases.createDocument(config.databaseId, COLLECTIONS.products, productId, {
      name,
      sku,
      category,
      unit,
      status: ACTIVE_STATUS,
      selling_price: Number(price.toFixed(2)),
      description,
    });

    await databases.createDocument(
      config.databaseId,
      COLLECTIONS.priceHistory,
      ID.unique(),
      {
        product_id: productId,
        product_name: name,
        previous_price: 0,
        new_price: Number(price.toFixed(2)),
        changed_at: createdAt,
        changed_by_user_id: session.userId || "",
        changed_by_name: session.fullName || "System",
        notes: "Initial product price.",
      },
    );

    const stations = await listAllDocuments(databases, config.databaseId, COLLECTIONS.stations);

    await Promise.all(
      stations.map((station) =>
        databases.createDocument(config.databaseId, COLLECTIONS.inventoryItems, ID.unique(), {
          station_id: station.$id,
          station_name: station.name || "",
          product_id: productId,
          product_name: name,
          category,
          quantity: 0,
          unit,
          reorder_level: Number(reorderLevel.toFixed(2)),
          status: "out",
          last_updated_at: createdAt,
        }),
      ),
    );

    revalidateProductSettings();

    return {
      success: true,
      message: `${name} created successfully.`,
      productId,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Product Settings",
        genericLabel: "create this product",
        fallbackMessage: "Failed to create product.",
      }),
    };
  }
}

export async function updateProductReorderLevelAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  await requireModuleAccess("product-settings");

  const productId = `${payload?.productId || ""}`.trim();
  const reorderLevel = Number(payload?.reorderLevel || 0);

  if (!productId) {
    return {
      success: false,
      message: "Select a product before updating reorder level.",
    };
  }

  if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
    return {
      success: false,
      message: "Enter a valid non-negative reorder level.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    const product = await databases.getDocument(
      config.databaseId,
      COLLECTIONS.products,
      productId,
    );
    const inventoryItems = await listAllDocuments(
      databases,
      config.databaseId,
      COLLECTIONS.inventoryItems,
      [Query.equal("product_id", productId)],
    );
    const normalizedReorderLevel = Number(reorderLevel.toFixed(2));

    if (inventoryItems.length === 0) {
      return {
        success: false,
        message: "No inventory records were found for this product.",
      };
    }

    const isUnchanged = inventoryItems.every(
      (item) => Number(item.reorder_level || 0) === normalizedReorderLevel,
    );

    if (isUnchanged) {
      return {
        success: false,
        message: "New reorder level matches the current value.",
      };
    }

    const updatedAt = new Date().toISOString();

    await Promise.all(
      inventoryItems.map((item) =>
        databases.updateDocument(
          config.databaseId,
          COLLECTIONS.inventoryItems,
          item.$id,
          {
            reorder_level: normalizedReorderLevel,
            status: getInventoryStatus(
              Number(item.quantity || 0),
              normalizedReorderLevel,
            ),
            last_updated_at: updatedAt,
          },
        ),
      ),
    );

    revalidateProductSettings();

    return {
      success: true,
      message: `${product.name || "Product"} reorder level updated to ${normalizedReorderLevel.toLocaleString()}.`,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Product Settings",
        genericLabel: "update this reorder level",
        fallbackMessage: "Failed to update reorder level.",
      }),
    };
  }
}

export async function updateProductPriceAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  const session = await requireModuleAccess("product-settings");
  const productId = `${payload?.productId || ""}`.trim();
  const newPrice = Number(payload?.newPrice || 0);
  const notes = `${payload?.notes || ""}`.trim();

  if (!productId) {
    return {
      success: false,
      message: "Select a product before updating price.",
    };
  }

  if (!Number.isFinite(newPrice) || newPrice < 0) {
    return {
      success: false,
      message: "Enter a valid non-negative selling price.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    const product = await databases.getDocument(
      config.databaseId,
      COLLECTIONS.products,
      productId,
    );
    const currentPrice = Number(product.selling_price || 0);
    const normalizedNewPrice = Number(newPrice.toFixed(2));

    if (currentPrice === normalizedNewPrice) {
      return {
        success: false,
        message: "New price matches the current selling price.",
      };
    }

    const changedAt = new Date().toISOString();

    await databases.updateDocument(config.databaseId, COLLECTIONS.products, productId, {
      selling_price: normalizedNewPrice,
    });

    await databases.createDocument(
      config.databaseId,
      COLLECTIONS.priceHistory,
      ID.unique(),
      {
        product_id: product.$id,
        product_name: product.name || "",
        previous_price: Number(currentPrice.toFixed(2)),
        new_price: normalizedNewPrice,
        changed_at: changedAt,
        changed_by_user_id: session.userId || "",
        changed_by_name: session.fullName || "System",
        notes,
      },
    );

    revalidateProductSettings();

    return {
      success: true,
      message: `${product.name || "Product"} price updated.`,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Product Settings",
        genericLabel: "update this product price",
        fallbackMessage: "Failed to update price.",
      }),
    };
  }
}

export async function toggleProductStatusAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  await requireModuleAccess("product-settings");

  const productId = `${payload?.productId || ""}`.trim();

  if (!productId) {
    return {
      success: false,
      message: "Select a product before changing status.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    const product = await databases.getDocument(
      config.databaseId,
      COLLECTIONS.products,
      productId,
    );
    const nextStatus =
      `${product.status || ACTIVE_STATUS}` === ACTIVE_STATUS
        ? INACTIVE_STATUS
        : ACTIVE_STATUS;

    await databases.updateDocument(config.databaseId, COLLECTIONS.products, productId, {
      status: nextStatus,
    });

    revalidateProductSettings();

    return {
      success: true,
      message: `${product.name || "Product"} is now ${nextStatus}.`,
      status: nextStatus,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Product Settings",
        genericLabel: "update this product status",
        fallbackMessage: "Failed to update product status.",
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

function buildProductSku(category, name) {
  const normalizedCategory = `${category || ""}`
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const normalizedName = `${name || ""}`
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return [normalizedCategory, normalizedName].filter(Boolean).join("-");
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

function revalidateProductSettings() {
  invalidateAppwriteCollectionCache([
    COLLECTIONS.products,
    COLLECTIONS.priceHistory,
    COLLECTIONS.inventoryItems,
    COLLECTIONS.stations,
  ]);
  revalidateTag("products-data");
  revalidateTag("inventory-data");
  revalidateTag("product-settings-data");
  revalidateTag("product-price-history-data");
  revalidatePath("/product-settings");
  revalidatePath("/inventory");
  revalidatePath("/incoming-stock");
  revalidatePath("/pos");
  revalidatePath("/dashboard");
}
