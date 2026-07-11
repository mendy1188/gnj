#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";

import { Client, Databases, Query } from "appwrite";

import {
  createAdminConfig,
  loadEnvFiles,
  parseArgs,
  validateAdminConfig,
} from "./lib/appwrite-admin.mjs";

const COLLECTIONS = {
  roles: "app_roles",
  users: "app_users",
  stations: "stations",
  products: "products",
  inventoryItems: "inventory_items",
  incomingStockRecords: "incoming_stock_records",
  fuelDeliveries: "fuel_deliveries",
  salesReceipts: "sales_receipts",
  salesReceiptItems: "sales_receipt_items",
  stationDailySummary: "station_daily_summary",
  cashierDailySummary: "cashier_daily_summary",
};

const PAYMENT_METHODS = ["cash", "card", "transfer", "mixed"];
const DEFAULT_PASSWORD = "password";
const TEAM_SEED_NAMESPACE = "banjul-brikama-team-seed-v1";
const SUMMARY_DELETE_BATCH_SIZE = 25;
const SUMMARY_CREATE_BATCH_SIZE = 25;

const TARGET_USERS = [
  {
    fullName: "Amie",
    email: "amie@jahoil.com",
    roleId: "role_fuel_sales",
    roleName: "Fuel Sales",
    branchStationName: "Banjul Station",
    allowedCategories: ["fuel"],
  },
  {
    fullName: "Mendy",
    email: "mendy@jahoil.com",
    roleId: "role_general_sales",
    roleName: "General Sales",
    branchStationName: "Banjul Station",
    allowedCategories: ["shop", "cement"],
  },
  {
    fullName: "Mama",
    email: "mama@jahoil.com",
    roleId: "role_general_sales",
    roleName: "General Sales",
    branchStationName: "Brikama Station",
    allowedCategories: ["shop", "cement"],
  },
];

loadEnvFiles();

const cliArgs = parseArgs(process.argv.slice(2), {
  booleanFlags: ["dry-run", "help"],
});
const config = createAdminConfig(cliArgs);
const defaultPassword = String(cliArgs.password || DEFAULT_PASSWORD);

if (cliArgs.help) {
  printUsage();
  process.exit(0);
}

validateAdminConfig(config);

main().catch((error) => {
  console.error(`Custom seed failed: ${error.message}`);

  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }

  process.exit(1);
});

async function main() {
  console.log(`Using Appwrite endpoint: ${config.apiBaseUrl}`);
  console.log(`Target database ID: ${config.databaseId}`);
  console.log(`Seed namespace: ${TEAM_SEED_NAMESPACE}`);
  const recentWindow = buildRecentWindow();
  console.log(
    `Transaction window: ${recentWindow.startIso} to ${recentWindow.endIso}`,
  );

  const databases = createDatabasesClient(config);

  const [
    roleDocuments,
    userDocuments,
    stationDocuments,
    productDocuments,
    inventoryDocuments,
    receiptDocuments,
    receiptItemDocuments,
    incomingStockDocuments,
    fuelDeliveryDocuments,
  ] = await Promise.all([
    listAllDocuments(databases, config.databaseId, COLLECTIONS.roles, [
      Query.select(["$id", "name", "code"]),
    ]),
    listAllDocuments(databases, config.databaseId, COLLECTIONS.users, [
      Query.select([
        "$id",
        "full_name",
        "email",
        "role_id",
        "role_name",
        "branch_station_id",
        "branch_station_name",
        "password_hash",
        "must_change_password",
        "status",
        "created_at",
        "updated_at",
      ]),
    ]),
    listAllDocuments(databases, config.databaseId, COLLECTIONS.stations, [
      Query.select(["$id", "name", "location", "status"]),
    ]),
    listAllDocuments(databases, config.databaseId, COLLECTIONS.products, [
      Query.select([
        "$id",
        "name",
        "category",
        "unit",
        "selling_price",
        "status",
      ]),
    ]),
    listAllDocuments(databases, config.databaseId, COLLECTIONS.inventoryItems, [
      Query.select([
        "$id",
        "station_id",
        "station_name",
        "product_id",
        "product_name",
        "category",
        "quantity",
        "unit",
        "reorder_level",
        "status",
        "last_updated_at",
      ]),
    ]),
    listAllDocuments(databases, config.databaseId, COLLECTIONS.salesReceipts, [
      Query.select(["$id"]),
    ]),
    listAllDocuments(databases, config.databaseId, COLLECTIONS.salesReceiptItems, [
      Query.select(["$id"]),
    ]),
    listAllDocuments(databases, config.databaseId, COLLECTIONS.incomingStockRecords, [
      Query.select(["$id"]),
    ]),
    listAllDocuments(databases, config.databaseId, COLLECTIONS.fuelDeliveries, [
      Query.select(["$id"]),
    ]),
  ]);

  const rolesById = new Map(roleDocuments.map((role) => [role.$id, role]));
  const stationsByName = new Map(stationDocuments.map((station) => [station.name, station]));
  const products = productDocuments
    .filter((product) => `${product.status || "active"}` === "active")
    .sort((left, right) => `${left.name}`.localeCompare(`${right.name}`));
  const inventoryByStationAndProduct = new Map(
    inventoryDocuments.map((item) => [
      `${item.station_name}|${item.product_name}`,
      item,
    ]),
  );

  validateTargets(rolesById, stationsByName, products, inventoryByStationAndProduct);

  const userUpserts = buildUserUpserts(userDocuments, stationsByName, defaultPassword);
  const plannedTransactions = buildPlannedTransactions({
    stationsByName,
    products,
    recentWindow,
  });
  const plannedStockBoosts = buildPlannedStockBoosts({
    inventoryByStationAndProduct,
    recentWindow,
  });

  const existingReceiptIds = new Set(receiptDocuments.map((document) => document.$id));
  const existingReceiptItemIds = new Set(receiptItemDocuments.map((document) => document.$id));
  const existingIncomingIds = new Set(incomingStockDocuments.map((document) => document.$id));
  const existingFuelDeliveryIds = new Set(fuelDeliveryDocuments.map((document) => document.$id));

  const receiptsToCreate = plannedTransactions
    .map((transaction) => transaction.receipt)
    .filter((record) => !existingReceiptIds.has(record.documentId));
  const receiptItemsToCreate = plannedTransactions
    .map((transaction) => transaction.item)
    .filter((record) => !existingReceiptItemIds.has(record.documentId));
  const incomingStockToCreate = plannedStockBoosts.incomingStockRecords.filter(
    (record) => !existingIncomingIds.has(record.documentId),
  );
  const fuelDeliveriesToCreate = plannedStockBoosts.fuelDeliveries.filter(
    (record) => !existingFuelDeliveryIds.has(record.documentId),
  );

  const inventoryUpdates = buildInventoryUpdates({
    inventoryDocuments,
    receiptsToCreate,
    receiptItemsToCreate,
    incomingStockToCreate,
  });

  console.log(`users: create ${userUpserts.toCreate.length}, update ${userUpserts.toUpdate.length}`);
  console.log(`sales_receipts: create ${receiptsToCreate.length}, skip ${plannedTransactions.length - receiptsToCreate.length}`);
  console.log(`sales_receipt_items: create ${receiptItemsToCreate.length}, skip ${plannedTransactions.length - receiptItemsToCreate.length}`);
  console.log(`incoming_stock_records: create ${incomingStockToCreate.length}, skip ${plannedStockBoosts.incomingStockRecords.length - incomingStockToCreate.length}`);
  console.log(`fuel_deliveries: create ${fuelDeliveriesToCreate.length}, skip ${plannedStockBoosts.fuelDeliveries.length - fuelDeliveriesToCreate.length}`);
  console.log(`inventory_items: update ${inventoryUpdates.length}`);

  if (config.dryRun) {
    console.log("Dry run only. No Appwrite API requests will be sent.");
    console.log(`New users: ${userUpserts.createdCredentials.map((user) => `${user.email}:${defaultPassword}`).join(", ") || "none"}`);
    return;
  }

  await ensureUsers(databases, userUpserts);
  await createRecords(databases, COLLECTIONS.incomingStockRecords, incomingStockToCreate);
  await createRecords(databases, COLLECTIONS.fuelDeliveries, fuelDeliveriesToCreate);
  await createRecords(databases, COLLECTIONS.salesReceipts, receiptsToCreate);
  await createRecords(databases, COLLECTIONS.salesReceiptItems, receiptItemsToCreate);
  await applyInventoryUpdates(databases, inventoryUpdates);
  await rebuildSummaries(databases);

  console.log("Custom seed completed successfully.");

  if (userUpserts.createdCredentials.length > 0) {
    console.log("Created users:");
    userUpserts.createdCredentials.forEach((user) => {
      console.log(`- ${user.fullName} <${user.email}> password: ${defaultPassword}`);
    });
  }
}

function createDatabasesClient(runtimeConfig) {
  const client = new Client()
    .setEndpoint(runtimeConfig.apiBaseUrl)
    .setProject(runtimeConfig.projectId);
  client.headers["X-Appwrite-Key"] = runtimeConfig.apiKey;
  return new Databases(client);
}

async function listAllDocuments(databases, databaseId, collectionId, queries = []) {
  const documents = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (documents.length < total) {
    const response = await databases.listDocuments(databaseId, collectionId, [
      ...queries,
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

function validateTargets(rolesById, stationsByName, products, inventoryByStationAndProduct) {
  for (const targetUser of TARGET_USERS) {
    if (!rolesById.has(targetUser.roleId)) {
      throw new Error(`Missing role document ${targetUser.roleId} for ${targetUser.fullName}.`);
    }

    if (!stationsByName.has(targetUser.branchStationName)) {
      throw new Error(`Missing station ${targetUser.branchStationName} for ${targetUser.fullName}.`);
    }
  }

  for (const stationName of uniqueValues(TARGET_USERS.map((user) => user.branchStationName))) {
    for (const product of products) {
      const inventoryKey = `${stationName}|${product.name}`;

      if (!inventoryByStationAndProduct.has(inventoryKey)) {
        throw new Error(`Missing inventory item for ${inventoryKey}.`);
      }
    }
  }
}

function buildUserUpserts(existingUsers, stationsByName, password) {
  const now = new Date().toISOString();
  const existingByEmail = new Map(
    existingUsers.map((user) => [`${user.email || ""}`.trim().toLowerCase(), user]),
  );
  const existingByName = new Map(
    existingUsers.map((user) => [`${user.full_name || ""}`.trim().toLowerCase(), user]),
  );
  const toCreate = [];
  const toUpdate = [];
  const createdCredentials = [];

  for (const targetUser of TARGET_USERS) {
    const station = stationsByName.get(targetUser.branchStationName);
    const existingUser =
      existingByEmail.get(targetUser.email.toLowerCase()) ||
      existingByName.get(targetUser.fullName.toLowerCase()) ||
      null;

    const baseData = {
      full_name: targetUser.fullName,
      email: existingUser?.email || targetUser.email,
      role_id: targetUser.roleId,
      role_name: targetUser.roleName,
      branch_station_id: station.$id,
      branch_station_name: station.name,
      status: "active",
      updated_at: now,
    };

    if (existingUser) {
      toUpdate.push({
        documentId: existingUser.$id,
        data: {
          ...baseData,
          must_change_password:
            typeof existingUser.must_change_password === "boolean"
              ? existingUser.must_change_password
              : false,
        },
      });
      continue;
    }

    toCreate.push({
      documentId: buildDocumentId("usr", targetUser.email),
      data: {
        ...baseData,
        password_hash: hashPassword(password),
        must_change_password: true,
        created_at: now,
      },
    });
    createdCredentials.push({
      fullName: targetUser.fullName,
      email: targetUser.email,
    });
  }

  return {
    toCreate,
    toUpdate,
    createdCredentials,
  };
}

function buildPlannedTransactions({ stationsByName, products, recentWindow }) {
  const draftTransactions = [];

  for (const targetUser of TARGET_USERS) {
    const station = stationsByName.get(targetUser.branchStationName);
    const allowedProducts = products.filter((product) =>
      targetUser.allowedCategories.includes(product.category),
    );

    for (const product of allowedProducts) {
      const count = 10 + seededInt(`count|${targetUser.email}|${product.$id}`, 41);

      for (let index = 0; index < count; index += 1) {
        const saleDate = buildTimestampInRange({
          startMs: recentWindow.startMs,
          endMs: recentWindow.endMs,
          seed: `sale|${targetUser.email}|${product.$id}|${index}`,
          index,
          total: count,
        });
        const date = saleDate.slice(0, 10);
        const quantity = buildSaleQuantity(product, targetUser, index);
        const unitPrice = Number(product.selling_price || 0);
        const lineTotal = roundCurrency(quantity * unitPrice);
        const paymentMethod =
          PAYMENT_METHODS[
            seededInt(
              `payment|${targetUser.email}|${product.$id}|${index}`,
              PAYMENT_METHODS.length,
            )
          ];
        const receiptNumberBase = buildReceiptNumber({
          date,
          userName: targetUser.fullName,
          productName: product.name,
          index,
        });

        draftTransactions.push({
          receiptNumberBase,
          receiptUniquenessSeed: [
            TEAM_SEED_NAMESPACE,
            targetUser.email,
            station.$id,
            product.$id,
            saleDate,
            index,
          ].join("|"),
          stationId: station.$id,
          stationName: station.name,
          saleDate,
          paymentMethod,
          cashierName: targetUser.fullName,
          productId: product.$id,
          productName: product.name,
          category: product.category,
          quantity,
          unit: product.unit,
          unitPrice,
          lineTotal,
        });
      }
    }
  }

  const duplicateReceiptNumbers = findDuplicateValues(
    draftTransactions.map((transaction) => transaction.receiptNumberBase),
  );
  const transactions = draftTransactions.map((transaction) => {
    const receiptNumber = duplicateReceiptNumbers.has(transaction.receiptNumberBase)
      ? `${transaction.receiptNumberBase}-${buildShortHash(
          transaction.receiptUniquenessSeed,
          6,
        )}`
      : transaction.receiptNumberBase;
    const receiptId = buildDocumentId("rcp", receiptNumber);

    return {
      receipt: {
        documentId: receiptId,
        data: {
          receipt_number: receiptNumber,
          station_id: transaction.stationId,
          station_name: transaction.stationName,
          sale_date: transaction.saleDate,
          source: "pos",
          subtotal: transaction.lineTotal,
          tax_amount: 0,
          discount_amount: 0,
          total_amount: transaction.lineTotal,
          payment_method: transaction.paymentMethod,
          payment_method_code: transaction.paymentMethod,
          payment_method_label: toLabel(transaction.paymentMethod),
          status: "completed",
          cashier_name: transaction.cashierName,
          customer_name: "Walk-in Customer",
          notes: `Seeded targeted cashier sale (${TEAM_SEED_NAMESPACE}).`,
        },
      },
      item: {
        documentId: buildDocumentId("rit", `${receiptNumber}-1`),
        data: {
          receipt_id: receiptId,
          receipt_number: receiptNumber,
          sale_date: transaction.saleDate,
          station_id: transaction.stationId,
          station_name: transaction.stationName,
          product_id: transaction.productId,
          product_name: transaction.productName,
          category: transaction.category,
          line_number: 1,
          quantity: transaction.quantity,
          unit: transaction.unit,
          unit_price: transaction.unitPrice,
          line_total: transaction.lineTotal,
        },
      },
    };
  });

  assertUniqueValues(
    transactions.map((transaction) => transaction.receipt.documentId),
    "sales receipt document IDs",
  );
  assertUniqueValues(
    transactions.map((transaction) => transaction.receipt.data.receipt_number),
    "sales receipt numbers",
  );
  assertUniqueValues(
    transactions.map((transaction) => transaction.item.documentId),
    "sales receipt item document IDs",
  );

  return transactions;
}

function buildPlannedStockBoosts({
  inventoryByStationAndProduct,
  recentWindow,
}) {
  const incomingStockRecords = [];
  const fuelDeliveries = [];
  const targetStations = uniqueValues(TARGET_USERS.map((user) => user.branchStationName));
  const stockWindowEndMs = Math.min(
    recentWindow.endMs,
    recentWindow.startMs + 36 * 60 * 60 * 1000,
  );

  for (const stationName of targetStations) {
    for (const [inventoryKey, inventoryItem] of inventoryByStationAndProduct.entries()) {
      if (!inventoryKey.startsWith(`${stationName}|`)) {
        continue;
      }

      const quantityAdded = getStockBoostQuantity(inventoryItem.product_name, inventoryItem.category);
      const previousQuantity = Number(inventoryItem.quantity || 0);
      const newQuantity = roundQuantity(previousQuantity + quantityAdded, inventoryItem.category);
      const recordedAt = buildTimestampInRange({
        startMs: recentWindow.startMs,
        endMs: stockWindowEndMs,
        seed: `incoming|${stationName}|${inventoryItem.product_name}`,
        index: 0,
        total: 1,
      });
      const stockDocumentId = buildDocumentId(
        "isr",
        `${TEAM_SEED_NAMESPACE}|${stationName}|${inventoryItem.product_name}`,
      );

      incomingStockRecords.push({
        documentId: stockDocumentId,
        data: {
          inventory_item_id: inventoryItem.$id,
          station_id: inventoryItem.station_id,
          station_name: inventoryItem.station_name,
          product_id: inventoryItem.product_id,
          product_name: inventoryItem.product_name,
          quantity_added: quantityAdded,
          previous_quantity: previousQuantity,
          new_quantity: newQuantity,
          unit: inventoryItem.unit,
          recorded_at: recordedAt,
          recorded_by: "Seed Warehouse Team",
          notes: `Seeded stock increase (${TEAM_SEED_NAMESPACE}).`,
        },
      });

      if (`${inventoryItem.category || ""}` === "fuel") {
        const deliveryDate = buildTimestampInRange({
          startMs: recentWindow.startMs,
          endMs: stockWindowEndMs,
          seed: `delivery|${stationName}|${inventoryItem.product_name}`,
          index: 0,
          total: 1,
        });
        fuelDeliveries.push({
          documentId: buildDocumentId(
            "fdl",
            `${TEAM_SEED_NAMESPACE}|${stationName}|${inventoryItem.product_name}`,
          ),
          data: {
            station_id: inventoryItem.station_id,
            station_name: inventoryItem.station_name,
            product_id: inventoryItem.product_id,
            product_name: inventoryItem.product_name,
            delivery_date: deliveryDate,
            quantity: quantityAdded,
            unit: inventoryItem.unit,
            status: "delivered",
            supplier: "Jah Oil Supply",
            reference_no: buildReferenceNo(stationName, inventoryItem.product_name),
            driver_name: "Seed Delivery Driver",
            recorded_by: "Seed Warehouse Team",
            notes: `Seeded fuel delivery (${TEAM_SEED_NAMESPACE}).`,
          },
        });
      }
    }
  }

  return {
    incomingStockRecords,
    fuelDeliveries,
  };
}

function buildInventoryUpdates({
  inventoryDocuments,
  receiptsToCreate,
  receiptItemsToCreate,
  incomingStockToCreate,
}) {
  const inventoryByDocumentId = new Map(
    inventoryDocuments.map((document) => [document.$id, document]),
  );
  const saleDeltaByInventoryDocumentId = new Map();
  const incomingDeltaByInventoryDocumentId = new Map();

  for (const record of incomingStockToCreate) {
    accumulateMapValue(
      incomingDeltaByInventoryDocumentId,
      record.data.inventory_item_id,
      Number(record.data.quantity_added || 0),
    );
  }

  for (const item of receiptItemsToCreate) {
    const inventoryDocument = inventoryDocuments.find(
      (inventoryItem) =>
        inventoryItem.station_id === item.data.station_id &&
        inventoryItem.product_id === item.data.product_id,
    );

    if (!inventoryDocument) {
      throw new Error(
        `Unable to map sale to inventory item for ${item.data.station_name} / ${item.data.product_name}.`,
      );
    }

    accumulateMapValue(
      saleDeltaByInventoryDocumentId,
      inventoryDocument.$id,
      Number(item.data.quantity || 0),
    );
  }

  const updates = [];
  const candidateInventoryIds = new Set([
    ...incomingDeltaByInventoryDocumentId.keys(),
    ...saleDeltaByInventoryDocumentId.keys(),
  ]);

  for (const inventoryDocumentId of candidateInventoryIds) {
    const currentDocument = inventoryByDocumentId.get(inventoryDocumentId);

    if (!currentDocument) {
      continue;
    }

    const incomingDelta = Number(incomingDeltaByInventoryDocumentId.get(inventoryDocumentId) || 0);
    const saleDelta = Number(saleDeltaByInventoryDocumentId.get(inventoryDocumentId) || 0);

    if (incomingDelta === 0 && saleDelta === 0) {
      continue;
    }

    const currentQuantity = Number(currentDocument.quantity || 0);
    const category = `${currentDocument.category || ""}`;
    const updatedQuantity = Math.max(
      0,
      roundQuantity(currentQuantity + incomingDelta - saleDelta, category),
    );
    const lastUpdatedAt = latestIsoDate([
      currentDocument.last_updated_at,
      ...receiptItemsToCreate
        .filter(
          (item) =>
            item.data.station_id === currentDocument.station_id &&
            item.data.product_id === currentDocument.product_id,
        )
        .map((item) => item.data.sale_date),
      ...incomingStockToCreate
        .filter((record) => record.data.inventory_item_id === inventoryDocumentId)
        .map((record) => record.data.recorded_at),
    ]);

    updates.push({
      documentId: inventoryDocumentId,
      data: {
        quantity: updatedQuantity,
        status: getInventoryStatus(updatedQuantity, Number(currentDocument.reorder_level || 0)),
        last_updated_at: lastUpdatedAt || new Date().toISOString(),
      },
    });
  }

  return updates;
}

async function ensureUsers(databases, userUpserts) {
  for (const record of userUpserts.toCreate) {
    await databases.createDocument(
      config.databaseId,
      COLLECTIONS.users,
      record.documentId,
      cleanData(record.data),
    );
  }

  for (const record of userUpserts.toUpdate) {
    await databases.updateDocument(
      config.databaseId,
      COLLECTIONS.users,
      record.documentId,
      cleanData(record.data),
    );
  }
}

async function createRecords(databases, collectionId, records) {
  for (const record of records) {
    try {
      await databases.createDocument(
        config.databaseId,
        collectionId,
        record.documentId,
        cleanData(record.data),
      );
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        continue;
      }

      throw error;
    }
  }
}

async function applyInventoryUpdates(databases, updates) {
  for (const update of updates) {
    await databases.updateDocument(
      config.databaseId,
      COLLECTIONS.inventoryItems,
      update.documentId,
      cleanData(update.data),
    );
  }
}

async function rebuildSummaries(databases) {
  const [receipts, receiptItems] = await Promise.all([
    listAllDocuments(databases, config.databaseId, COLLECTIONS.salesReceipts, [
      Query.select([
        "$id",
        "sale_date",
        "station_id",
        "station_name",
        "cashier_name",
      ]),
    ]),
    listAllDocuments(databases, config.databaseId, COLLECTIONS.salesReceiptItems, [
      Query.select([
        "$id",
        "receipt_id",
        "sale_date",
        "station_id",
        "station_name",
        "product_name",
        "category",
        "quantity",
        "line_total",
      ]),
    ]),
  ]);

  const summaries = buildSalesSummaries(receipts, receiptItems);

  await clearCollection(databases, COLLECTIONS.stationDailySummary);
  await clearCollection(databases, COLLECTIONS.cashierDailySummary);
  await createSummaryRecords(databases, COLLECTIONS.stationDailySummary, summaries.stationDailySummaries);
  await createSummaryRecords(databases, COLLECTIONS.cashierDailySummary, summaries.cashierDailySummaries);
}

async function clearCollection(databases, collectionId) {
  const documents = await listAllDocuments(databases, config.databaseId, collectionId, [
    Query.select(["$id"]),
  ]);

  for (let index = 0; index < documents.length; index += SUMMARY_DELETE_BATCH_SIZE) {
    const batch = documents.slice(index, index + SUMMARY_DELETE_BATCH_SIZE);
    await Promise.all(
      batch.map((document) =>
        databases.deleteDocument(config.databaseId, collectionId, document.$id),
      ),
    );
  }
}

async function createSummaryRecords(databases, collectionId, records) {
  for (let index = 0; index < records.length; index += SUMMARY_CREATE_BATCH_SIZE) {
    const batch = records.slice(index, index + SUMMARY_CREATE_BATCH_SIZE);
    await Promise.all(
      batch.map((record) =>
        databases.createDocument(
          config.databaseId,
          collectionId,
          record.documentId,
          cleanData(record.data),
        ),
      ),
    );
  }
}

function buildSalesSummaries(receipts, receiptItems) {
  const receiptsById = new Map(receipts.map((receipt) => [receipt.$id, receipt]));
  const receiptItemsByReceiptId = groupBy(receiptItems, (item) => `${item.receipt_id || ""}`);
  const stationSummaryMap = new Map();
  const cashierSummaryMap = new Map();

  for (const [receiptId, items] of receiptItemsByReceiptId.entries()) {
    if (!receiptId || items.length === 0) {
      continue;
    }

    const receipt = receiptsById.get(receiptId);
    const firstItem = items[0];
    const date = `${receipt?.sale_date || firstItem?.sale_date || ""}`.slice(0, 10);
    const stationId = `${receipt?.station_id || firstItem?.station_id || ""}`.trim();
    const stationName = `${receipt?.station_name || firstItem?.station_name || ""}`.trim();
    const cashierName = `${receipt?.cashier_name || "Unknown Cashier"}`.trim();

    if (!date || !stationId || !stationName) {
      continue;
    }

    const stationKey = `${date}|${stationId}`;
    const cashierKey = `${date}|${stationId}|${cashierName}`;
    const stationSummary = ensureStationSummary(
      stationSummaryMap,
      stationKey,
      date,
      stationId,
      stationName,
    );
    const cashierSummary = ensureCashierSummary(
      cashierSummaryMap,
      cashierKey,
      date,
      stationId,
      stationName,
      cashierName,
    );

    stationSummary.data.transactions += 1;
    cashierSummary.data.transactions += 1;

    for (const item of items) {
      const delta = buildSummaryDeltaFromItem(item);
      applySummaryDelta(stationSummary.data, delta);
      applySummaryDelta(cashierSummary.data, delta);
    }
  }

  return {
    stationDailySummaries: Array.from(stationSummaryMap.values()),
    cashierDailySummaries: Array.from(cashierSummaryMap.values()),
  };
}

function ensureStationSummary(map, key, date, stationId, stationName) {
  if (!map.has(key)) {
    map.set(key, {
      documentId: buildDocumentId("sds", `${date}-${stationId}`),
      data: buildEmptyStationSummaryDocument({ date, stationId, stationName }),
    });
  }

  return map.get(key);
}

function ensureCashierSummary(map, key, date, stationId, stationName, cashierName) {
  if (!map.has(key)) {
    map.set(key, {
      documentId: buildDocumentId("cds", `${date}-${stationId}-${cashierName}`),
      data: buildEmptyCashierSummaryDocument({
        date,
        stationId,
        stationName,
        cashierName,
      }),
    });
  }

  return map.get(key);
}

function buildEmptyStationSummaryDocument({ date, stationId, stationName }) {
  return {
    date,
    station_id: stationId,
    station_name: stationName,
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
  };
}

function buildEmptyCashierSummaryDocument({
  date,
  stationId,
  stationName,
  cashierName = "",
}) {
  return {
    date,
    station_id: stationId,
    station_name: stationName,
    cashier_user_id: "",
    cashier_name: cashierName,
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
  };
}

function buildSummaryDeltaFromItem(item) {
  const productName = `${item?.product_name || ""}`.trim().toLowerCase();
  const category = `${item?.category || ""}`.trim().toLowerCase();
  const amount = Number(item?.line_total || 0);
  const quantity = Number(item?.quantity || 0);
  const delta = {
    fuel_sales: 0,
    petrol_sales: 0,
    diesel_sales: 0,
    shop_sales: 0,
    rice_sales: 0,
    cooking_oil_sales: 0,
    other_shop_sales: 0,
    cement_sales: 0,
    cement_bags_sold: 0,
    total_sales: amount,
  };

  if (category === "fuel") {
    delta.fuel_sales = amount;

    if (productName.includes("petrol")) {
      delta.petrol_sales = amount;
    } else if (productName.includes("diesel")) {
      delta.diesel_sales = amount;
    }

    return delta;
  }

  if (category === "cement") {
    delta.cement_sales = amount;
    delta.cement_bags_sold = quantity;
    return delta;
  }

  delta.shop_sales = amount;

  if (productName.includes("rice")) {
    delta.rice_sales = amount;
  } else if (productName.includes("cooking oil")) {
    delta.cooking_oil_sales = amount;
  } else {
    delta.other_shop_sales = amount;
  }

  return delta;
}

function applySummaryDelta(summary, delta) {
  Object.entries(delta).forEach(([field, value]) => {
    summary[field] = Number(summary[field] || 0) + Number(value || 0);
  });
}

function buildSaleQuantity(product, targetUser, index) {
  const productName = `${product.name || ""}`.trim().toLowerCase();
  const category = `${product.category || ""}`.trim().toLowerCase();

  if (category === "fuel") {
    return roundQuantity(
      8 + seededInt(`qty|${targetUser.email}|${product.$id}|${index}`, 33) + seededDecimal(`fuel-dec|${targetUser.email}|${product.$id}|${index}`),
      category,
    );
  }

  if (category === "cement") {
    return 3 + seededInt(`qty|${targetUser.email}|${product.$id}|${index}`, 18);
  }

  if (productName.includes("50kg")) {
    return 1 + seededInt(`qty|${targetUser.email}|${product.$id}|${index}`, 4);
  }

  if (productName.includes("25kg")) {
    return 1 + seededInt(`qty|${targetUser.email}|${product.$id}|${index}`, 6);
  }

  if (productName.includes("cooking oil")) {
    return 1 + seededInt(`qty|${targetUser.email}|${product.$id}|${index}`, 4);
  }

  return 1 + seededInt(`qty|${targetUser.email}|${product.$id}|${index}`, 5);
}

function getStockBoostQuantity(productName, category) {
  const normalizedName = `${productName || ""}`.trim().toLowerCase();

  if (category === "fuel") {
    return normalizedName.includes("petrol") ? 12000 : 9000;
  }

  if (category === "cement") {
    return 850;
  }

  if (normalizedName.includes("50kg")) {
    return 220;
  }

  if (normalizedName.includes("25kg")) {
    return 280;
  }

  if (normalizedName.includes("cooking oil")) {
    return 180;
  }

  return 200;
}

function buildReceiptNumber({ date, userName, productName, index }) {
  const compactName = slugify(userName).replaceAll("-", "").toUpperCase().slice(0, 5) || "USER";
  const compactProduct =
    slugify(productName).replaceAll("-", "").toUpperCase().slice(0, 5) || "ITEM";

  return `POST-${date.replaceAll("-", "")}-${compactName}-${compactProduct}-${String(index + 1).padStart(3, "0")}`;
}

function buildReferenceNo(stationName, productName) {
  return `BOOST-${slugify(stationName).toUpperCase().slice(0, 6)}-${slugify(productName).toUpperCase().slice(0, 6)}`;
}

function buildShortHash(value, length = 6) {
  return crypto
    .createHash("sha1")
    .update(String(value))
    .digest("hex")
    .slice(0, Math.max(1, length))
    .toUpperCase();
}

function findDuplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return duplicates;
}

function assertUniqueValues(values, label) {
  const duplicates = Array.from(findDuplicateValues(values));

  if (duplicates.length === 0) {
    return;
  }

  throw new Error(
    `Duplicate ${label} detected: ${duplicates.slice(0, 5).join(", ")}${duplicates.length > 5 ? " ..." : ""}.`,
  );
}

function buildRecentWindow() {
  const now = new Date();
  const end = new Date(now.getTime() - 60 * 60 * 1000);
  const start = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 11, 0, 0, 0, 0),
  );

  if (end.getTime() <= start.getTime()) {
    throw new Error(
      `Invalid seed window. Start ${start.toISOString()} must be before end ${end.toISOString()}.`,
    );
  }

  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function buildTimestampInRange({ startMs, endMs, seed, index = 0, total = 1 }) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return new Date(startMs).toISOString();
  }

  const safeTotal = Math.max(1, total);
  const safeIndex = Math.max(0, index);
  const span = endMs - startMs;
  const baseRatio = safeTotal === 1 ? 0.5 : safeIndex / safeTotal;
  const jitter = seededInt(seed, 10_000) / 10_000 / safeTotal;
  const ratio = Math.min(0.9995, Math.max(0, baseRatio + 0.18 + jitter * 0.64));
  const timestampMs = startMs + Math.floor(span * ratio);

  return new Date(timestampMs).toISOString();
}

function getInventoryStatus(quantity, reorderLevel) {
  if (Number(quantity) <= 0) {
    return "out";
  }

  if (Number(quantity) <= Number(reorderLevel || 0)) {
    return "low";
  }

  return "in_stock";
}

function hashPassword(password) {
  const normalizedPassword = String(password || "");

  if (normalizedPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(normalizedPassword, salt, 64).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundQuantity(value, category) {
  const precision = category === "fuel" ? 1 : 0;
  return Number(Number(value || 0).toFixed(precision));
}

function latestIsoDate(values) {
  return values
    .filter(Boolean)
    .sort((left, right) => `${right}`.localeCompare(`${left}`))[0];
}

function accumulateMapValue(map, key, amount) {
  map.set(key, Number(map.get(key) || 0) + Number(amount || 0));
}

function groupBy(records, getKey) {
  const groups = new Map();

  for (const record of records) {
    const key = getKey(record);
    const items = groups.get(key) || [];
    items.push(record);
    groups.set(key, items);
  }

  return groups;
}

function seededInt(seed, modulo) {
  if (modulo <= 0) {
    return 0;
  }

  const hash = crypto.createHash("sha1").update(String(seed)).digest("hex").slice(0, 12);
  return Number.parseInt(hash, 16) % modulo;
}

function seededDecimal(seed) {
  return seededInt(seed, 10) / 10;
}

function isAlreadyExistsError(error) {
  const statusCode = Number(error?.code || error?.status || 0);
  const message = `${error?.message || ""}`.toLowerCase();
  return statusCode === 409 || message.includes("already") || message.includes("exists");
}

function buildDocumentId(prefix, value) {
  const hash = crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 24);
  return `${prefix}_${hash}`.slice(0, 36);
}

function slugify(value) {
  return `${value || ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toLabel(value) {
  const normalized = `${value || ""}`.trim();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "";
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(`${value || 0}`, 10);

  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(max, Math.max(min, parsed));
}

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}

function printUsage() {
  console.log(`
Usage:
  node scripts/seed-banjul-brikama-team-records.mjs

Required environment variables:
  NEXT_PUBLIC_APPWRITE_ENDPOINT
  NEXT_PUBLIC_APPWRITE_PROJECT_ID
  APPWRITE_API_KEY
  APPWRITE_DATABASE_ID

Optional flags:
  --password <value>  Default password for newly created users (min 8 chars)
  --dry-run
  --help
`);
}
