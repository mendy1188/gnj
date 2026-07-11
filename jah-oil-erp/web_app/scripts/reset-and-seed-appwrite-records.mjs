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
  stations: "stations",
  products: "products",
  productPriceHistory: "product_price_history",
  inventoryItems: "inventory_items",
  incomingStockRecords: "incoming_stock_records",
  fuelDeliveries: "fuel_deliveries",
  salesReceipts: "sales_receipts",
  salesReceiptItems: "sales_receipt_items",
  stationDailySummary: "station_daily_summary",
  cashierDailySummary: "cashier_daily_summary",
  stationCategoryDailySummary: "station_category_daily_summary",
  stationProductDailySummary: "station_product_daily_summary",
  roles: "app_roles",
  users: "app_users",
};

const RESET_COLLECTION_ORDER = [
  COLLECTIONS.stationProductDailySummary,
  COLLECTIONS.stationCategoryDailySummary,
  COLLECTIONS.cashierDailySummary,
  COLLECTIONS.stationDailySummary,
  COLLECTIONS.salesReceiptItems,
  COLLECTIONS.salesReceipts,
  COLLECTIONS.fuelDeliveries,
  COLLECTIONS.incomingStockRecords,
  COLLECTIONS.inventoryItems,
  COLLECTIONS.productPriceHistory,
  COLLECTIONS.products,
  COLLECTIONS.stations,
  COLLECTIONS.roles,
];

const STATIONS = [
  {
    name: "Banjul Station",
    location: "Banjul",
    status: "active",
    manager: "Alieu Bah",
  },
  {
    name: "Serekunda Station",
    location: "Serekunda",
    status: "active",
    manager: "Fatou Touray",
  },
  {
    name: "Bakau Station",
    location: "Bakau",
    status: "active",
    manager: "Musa Camara",
  },
  {
    name: "Brikama Station",
    location: "Brikama",
    status: "active",
    manager: "Aminata Jallow",
  },
];

const PRODUCTS = [
  {
    name: "Petrol",
    category: "fuel",
    unit: "liter",
    price: 112,
    reorderLevel: 4000,
    openingQuantity: 52000,
    incomingRange: [0, 0],
    deliveryRange: [4200, 7200],
    saleRange: [18, 95],
  },
  {
    name: "Diesel",
    category: "fuel",
    unit: "liter",
    price: 115,
    reorderLevel: 3500,
    openingQuantity: 47000,
    incomingRange: [0, 0],
    deliveryRange: [3800, 6800],
    saleRange: [15, 82],
  },
  {
    name: "Rice (50kg)",
    category: "shop",
    unit: "bag",
    price: 1700,
    reorderLevel: 80,
    openingQuantity: 850,
    incomingRange: [30, 80],
    deliveryRange: [0, 0],
    saleRange: [1, 5],
  },
  {
    name: "Rice (25kg)",
    category: "shop",
    unit: "bag",
    price: 800,
    reorderLevel: 100,
    openingQuantity: 1050,
    incomingRange: [40, 100],
    deliveryRange: [0, 0],
    saleRange: [1, 7],
  },
  {
    name: "Cooking Oil (20-Litre)",
    category: "shop",
    unit: "container",
    price: 1500,
    reorderLevel: 75,
    openingQuantity: 720,
    incomingRange: [18, 55],
    deliveryRange: [0, 0],
    saleRange: [1, 4],
  },
  {
    name: "Onion",
    category: "shop",
    unit: "bag",
    price: 500,
    reorderLevel: 60,
    openingQuantity: 540,
    incomingRange: [20, 65],
    deliveryRange: [0, 0],
    saleRange: [1, 4],
  },
  {
    name: "Cement (42,5 R)",
    category: "cement",
    unit: "bag",
    price: 450,
    reorderLevel: 180,
    openingQuantity: 4200,
    incomingRange: [55, 180],
    deliveryRange: [0, 0],
    saleRange: [4, 22],
  },
];

const ROLE_DEFINITIONS = [
  {
    documentId: "role_admin",
    code: "admin",
    name: "Admin",
    branchRequired: false,
    modules: [
      "dashboard",
      "stations",
      "inventory",
      "product-settings",
      "incoming-stock",
      "cement",
      "fuel-deliveries",
      "fuel-sales",
      "commodities-sales",
      "pos",
      "reports",
      "admin",
    ],
  },
  {
    documentId: "role_general_manager",
    code: "general_manager",
    name: "General Manager",
    branchRequired: false,
    modules: [
      "dashboard",
      "stations",
      "inventory",
      "product-settings",
      "incoming-stock",
      "cement",
      "fuel-deliveries",
      "fuel-sales",
      "commodities-sales",
      "pos",
      "reports",
    ],
  },
  {
    documentId: "role_branch_manager",
    code: "branch_manager",
    name: "Branch Manager",
    branchRequired: true,
    modules: [
      "dashboard",
      "stations",
      "inventory",
      "incoming-stock",
      "cement",
      "commodities-sales",
      "reports",
    ],
  },
  {
    documentId: "role_general_sales",
    code: "general_sales",
    name: "General Sales",
    branchRequired: true,
    modules: ["dashboard", "commodities-sales", "cement", "pos", "reports"],
  },
  {
    documentId: "role_fuel_sales",
    code: "fuel_sales",
    name: "Fuel Sales",
    branchRequired: true,
    modules: ["dashboard", "fuel-sales", "pos", "reports"],
  },
];

const PAYMENT_METHODS = ["cash", "card", "transfer", "mixed"];
const START_DATE = "2026-06-01";

loadEnvFiles();

const cliArgs = parseArgs(process.argv.slice(2), {
  booleanFlags: ["dry-run", "help"],
});
const config = createAdminConfig(cliArgs);

const DELETE_BATCH_SIZE = getPositiveInteger(
  cliArgs["delete-batch-size"] || process.env.APPWRITE_RESET_DELETE_BATCH_SIZE,
  10,
);
const CREATE_BATCH_SIZE = getPositiveInteger(
  cliArgs["create-batch-size"] || process.env.APPWRITE_RESET_CREATE_BATCH_SIZE,
  10,
);
const REQUEST_CONCURRENCY = getPositiveInteger(
  cliArgs.concurrency || process.env.APPWRITE_RESET_CONCURRENCY,
  4,
);
const REQUEST_RETRY_ATTEMPTS = getPositiveInteger(
  cliArgs.retries || process.env.APPWRITE_RESET_RETRY_ATTEMPTS,
  5,
);
const REQUEST_RETRY_DELAY_MS = getPositiveInteger(
  cliArgs["retry-delay-ms"] || process.env.APPWRITE_RESET_RETRY_DELAY_MS,
  750,
);
const BATCH_DELAY_MS = getPositiveInteger(
  cliArgs["batch-delay-ms"] || process.env.APPWRITE_RESET_BATCH_DELAY_MS,
  150,
);

if (cliArgs.help) {
  printUsage();
  process.exit(0);
}

validateAdminConfig(config);

main().catch((error) => {
  console.error(`Reset/seed failed: ${error.message}`);

  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }

  process.exit(1);
});

async function main() {
  const dates = buildDateRange(START_DATE, currentDateString());

  if (dates.length === 0) {
    throw new Error(`No valid dates generated between ${START_DATE} and today.`);
  }

  console.log(`Using Appwrite endpoint: ${config.apiBaseUrl}`);
  console.log(`Target database ID: ${config.databaseId}`);
  console.log(`Seeding data from ${dates[0]} to ${dates[dates.length - 1]}`);
  console.log(
    `Delete batch ${DELETE_BATCH_SIZE}, create batch ${CREATE_BATCH_SIZE}, concurrency ${REQUEST_CONCURRENCY}, retries ${REQUEST_RETRY_ATTEMPTS}`,
  );

  const databases = createDatabasesClient(config);
  const users = cliArgs["dry-run"]
    ? []
    : await listAllDocuments(databases, config.databaseId, COLLECTIONS.users);

  const stations = buildStations();
  const roles = buildRoles();
  const products = buildProducts();
  const priceHistory = buildProductPriceHistory(products, users);
  const operatorsByStation = buildOperatorsByStation(stations, users);
  const deliveryPlans = buildFuelDeliveryPlans(dates, stations, products);
  const incomingPlans = buildIncomingStockPlans(dates, stations, products);
  const salesResult = buildSalesData(dates, stations, products, operatorsByStation);
  const inventoryItems = buildInventoryItems(
    stations,
    products,
    deliveryPlans,
    incomingPlans,
    salesResult.salesByKeyAndDate,
    dates,
  );
  const incomingStockRecords = buildIncomingStockRecords(
    incomingPlans,
    inventoryItems,
    salesResult.dailySalesTotals,
    dates,
  );
  const fuelDeliveries = buildFuelDeliveries(deliveryPlans, stations, products);
  const stationProductDailySummaries = buildStationProductDailySummaries(
    salesResult,
    incomingStockRecords,
    products,
  );
  const stationCategoryDailySummaries = buildStationCategoryDailySummaries(
    salesResult,
  );

  const summary = {
    stations,
    roles,
    products,
    priceHistory,
    inventoryItems,
    incomingStockRecords,
    fuelDeliveries,
    receipts: salesResult.receipts,
    receiptItems: salesResult.receiptItems,
    stationDailySummaries: salesResult.stationDailySummaries,
    cashierDailySummaries: salesResult.cashierDailySummaries,
    stationCategoryDailySummaries,
    stationProductDailySummaries,
    preservedUsers: users.length,
  };

  if (config.dryRun) {
    console.log("Dry run only. No Appwrite API requests will be sent.");
    printSummary(summary);
    return;
  }

  for (const collectionId of RESET_COLLECTION_ORDER) {
    const deleted = await clearCollection(databases, config.databaseId, collectionId);
    console.log(`${collectionId}: deleted ${deleted}`);
  }

  await seedCollection(databases, config.databaseId, COLLECTIONS.stations, stations);
  await seedCollection(databases, config.databaseId, COLLECTIONS.products, products);
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.productPriceHistory,
    priceHistory,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.inventoryItems,
    inventoryItems,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.incomingStockRecords,
    incomingStockRecords,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.fuelDeliveries,
    fuelDeliveries,
  );
  await seedCollection(databases, config.databaseId, COLLECTIONS.roles, roles);
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.stationDailySummary,
    salesResult.stationDailySummaries,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.cashierDailySummary,
    salesResult.cashierDailySummaries,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.stationCategoryDailySummary,
    stationCategoryDailySummaries,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.stationProductDailySummary,
    stationProductDailySummaries,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.salesReceipts,
    salesResult.receipts,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.salesReceiptItems,
    salesResult.receiptItems,
  );

  console.log("Appwrite reset and reseed completed successfully.");
  printSummary(summary);
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
    const response = await withRetry(
      () =>
        databases.listDocuments(databaseId, collectionId, [
          ...queries,
          Query.limit(100),
          Query.offset(offset),
        ]),
      `${collectionId}:list:${offset}`,
    );
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

async function clearCollection(databases, databaseId, collectionId) {
  const documents = await listAllDocuments(databases, databaseId, collectionId);

  if (documents.length === 0) {
    return 0;
  }

  console.log(`${collectionId}: deleting ${documents.length} documents...`);

  await processInBatches(
    documents,
    DELETE_BATCH_SIZE,
    async (document) => {
      await withRetry(
        () => databases.deleteDocument(databaseId, collectionId, document.$id),
        `${collectionId}:delete:${document.$id}`,
      );
    },
    (processed) => {
      console.log(`${collectionId}: deleted ${processed}/${documents.length}`);
    },
  );

  return documents.length;
}

async function seedCollection(databases, databaseId, collectionId, records) {
  if (records.length === 0) {
    console.log(`${collectionId}: created 0`);
    return;
  }

  console.log(`${collectionId}: creating ${records.length} documents...`);

  await processInBatches(
    records,
    CREATE_BATCH_SIZE,
    async (record) => {
      await withRetry(
        () =>
          databases.createDocument(
            databaseId,
            collectionId,
            record.documentId,
            cleanData(record.data),
          ),
        `${collectionId}:create:${record.documentId}`,
      );
    },
    (processed) => {
      console.log(`${collectionId}: created ${processed}/${records.length}`);
    },
  );
}

async function processInBatches(items, batchSize, worker, onProgress) {
  let processed = 0;

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);

    await runWithConcurrency(batch, REQUEST_CONCURRENCY, worker);

    processed += batch.length;
    onProgress?.(processed);

    if (BATCH_DELAY_MS > 0 && index + batchSize < items.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const normalizedConcurrency = Math.max(1, concurrency);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      await worker(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(normalizedConcurrency, items.length) },
      () => runWorker(),
    ),
  );
}

async function withRetry(operation, label) {
  let lastError = null;

  for (let attempt = 1; attempt <= REQUEST_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= REQUEST_RETRY_ATTEMPTS) {
        break;
      }

      console.warn(
        `${label} failed on attempt ${attempt}/${REQUEST_RETRY_ATTEMPTS}. Retrying...`,
      );
      await sleep(REQUEST_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function getPositiveInteger(value, fallbackValue) {
  const parsed = Number.parseInt(`${value || ""}`, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return parsed;
}

function buildStations() {
  return STATIONS.map((station) => ({
    documentId: buildDocumentId("st", station.name),
    data: {
      name: station.name,
      code: toUpperCode(station.location),
      location: station.location,
      status: station.status,
      manager_name: station.manager,
      manager_phone: "",
      latitude: null,
      longitude: null,
    },
  }));
}

function buildRoles() {
  return ROLE_DEFINITIONS.map((role) => ({
    documentId: role.documentId,
    data: {
      code: role.code,
      name: role.name,
      modules_json: JSON.stringify(role.modules),
      branch_required: role.branchRequired,
      status: "active",
    },
  }));
}

function buildProducts() {
  return PRODUCTS.map((product) => ({
    documentId: buildDocumentId("prd", product.name),
    data: {
      name: product.name,
      sku: `${product.category}-${slugify(product.name)}`.toUpperCase().slice(0, 64),
      category: product.category,
      unit: product.unit,
      status: "active",
      selling_price: product.price,
      description: `Auto-seeded catalog product for ${product.name}.`,
    },
  }));
}

function buildProductPriceHistory(products, users) {
  const changedByName =
    users.find((user) => `${user.role_name || ""}` === "Admin")?.full_name ||
    "System Admin";
  const changedByUserId =
    users.find((user) => `${user.role_name || ""}` === "Admin")?.$id || "";

  return products.map((product, index) => ({
    documentId: buildDocumentId("pph", `${product.data.name}-${index}`),
    data: {
      product_id: product.documentId,
      product_name: product.data.name,
      previous_price: 0,
      new_price: product.data.selling_price,
      changed_at: toIsoDateTime(START_DATE, 6, index),
      changed_by_user_id: changedByUserId,
      changed_by_name: changedByName,
      notes: "Initial seeded price.",
    },
  }));
}

function buildOperatorsByStation(stations, users) {
  const activeUsers = users.filter((user) => `${user.status || ""}` === "active");

  return Object.fromEntries(
    stations.map((station) => {
      const branchManagers = uniqueNames(
        activeUsers
          .filter(
            (user) =>
              user.role_name === "Branch Manager" &&
              user.branch_station_name === station.data.name,
          )
          .map((user) => user.full_name)
          .slice(0, 2),
        [station.data.manager_name],
      );
      const generalSales = uniqueNames(
        activeUsers
          .filter(
            (user) =>
              user.role_name === "General Sales" &&
              user.branch_station_name === station.data.name,
          )
          .map((user) => user.full_name)
          .slice(0, 2),
        [`${station.data.location} General Sales`],
      );
      const fuelSales = uniqueNames(
        activeUsers
          .filter(
            (user) =>
              user.role_name === "Fuel Sales" &&
              user.branch_station_name === station.data.name,
          )
          .map((user) => user.full_name)
          .slice(0, 2),
        [`${station.data.location} Fuel Sales`],
      );

      return [
        station.data.name,
        {
          branchManagers,
          generalSales,
          fuelSales,
        },
      ];
    }),
  );
}

function buildFuelDeliveryPlans(dates, stations, products) {
  const fuelProducts = products.filter((product) => product.data.category === "fuel");
  const plans = [];

  for (const station of stations) {
    for (const product of fuelProducts) {
      for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 2) {
        const date = dates[dateIndex];
        const quantity = quantityFromRange(
          `${station.data.name}|${product.data.name}|delivery|${date}`,
          product.data.name === "Petrol" ? [4200, 7200] : [3800, 6800],
        );

        plans.push({
          documentId: buildDocumentId(
            "fdl",
            `${station.data.name}-${product.data.name}-${date}`,
          ),
          stationName: station.data.name,
          stationId: station.documentId,
          productName: product.data.name,
          productId: product.documentId,
          date,
          quantity,
          unit: product.data.unit,
          status: "delivered",
        });
      }
    }
  }

  return plans;
}

function buildIncomingStockPlans(dates, stations, products) {
  const nonFuelProducts = products.filter((product) => product.data.category !== "fuel");
  const plans = [];

  for (const station of stations) {
    for (const product of nonFuelProducts) {
      for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 3) {
        const date = dates[dateIndex];
        const spec = PRODUCTS.find((entry) => entry.name === product.data.name);
        const quantity = quantityFromRange(
          `${station.data.name}|${product.data.name}|incoming|${date}`,
          spec.incomingRange,
        );

        plans.push({
          documentId: buildDocumentId(
            "isr",
            `${station.data.name}-${product.data.name}-${date}`,
          ),
          stationName: station.data.name,
          stationId: station.documentId,
          productName: product.data.name,
          productId: product.documentId,
          date,
          quantity,
          unit: product.data.unit,
        });
      }
    }
  }

  return plans;
}

function buildSalesData(dates, stations, products, operatorsByStation) {
  const receipts = [];
  const receiptItems = [];
  const salesByKeyAndDate = new Map();
  const dailySalesTotals = new Map();
  const stationDailySummaryMap = new Map();
  const cashierDailySummaryMap = new Map();
  let sequence = 1;

  for (const station of stations) {
    const stationOperators = operatorsByStation[station.data.name];

    for (const product of products) {
      const operators =
        product.data.category === "fuel"
          ? [
              ...stationOperators.branchManagers.map((name) => ({
                name,
                source: "ops",
              })),
              ...stationOperators.fuelSales.map((name) => ({
                name,
                source: "pos",
              })),
            ]
          : [
              ...stationOperators.branchManagers.map((name) => ({
                name,
                source: "ops",
              })),
              ...stationOperators.generalSales.map((name) => ({
                name,
                source: "pos",
              })),
            ];

      for (const operator of operators) {
        const recordCount = 50 + seededInt(`${station.data.name}|${product.data.name}|${operator.name}|count`, 51);
        const spec = PRODUCTS.find((entry) => entry.name === product.data.name);

        for (let recordIndex = 0; recordIndex < recordCount; recordIndex += 1) {
          const date = dates[recordIndex % dates.length];
          const quantity = quantityFromRange(
            `${station.data.name}|${product.data.name}|${operator.name}|qty|${recordIndex}`,
            spec.saleRange,
          );
          const hour = 8 + seededInt(`${station.data.name}|${product.data.name}|${operator.name}|hour|${recordIndex}`, 11);
          const minute = seededInt(
            `${station.data.name}|${product.data.name}|${operator.name}|minute|${recordIndex}`,
            60,
          );
          const saleDate = toIsoDateTime(date, hour, minute);
          const receiptNumber = `${operator.source === "pos" ? "POS" : "OPS"}-${date.replaceAll("-", "")}-${String(sequence).padStart(6, "0")}`;
          const receiptId = buildDocumentId("rcp", receiptNumber);
          const totalAmount = Number((quantity * product.data.selling_price).toFixed(2));
          const summaryDelta = buildSummaryDelta({
            category: product.data.category,
            productName: product.data.name,
            quantity,
            amount: totalAmount,
          });

          receipts.push({
            documentId: receiptId,
            data: {
              receipt_number: receiptNumber,
              station_id: station.documentId,
              station_name: station.data.name,
              sale_date: saleDate,
              source: operator.source,
              subtotal: totalAmount,
              tax_amount: 0,
              discount_amount: 0,
              total_amount: totalAmount,
              payment_method:
                PAYMENT_METHODS[
                  seededInt(
                    `${station.data.name}|${product.data.name}|${operator.name}|payment|${recordIndex}`,
                    PAYMENT_METHODS.length,
                  )
                ],
              payment_method_code:
                PAYMENT_METHODS[
                  seededInt(
                    `${station.data.name}|${product.data.name}|${operator.name}|payment|${recordIndex}`,
                    PAYMENT_METHODS.length,
                  )
                ],
              payment_method_label:
                PAYMENT_METHODS[
                  seededInt(
                    `${station.data.name}|${product.data.name}|${operator.name}|payment|${recordIndex}`,
                    PAYMENT_METHODS.length,
                  )
                ].charAt(0).toUpperCase() +
                PAYMENT_METHODS[
                  seededInt(
                    `${station.data.name}|${product.data.name}|${operator.name}|payment|${recordIndex}`,
                    PAYMENT_METHODS.length,
                  )
                ].slice(1),
              status: "completed",
              cashier_name: operator.name,
              customer_name:
                operator.source === "pos" ? "Walk-in Customer" : "",
              notes: `Auto-seeded ${product.data.name} sale.`,
            },
          });

          receiptItems.push({
            documentId: buildDocumentId("rit", `${receiptNumber}-1`),
            data: {
              receipt_id: receiptId,
              receipt_number: receiptNumber,
              sale_date: saleDate,
              station_id: station.documentId,
              station_name: station.data.name,
              product_id: product.documentId,
              product_name: product.data.name,
              category: product.data.category,
              line_number: 1,
              quantity,
              unit: product.data.unit,
              unit_price: product.data.selling_price,
              line_total: totalAmount,
            },
          });

          accumulateMapValue(
            salesByKeyAndDate,
            makeInventoryDateKey(station.documentId, product.documentId, date),
            quantity,
          );
          accumulateMapValue(
            dailySalesTotals,
            makeInventoryDateKey(station.documentId, product.documentId, date),
            quantity,
          );
          applySummaryDelta(
            stationDailySummaryMap,
            buildStationSummaryKey(date, station.documentId),
            {
              documentId: buildStationSummaryDocumentId(date, station.documentId),
              data: {
                date,
                station_id: station.documentId,
                station_name: station.data.name,
              },
            },
            summaryDelta,
          );
          applySummaryDelta(
            cashierDailySummaryMap,
            buildCashierSummaryKey(date, station.documentId, operator.name),
            {
              documentId: buildCashierSummaryDocumentId(
                date,
                station.documentId,
                operator.name,
              ),
              data: {
                date,
                station_id: station.documentId,
                station_name: station.data.name,
                cashier_user_id: "",
                cashier_name: operator.name,
              },
            },
            summaryDelta,
          );

          sequence += 1;
        }
      }
    }
  }

  return {
    receipts,
    receiptItems,
    salesByKeyAndDate,
    dailySalesTotals,
    stationDailySummaries: Array.from(stationDailySummaryMap.values()),
    cashierDailySummaries: Array.from(cashierDailySummaryMap.values()),
  };
}

function buildStationProductDailySummaries(
  salesResult,
  incomingStockRecords,
  products,
) {
  const summaryMap = new Map();
  const productsById = new Map(
    (Array.isArray(products) ? products : []).map((product) => [
      product.documentId,
      product,
    ]),
  );

  (Array.isArray(salesResult?.receiptItems) ? salesResult.receiptItems : []).forEach(
    (record) => {
      const data = record.data || {};
      const date = `${data.sale_date || ""}`.slice(0, 10);
      const stationId = `${data.station_id || ""}`.trim();
      const stationName = `${data.station_name || ""}`.trim();
      const productId = `${data.product_id || ""}`.trim();
      const productName = resolveStationProductDailySummaryProductName({
        productId,
        productName: data.product_name || "",
        productsById,
      });

      if (!date || !stationId || !stationName || !productName) {
        return;
      }

      const summary = ensureStationProductDailySummary(
        summaryMap,
        `${date}|${stationId}|${buildStationProductDailySummaryIdentity({
          productId,
          productName,
        })}`,
        {
          date,
          stationId,
          stationName,
          productId,
          productName,
          category:
            productsById.get(productId)?.data?.category ||
            data.category ||
            "shop",
          unit: data.unit || productsById.get(productId)?.data?.unit || "",
        },
      );

      summary.data.sold_quantity += Number(data.quantity || 0);
      summary.data.sold_amount += Number(data.line_total || 0);
      summary.data.net_quantity -= Number(data.quantity || 0);
      summary.data.transactions += 1;
    },
  );

  (Array.isArray(incomingStockRecords) ? incomingStockRecords : []).forEach(
    (record) => {
      const data = record.data || {};
      const date = `${data.recorded_at || ""}`.slice(0, 10);
      const stationId = `${data.station_id || ""}`.trim();
      const stationName = `${data.station_name || ""}`.trim();
      const productId = `${data.product_id || ""}`.trim();
      const productName = resolveStationProductDailySummaryProductName({
        productId,
        productName: data.product_name || "",
        productsById,
      });

      if (!date || !stationId || !stationName || !productName) {
        return;
      }

      const summary = ensureStationProductDailySummary(
        summaryMap,
        `${date}|${stationId}|${buildStationProductDailySummaryIdentity({
          productId,
          productName,
        })}`,
        {
          date,
          stationId,
          stationName,
          productId,
          productName,
          category:
            productsById.get(productId)?.data?.category ||
            inferSeedProductCategory(productName),
          unit: data.unit || productsById.get(productId)?.data?.unit || "",
        },
      );

      summary.data.received_quantity += Number(data.quantity_added || 0);
      summary.data.net_quantity += Number(data.quantity_added || 0);
    },
  );

  return Array.from(summaryMap.values());
}

function buildStationCategoryDailySummaries(salesResult) {
  const summaryMap = new Map();

  (Array.isArray(salesResult?.receiptItems) ? salesResult.receiptItems : []).forEach(
    (record) => {
      const data = record.data || {};
      const date = `${data.sale_date || ""}`.slice(0, 10);
      const stationId = `${data.station_id || ""}`.trim();
      const stationName = `${data.station_name || ""}`.trim();
      const category = `${data.category || ""}`.trim().toLowerCase();

      if (!date || !stationId || !stationName || !category) {
        return;
      }

      const summary = ensureStationCategoryDailySummary(
        summaryMap,
        `${date}|${stationId}|${category}`,
        {
          date,
          stationId,
          stationName,
          category,
        },
      );

      summary.data.total_quantity += Number(data.quantity || 0);
      summary.data.total_amount += Number(data.line_total || 0);
      summary.data.transactions += 1;
    },
  );

  return Array.from(summaryMap.values());
}

function ensureStationProductDailySummary(map, key, seed) {
  if (!map.has(key)) {
    map.set(key, {
      documentId: buildDocumentId(
        "spds",
        `${seed.date}-${seed.stationId}-${buildStationProductDailySummaryIdentity({
          productId: seed.productId,
          productName: seed.productName,
        })}`,
      ),
      data: {
        date: seed.date,
        station_id: seed.stationId,
        station_name: seed.stationName,
        product_id: seed.productId || "",
        product_name: seed.productName,
        category: seed.category,
        unit: seed.unit || "",
        received_quantity: 0,
        sold_quantity: 0,
        sold_amount: 0,
        net_quantity: 0,
        transactions: 0,
      },
    });
  }

  return map.get(key);
}

function ensureStationCategoryDailySummary(map, key, seed) {
  if (!map.has(key)) {
    map.set(key, {
      documentId: buildDocumentId(
        "scds",
        `${seed.date}-${seed.stationId}-${seed.category}`,
      ),
      data: {
        date: seed.date,
        station_id: seed.stationId,
        station_name: seed.stationName,
        category: seed.category,
        total_quantity: 0,
        total_amount: 0,
        transactions: 0,
      },
    });
  }

  return map.get(key);
}

function resolveStationProductDailySummaryProductName({
  productId,
  productName,
  productsById,
}) {
  const normalizedProductId = `${productId || ""}`.trim();
  const normalizedProductName = `${productName || ""}`.trim();

  if (normalizedProductId) {
    const product = productsById.get(normalizedProductId);

    if (`${product?.data?.name || ""}`.trim()) {
      return `${product.data.name}`.trim();
    }
  }

  return normalizedProductName;
}

function buildStationProductDailySummaryIdentity({ productId, productName }) {
  const normalizedProductName = `${productName || ""}`.trim().toLowerCase();

  if (normalizedProductName) {
    return normalizedProductName;
  }

  return `${productId || ""}`.trim().toLowerCase();
}

function inferSeedProductCategory(productName = "") {
  const normalizedProductName = `${productName || ""}`.trim().toLowerCase();

  if (
    normalizedProductName.includes("petrol") ||
    normalizedProductName.includes("diesel")
  ) {
    return "fuel";
  }

  if (normalizedProductName.includes("cement")) {
    return "cement";
  }

  return "shop";
}

function buildSummaryDelta({ category, productName, quantity, amount }) {
  const normalizedName = `${productName || ""}`.trim().toLowerCase();
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
    total_sales: Number(amount || 0),
    transactions: 1,
  };

  if (category === "fuel") {
    delta.fuel_sales = Number(amount || 0);

    if (normalizedName.includes("petrol")) {
      delta.petrol_sales = Number(amount || 0);
    } else if (normalizedName.includes("diesel")) {
      delta.diesel_sales = Number(amount || 0);
    }

    return delta;
  }

  if (category === "cement") {
    delta.cement_sales = Number(amount || 0);
    delta.cement_bags_sold = Number(quantity || 0);
    return delta;
  }

  delta.shop_sales = Number(amount || 0);

  if (normalizedName.includes("rice")) {
    delta.rice_sales = Number(amount || 0);
  } else if (normalizedName.includes("cooking oil")) {
    delta.cooking_oil_sales = Number(amount || 0);
  } else {
    delta.other_shop_sales = Number(amount || 0);
  }

  return delta;
}

function applySummaryDelta(map, key, seed, delta) {
  if (!map.has(key)) {
    map.set(key, {
      documentId: seed.documentId,
      data: {
        ...seed.data,
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
    });
  }

  const summary = map.get(key);

  Object.entries(delta).forEach(([field, value]) => {
    summary.data[field] = Number(summary.data[field] || 0) + Number(value || 0);
  });
}

function buildStationSummaryKey(date, stationId) {
  return `${date}|${stationId}`;
}

function buildCashierSummaryKey(date, stationId, cashierName) {
  return `${date}|${stationId}|${cashierName}`;
}

function buildStationSummaryDocumentId(date, stationId) {
  return buildDocumentId("sds", `${date}-${stationId}`);
}

function buildCashierSummaryDocumentId(date, stationId, cashierName) {
  return buildDocumentId("cds", `${date}-${stationId}-${cashierName}`);
}

function buildInventoryItems(
  stations,
  products,
  deliveryPlans,
  incomingPlans,
  salesByKeyAndDate,
  dates,
) {
  const deliveriesByKeyAndDate = sumPlansByKeyAndDate(deliveryPlans);
  const incomingByKeyAndDate = sumPlansByKeyAndDate(incomingPlans);

  return stations.flatMap((station) =>
    products.map((product) => {
      const spec = PRODUCTS.find((entry) => entry.name === product.data.name);
      let quantity = Number(spec.openingQuantity);

      for (const date of dates) {
        quantity +=
          deliveriesByKeyAndDate.get(
            makeInventoryDateKey(station.documentId, product.documentId, date),
          ) || 0;
        quantity +=
          incomingByKeyAndDate.get(
            makeInventoryDateKey(station.documentId, product.documentId, date),
          ) || 0;
        quantity -=
          salesByKeyAndDate.get(
            makeInventoryDateKey(station.documentId, product.documentId, date),
          ) || 0;
      }

      const adjustedQuantity = Math.max(0, Number(quantity.toFixed(2)));

      return {
        documentId: buildDocumentId("inv", `${station.data.name}-${product.data.name}`),
        data: {
          station_id: station.documentId,
          station_name: station.data.name,
          product_id: product.documentId,
          product_name: product.data.name,
          category: product.data.category,
          quantity: adjustedQuantity,
          unit: product.data.unit,
          reorder_level: spec.reorderLevel,
          status: getInventoryStatus(adjustedQuantity, spec.reorderLevel),
          last_updated_at: toIsoDateTime(dates[dates.length - 1], 22, 59),
        },
      };
    }),
  );
}

function buildIncomingStockRecords(
  incomingPlans,
  inventoryItems,
  dailySalesTotals,
  dates,
) {
  const inventoryMap = new Map(
    inventoryItems.map((item) => [`${item.data.station_id}|${item.data.product_id}`, item]),
  );
  const openings = new Map(
    inventoryItems.map((item) => {
      const spec = PRODUCTS.find((entry) => entry.name === item.data.product_name);
      return [`${item.data.station_id}|${item.data.product_id}`, Number(spec.openingQuantity)];
    }),
  );
  const runningBalances = new Map(openings);
  const records = [];
  const plansByDate = groupBy(incomingPlans, (plan) => plan.date);

  for (const date of dates) {
    const datePlans = plansByDate.get(date) || [];

    for (const plan of datePlans) {
      const balanceKey = `${plan.stationId}|${plan.productId}`;
      const inventoryItem = inventoryMap.get(balanceKey);
      const previousQuantity = runningBalances.get(balanceKey) || 0;
      const newQuantity = previousQuantity + plan.quantity;

      runningBalances.set(balanceKey, newQuantity);

      records.push({
        documentId: plan.documentId,
        data: {
          inventory_item_id: inventoryItem.documentId,
          station_id: plan.stationId,
          station_name: plan.stationName,
          product_id: plan.productId,
          product_name: plan.productName,
          quantity_added: plan.quantity,
          previous_quantity: previousQuantity,
          new_quantity: newQuantity,
          unit: plan.unit,
          recorded_at: toIsoDateTime(
            date,
            7 + seededInt(`${plan.stationName}|${plan.productName}|incoming-hour|${date}`, 3),
            seededInt(`${plan.stationName}|${plan.productName}|incoming-minute|${date}`, 60),
          ),
          recorded_by: `${plan.stationName.split(" ")[0]} Warehouse`,
          notes: `Auto-seeded incoming stock for ${plan.productName}.`,
        },
      });
    }

    for (const [balanceKey, balanceValue] of runningBalances.entries()) {
      const [stationId, productId] = balanceKey.split("|");
      const soldQuantity =
        dailySalesTotals.get(makeInventoryDateKey(stationId, productId, date)) || 0;

      runningBalances.set(balanceKey, Math.max(0, balanceValue - soldQuantity));
    }
  }

  return records;
}

function buildFuelDeliveries(deliveryPlans) {
  return deliveryPlans.map((plan, index) => ({
    documentId: plan.documentId,
    data: {
      station_id: plan.stationId,
      station_name: plan.stationName,
      product_id: plan.productId,
      product_name: plan.productName,
      delivery_date: toIsoDateTime(dateOnly(plan.date), 6 + (index % 5), 10 + (index % 40)),
      quantity: plan.quantity,
      unit: plan.unit,
      status: plan.status,
      supplier: "Jah Oil Supply",
      reference_no: `FDL-${plan.date.replaceAll("-", "")}-${String(index + 1).padStart(4, "0")}`,
      driver_name: "Supply Driver",
      recorded_by: `${plan.stationName.split(" ")[0]} Warehouse`,
      notes: `Auto-seeded fuel delivery for ${plan.productName}.`,
    },
  }));
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function currentDateString() {
  return new Date().toISOString().slice(0, 10);
}

function quantityFromRange(seed, [min, max]) {
  if (max <= min) {
    return min;
  }

  return min + seededInt(seed, max - min + 1);
}

function seededInt(seed, modulo) {
  if (modulo <= 0) {
    return 0;
  }

  const hex = crypto.createHash("sha1").update(String(seed)).digest("hex").slice(0, 12);
  return Number.parseInt(hex, 16) % modulo;
}

function uniqueNames(values, fallbackValues = []) {
  const set = new Set(
    [...values, ...fallbackValues].map((value) => `${value || ""}`.trim()).filter(Boolean),
  );

  return Array.from(set);
}

function sumPlansByKeyAndDate(plans) {
  const totals = new Map();

  for (const plan of plans) {
    accumulateMapValue(
      totals,
      makeInventoryDateKey(plan.stationId, plan.productId, plan.date),
      Number(plan.quantity || 0),
    );
  }

  return totals;
}

function accumulateMapValue(map, key, amount) {
  map.set(key, Number((map.get(key) || 0) + Number(amount || 0)));
}

function makeInventoryDateKey(stationId, productId, date) {
  return `${stationId}|${productId}|${date}`;
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

function getInventoryStatus(quantity, reorderLevel) {
  if (Number(quantity) <= 0) {
    return "out";
  }

  if (Number(quantity) <= Number(reorderLevel)) {
    return "low";
  }

  return "in_stock";
}

function dateOnly(value) {
  return `${value}`.slice(0, 10);
}

function toIsoDateTime(date, hour = 12, minute = 0) {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function toUpperCode(value) {
  return slugify(value).replaceAll("-", "_").toUpperCase().slice(0, 64);
}

function slugify(value) {
  return `${value}`
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildDocumentId(prefix, value) {
  const hash = crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 24);
  return `${prefix}_${hash}`.slice(0, 36);
}

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}

function printSummary(summary) {
  console.log(`Preserved users: ${summary.preservedUsers}`);
  console.log(`stations: ${summary.stations.length}`);
  console.log(`app_roles: ${summary.roles.length}`);
  console.log(`products: ${summary.products.length}`);
  console.log(`product_price_history: ${summary.priceHistory.length}`);
  console.log(`inventory_items: ${summary.inventoryItems.length}`);
  console.log(`incoming_stock_records: ${summary.incomingStockRecords.length}`);
  console.log(`fuel_deliveries: ${summary.fuelDeliveries.length}`);
  console.log(`sales_receipts: ${summary.receipts.length}`);
  console.log(`sales_receipt_items: ${summary.receiptItems.length}`);
  console.log(
    `station_category_daily_summary: ${summary.stationCategoryDailySummaries.length}`,
  );
  console.log(
    `station_product_daily_summary: ${summary.stationProductDailySummaries.length}`,
  );
}

function printUsage() {
  console.log(`
Usage:
  node scripts/reset-and-seed-appwrite-records.mjs

Behavior:
  - Deletes all documents from Appwrite collections except app_users
  - Recreates roles, stations, products, inventory, stock, deliveries, and sales data
  - Seeds records from June 1, 2026 through today

Required environment variables:
  NEXT_PUBLIC_APPWRITE_ENDPOINT
  NEXT_PUBLIC_APPWRITE_PROJECT_ID
  APPWRITE_API_KEY
  APPWRITE_DATABASE_ID

Optional flags:
  --endpoint <url>
  --projectId <id>
  --apiKey <key>
  --databaseId <id>
  --dry-run
  --help
`);
}
