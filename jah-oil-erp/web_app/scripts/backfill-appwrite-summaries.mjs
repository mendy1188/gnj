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
  salesReceipts: "sales_receipts",
  salesReceiptItems: "sales_receipt_items",
  stationDailySummary: "station_daily_summary",
  cashierDailySummary: "cashier_daily_summary",
  products: "products",
  incomingStockRecords: "incoming_stock_records",
  stationProductDailySummary: "station_product_daily_summary",
  stationCategoryDailySummary: "station_category_daily_summary",
};

const DELETE_BATCH_SIZE = 25;
const CREATE_BATCH_SIZE = 25;

loadEnvFiles();

const cliArgs = parseArgs(process.argv.slice(2), {
  booleanFlags: ["dry-run", "help"],
});
const config = createAdminConfig(cliArgs);

if (cliArgs.help) {
  printUsage();
  process.exit(0);
}

validateAdminConfig(config);

main().catch((error) => {
  console.error(`Backfill failed: ${error.message}`);

  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }

  process.exit(1);
});

async function main() {
  console.log(`Using Appwrite endpoint: ${config.apiBaseUrl}`);
  console.log(`Target database ID: ${config.databaseId}`);

  const databases = createDatabasesClient(config);
  const [receipts, receiptItems, products, incomingStockRecords] = await Promise.all([
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
    listAllDocuments(databases, config.databaseId, COLLECTIONS.products, [
      Query.select(["$id", "name", "category", "unit"]),
    ]),
    listAllDocuments(databases, config.databaseId, COLLECTIONS.incomingStockRecords, [
      Query.select([
        "$id",
        "station_id",
        "station_name",
        "product_id",
        "product_name",
        "quantity_added",
        "unit",
        "recorded_at",
      ]),
    ]),
  ]);

  const result = buildSalesSummaries(
    receipts,
    receiptItems,
    products,
    incomingStockRecords,
  );

  console.log(`sales_receipts: ${receipts.length}`);
  console.log(`sales_receipt_items: ${receiptItems.length}`);
  console.log(`incoming_stock_records: ${incomingStockRecords.length}`);
  console.log(`station_daily_summary: ${result.stationDailySummaries.length}`);
  console.log(`cashier_daily_summary: ${result.cashierDailySummaries.length}`);
  console.log(
    `station_category_daily_summary: ${result.stationCategoryDailySummaries.length}`,
  );
  console.log(
    `station_product_daily_summary: ${result.stationProductDailySummaries.length}`,
  );

  if (result.orphanReceiptItemGroups > 0) {
    console.log(
      `orphan_receipt_item_groups: ${result.orphanReceiptItemGroups} (grouped under "Unknown Cashier" where needed)`,
    );
  }

  if (result.skippedReceiptItemGroups > 0) {
    console.log(
      `skipped_receipt_item_groups: ${result.skippedReceiptItemGroups} (missing date or station metadata)`,
    );
  }

  if (config.dryRun) {
    console.log("Dry run only. No Appwrite API requests will be sent.");
    return;
  }

  const deletedStation = await clearCollection(
    databases,
    config.databaseId,
    COLLECTIONS.stationDailySummary,
  );
  console.log(`${COLLECTIONS.stationDailySummary}: deleted ${deletedStation}`);

  const deletedCashier = await clearCollection(
    databases,
    config.databaseId,
    COLLECTIONS.cashierDailySummary,
  );
  console.log(`${COLLECTIONS.cashierDailySummary}: deleted ${deletedCashier}`);

  const deletedStationProduct = await clearCollection(
    databases,
    config.databaseId,
    COLLECTIONS.stationProductDailySummary,
  );
  console.log(
    `${COLLECTIONS.stationProductDailySummary}: deleted ${deletedStationProduct}`,
  );

  const deletedStationCategory = await clearCollection(
    databases,
    config.databaseId,
    COLLECTIONS.stationCategoryDailySummary,
  );
  console.log(
    `${COLLECTIONS.stationCategoryDailySummary}: deleted ${deletedStationCategory}`,
  );

  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.stationDailySummary,
    result.stationDailySummaries,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.cashierDailySummary,
    result.cashierDailySummaries,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.stationCategoryDailySummary,
    result.stationCategoryDailySummaries,
  );
  await seedCollection(
    databases,
    config.databaseId,
    COLLECTIONS.stationProductDailySummary,
    result.stationProductDailySummaries,
  );

  console.log("Appwrite summary backfill completed successfully.");
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

async function clearCollection(databases, databaseId, collectionId) {
  const documents = await listAllDocuments(databases, databaseId, collectionId, [
    Query.select(["$id"]),
  ]);

  if (documents.length === 0) {
    return 0;
  }

  await processInBatches(
    documents,
    DELETE_BATCH_SIZE,
    async (document) => {
      await databases.deleteDocument(databaseId, collectionId, document.$id);
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

  await processInBatches(
    records,
    CREATE_BATCH_SIZE,
    async (record) => {
      await upsertDocument(
        databases,
        databaseId,
        collectionId,
        record.documentId,
        cleanData(record.data),
      );
    },
    (processed) => {
      console.log(`${collectionId}: created ${processed}/${records.length}`);
    },
  );
}

async function upsertDocument(
  databases,
  databaseId,
  collectionId,
  documentId,
  data,
) {
  try {
    await databases.createDocument(
      databaseId,
      collectionId,
      documentId,
      data,
    );
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    const existingDocumentId = await resolveExistingDocumentId(
      databases,
      databaseId,
      collectionId,
      documentId,
      data,
    );

    if (!existingDocumentId) {
      throw error;
    }

    await databases.updateDocument(
      databaseId,
      collectionId,
      existingDocumentId,
      data,
    );
  }
}

async function resolveExistingDocumentId(
  databases,
  databaseId,
  collectionId,
  documentId,
  data,
) {
  const directDocument = await getDocumentOrNull(
    databases,
    databaseId,
    collectionId,
    documentId,
  );

  if (directDocument?.$id) {
    return directDocument.$id;
  }

  const lookupQueries = buildExistingDocumentLookupQueries(collectionId, data);

  if (lookupQueries.length === 0) {
    return null;
  }

  const response = await databases.listDocuments(databaseId, collectionId, [
    ...lookupQueries,
    Query.limit(1),
  ]);

  return response.documents?.[0]?.$id || null;
}

async function getDocumentOrNull(
  databases,
  databaseId,
  collectionId,
  documentId,
) {
  try {
    return await databases.getDocument(databaseId, collectionId, documentId);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function buildExistingDocumentLookupQueries(collectionId, data) {
  if (collectionId === COLLECTIONS.stationDailySummary) {
    return buildEqualityQueries({
      date: data.date,
      station_id: data.station_id,
    });
  }

  if (collectionId === COLLECTIONS.cashierDailySummary) {
    return buildEqualityQueries({
      date: data.date,
      station_id: data.station_id,
      cashier_name: data.cashier_name,
    });
  }

  if (collectionId === COLLECTIONS.stationProductDailySummary) {
    return buildEqualityQueries({
      date: data.date,
      station_id: data.station_id,
      product_name: data.product_name,
    });
  }

  if (collectionId === COLLECTIONS.stationCategoryDailySummary) {
    return buildEqualityQueries({
      date: data.date,
      station_id: data.station_id,
      category: data.category,
    });
  }

  return [];
}

function buildEqualityQueries(fields) {
  return Object.entries(fields)
    .filter(([, value]) => `${value || ""}`.trim())
    .map(([field, value]) => Query.equal(field, `${value}`.trim()));
}

async function processInBatches(items, batchSize, worker, onProgress) {
  let processed = 0;

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);

    await Promise.all(batch.map((item) => worker(item)));

    processed += batch.length;
    onProgress?.(processed);
  }
}

function buildSalesSummaries(receipts, receiptItems, products, incomingStockRecords) {
  const receiptsById = new Map(
    (Array.isArray(receipts) ? receipts : []).map((receipt) => [receipt.$id, receipt]),
  );
  const productsById = new Map(
    (Array.isArray(products) ? products : []).map((product) => [product.$id, product]),
  );
  const productsByName = new Map(
    (Array.isArray(products) ? products : []).map((product) => [
      `${product.name || ""}`.trim().toLowerCase(),
      product,
    ]),
  );
  const receiptItemsByReceiptId = groupBy(
    Array.isArray(receiptItems) ? receiptItems : [],
    (item) => `${item.receipt_id || ""}`,
  );
  const stationSummaryMap = new Map();
  const cashierSummaryMap = new Map();
  const stationCategorySummaryMap = new Map();
  const stationProductSummaryMap = new Map();
  let orphanReceiptItemGroups = 0;
  let skippedReceiptItemGroups = 0;

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

    if (!receipt) {
      orphanReceiptItemGroups += 1;
    }

    if (!date || !stationId || !stationName) {
      skippedReceiptItemGroups += 1;
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
      const categoryLabel = inferProductCategory(
        productsById.get(item.product_id || "")?.category ||
          productsByName.get(
            `${resolveStationProductSummaryProductName({
              productId: item.product_id,
              productName: item.product_name,
              productsById,
              productsByName,
            }) || ""}`
              .trim()
              .toLowerCase(),
          )?.category ||
          item.category,
        resolveStationProductSummaryProductName({
          productId: item.product_id,
          productName: item.product_name,
          productsById,
          productsByName,
        }) || "",
      );
      const categorySummary = ensureStationCategorySummary(
        stationCategorySummaryMap,
        `${date}|${stationId}|${categoryLabel}`,
        date,
        stationId,
        stationName,
        categoryLabel,
      );
      applyStationCategorySummaryDelta(categorySummary.data, {
        total_quantity: Number(item.quantity || 0),
        total_amount: Number(item.line_total || 0),
        transactions: 1,
      });
      const productSummary = ensureStationProductSummary(
        stationProductSummaryMap,
        `${date}|${stationId}|${buildStationProductSummaryIdentity({
          productId: item.product_id,
          productName: resolveStationProductSummaryProductName({
            productId: item.product_id,
            productName: item.product_name,
            productsById,
            productsByName,
          }),
        })}`,
        {
          date,
          stationId,
          stationName,
          productId: item.product_id || "",
          productName: resolveStationProductSummaryProductName({
            productId: item.product_id,
            productName: item.product_name,
            productsById,
            productsByName,
          }),
          category: inferProductCategory(
            productsById.get(item.product_id || "")?.category ||
              productsByName.get(
                `${resolveStationProductSummaryProductName({
                  productId: item.product_id,
                  productName: item.product_name,
                  productsById,
                  productsByName,
                }) || ""}`
                  .trim()
                  .toLowerCase(),
              )?.category ||
              item.category,
            resolveStationProductSummaryProductName({
              productId: item.product_id,
              productName: item.product_name,
              productsById,
              productsByName,
            }) || "",
          ),
          unit:
            item.unit ||
            productsById.get(item.product_id || "")?.unit ||
            productsByName.get(
              `${resolveStationProductSummaryProductName({
                productId: item.product_id,
                productName: item.product_name,
                productsById,
                productsByName,
              }) || ""}`
                .trim()
                .toLowerCase(),
            )?.unit ||
            "",
        },
      );
      applyStationProductSummaryDelta(productSummary.data, {
        received_quantity: 0,
        sold_quantity: Number(item.quantity || 0),
        sold_amount: Number(item.line_total || 0),
        net_quantity: -Number(item.quantity || 0),
        transactions: 1,
      });
    }
  }

  (Array.isArray(incomingStockRecords) ? incomingStockRecords : []).forEach(
    (record) => {
      const date = `${record.recorded_at || ""}`.slice(0, 10);
      const stationId = `${record.station_id || ""}`.trim();
      const stationName = `${record.station_name || ""}`.trim();
      const productId = `${record.product_id || ""}`.trim();
      const productName = `${record.product_name || ""}`.trim();

      if (!date || !stationId || !stationName || !productName) {
        return;
      }

      const productSummary = ensureStationProductSummary(
        stationProductSummaryMap,
        `${date}|${stationId}|${buildStationProductSummaryIdentity({
          productId,
          productName: resolveStationProductSummaryProductName({
            productId,
            productName,
            productsById,
            productsByName,
          }),
        })}`,
        {
          date,
          stationId,
          stationName,
          productId,
          productName: resolveStationProductSummaryProductName({
            productId,
            productName,
            productsById,
            productsByName,
          }),
          category: inferProductCategory(
            productsById.get(productId)?.category ||
              productsByName.get(
                resolveStationProductSummaryProductName({
                  productId,
                  productName,
                  productsById,
                  productsByName,
                }).toLowerCase(),
              )?.category,
            resolveStationProductSummaryProductName({
              productId,
              productName,
              productsById,
              productsByName,
            }),
          ),
          unit:
            record.unit ||
            productsById.get(productId)?.unit ||
            productsByName.get(
              resolveStationProductSummaryProductName({
                productId,
                productName,
                productsById,
                productsByName,
              }).toLowerCase(),
            )?.unit ||
            "",
        },
      );

      applyStationProductSummaryDelta(productSummary.data, {
        received_quantity: Number(record.quantity_added || 0),
        sold_quantity: 0,
        sold_amount: 0,
        net_quantity: Number(record.quantity_added || 0),
        transactions: 0,
      });
    },
  );

  return {
    stationDailySummaries: Array.from(stationSummaryMap.values()),
    cashierDailySummaries: Array.from(cashierSummaryMap.values()),
    stationCategoryDailySummaries: Array.from(stationCategorySummaryMap.values()),
    stationProductDailySummaries: Array.from(stationProductSummaryMap.values()),
    orphanReceiptItemGroups,
    skippedReceiptItemGroups,
  };
}

function ensureStationSummary(map, key, date, stationId, stationName) {
  if (!map.has(key)) {
    map.set(key, {
      documentId: buildDocumentId("sds", `${date}-${stationId}`),
      data: {
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
      },
    });
  }

  return map.get(key);
}

function ensureCashierSummary(
  map,
  key,
  date,
  stationId,
  stationName,
  cashierName,
) {
  if (!map.has(key)) {
    map.set(key, {
      documentId: buildDocumentId("cds", `${date}-${stationId}-${cashierName}`),
      data: {
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
      },
    });
  }

  return map.get(key);
}

function ensureStationCategorySummary(
  map,
  key,
  date,
  stationId,
  stationName,
  category,
) {
  if (!map.has(key)) {
    map.set(key, {
      documentId: buildDocumentId("scds", `${date}-${stationId}-${category}`),
      data: {
        date,
        station_id: stationId,
        station_name: stationName,
        category,
        total_quantity: 0,
        total_amount: 0,
        transactions: 0,
      },
    });
  }

  return map.get(key);
}

function ensureStationProductSummary(map, key, seed) {
  if (!map.has(key)) {
    map.set(key, {
      documentId: buildDocumentId(
        "spds",
        `${seed.date}-${seed.stationId}-${buildStationProductSummaryIdentity({
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

function resolveStationProductSummaryProductName({
  productId,
  productName,
  productsById,
  productsByName,
}) {
  const normalizedProductId = `${productId || ""}`.trim();
  const normalizedProductName = `${productName || ""}`.trim();

  if (normalizedProductId) {
    const product = productsById.get(normalizedProductId);

    if (`${product?.name || ""}`.trim()) {
      return `${product.name}`.trim();
    }
  }

  if (normalizedProductName) {
    const product = productsByName.get(normalizedProductName.toLowerCase());

    if (`${product?.name || ""}`.trim()) {
      return `${product.name}`.trim();
    }
  }

  return normalizedProductName;
}

function buildStationProductSummaryIdentity({ productId, productName }) {
  const normalizedProductName = `${productName || ""}`.trim().toLowerCase();

  if (normalizedProductName) {
    return normalizedProductName;
  }

  return `${productId || ""}`.trim().toLowerCase();
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
  Object.entries(delta).forEach(([key, value]) => {
    summary[key] = Number(summary[key] || 0) + Number(value || 0);
  });
}

function applyStationCategorySummaryDelta(summary, delta) {
  Object.entries(delta).forEach(([key, value]) => {
    summary[key] = Number(summary[key] || 0) + Number(value || 0);
  });
}

function applyStationProductSummaryDelta(summary, delta) {
  Object.entries(delta).forEach(([key, value]) => {
    summary[key] = Number(summary[key] || 0) + Number(value || 0);
  });
}

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}

function isAlreadyExistsError(error) {
  return (
    Number(error?.code) === 409 ||
    `${error?.type || ""}`.toLowerCase().includes("already_exists") ||
    `${error?.message || ""}`.toLowerCase().includes("already exists")
  );
}

function isNotFoundError(error) {
  return (
    Number(error?.code) === 404 ||
    `${error?.type || ""}`.toLowerCase().includes("not_found") ||
    `${error?.message || ""}`.toLowerCase().includes("could not be found")
  );
}

function buildDocumentId(prefix, value) {
  const hash = crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 24);
  return `${prefix}_${hash}`.slice(0, 36);
}

function inferProductCategory(category, productName = "") {
  const normalizedCategory = `${category || ""}`.trim().toLowerCase();

  if (["fuel", "shop", "cement"].includes(normalizedCategory)) {
    return normalizedCategory;
  }

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

function groupBy(records, getKey) {
  const groups = new Map();

  for (const record of records) {
    const key = getKey(record);
    const values = groups.get(key) || [];
    values.push(record);
    groups.set(key, values);
  }

  return groups;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/backfill-appwrite-summaries.mjs

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
