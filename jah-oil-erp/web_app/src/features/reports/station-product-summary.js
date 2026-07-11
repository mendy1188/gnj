import { createHash } from "node:crypto";

import { Query } from "appwrite";

import { getServerAppwriteConfig } from "@/lib/env";

export const STATION_PRODUCT_DAILY_SUMMARY_COLLECTION =
  "station_product_daily_summary";

const stationProductSummaryWriteLocks =
  globalThis.__jahOilStationProductSummaryWriteLocks || new Map();
const SUMMARY_READ_RETRY_ATTEMPTS = 5;
const SUMMARY_READ_RETRY_DELAY_MS = 120;

if (!globalThis.__jahOilStationProductSummaryWriteLocks) {
  globalThis.__jahOilStationProductSummaryWriteLocks =
    stationProductSummaryWriteLocks;
}

export function normalizeProductSummaryCategory(category, productName = "") {
  const normalizedCategory = `${category || ""}`.trim().toLowerCase();

  if (normalizedCategory === "fuel") {
    return "fuel";
  }

  if (normalizedCategory === "cement") {
    return "cement";
  }

  if (normalizedCategory === "shop") {
    return "shop";
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

export function buildStationProductSummaryDocumentId({
  date,
  stationId,
  productId,
  productName = "",
}) {
  return buildSummaryDocumentId(
    "spds",
    `${date || ""}-${stationId || ""}-${buildStationProductSummaryIdentity({
      productId,
      productName,
    })}`,
  );
}

export async function upsertStationProductDailySummary(databases, payload = {}) {
  const date = `${payload?.date || ""}`.slice(0, 10);
  const stationId = `${payload?.stationId || ""}`.trim();
  const stationName = `${payload?.stationName || ""}`.trim();
  const productId = `${payload?.productId || ""}`.trim();
  const productName = `${payload?.productName || ""}`.trim();
  const category = normalizeProductSummaryCategory(
    payload?.category,
    productName,
  );
  const unit = `${payload?.unit || ""}`.trim();

  if (!date || !stationId || !productName) {
    return;
  }

  const summaryDelta = {
    received_quantity: Number(payload?.receivedQuantityDelta || 0),
    sold_quantity: Number(payload?.soldQuantityDelta || 0),
    sold_amount: Number(payload?.soldAmountDelta || 0),
    net_quantity:
      Number(payload?.receivedQuantityDelta || 0) -
      Number(payload?.soldQuantityDelta || 0),
    transactions: Number(payload?.transactionsDelta || 0),
  };
  const documentId = buildStationProductSummaryDocumentId({
    date,
    stationId,
    productId,
    productName,
  });

  await upsertStationProductSummaryDocument(
    databases,
    documentId,
    {
      date,
      station_id: stationId,
      station_name: stationName,
      product_id: productId,
      product_name: productName,
      category,
      unit,
    },
    summaryDelta,
  );
}

export async function upsertStationProductDailySummariesForSale(
  databases,
  { saleDate, stationId, stationName, items, multiplier = 1 } = {},
) {
  const date = `${saleDate || ""}`.slice(0, 10);
  const normalizedItems = Array.isArray(items) ? items : [];

  await Promise.all(
    normalizedItems.map((item) =>
      upsertStationProductDailySummary(databases, {
        date,
        stationId,
        stationName,
        productId: item?.productId || "",
        productName: item?.productName || "",
        category: item?.category || "",
        unit: item?.unit || "",
        soldQuantityDelta: Number(item?.quantity || 0) * Number(multiplier || 1),
        soldAmountDelta: Number(item?.lineTotal || 0) * Number(multiplier || 1),
        transactionsDelta: Number(multiplier || 1),
      }),
    ),
  );
}

async function upsertStationProductSummaryDocument(
  databases,
  documentId,
  seedData,
  summaryDelta,
) {
  return withSummaryWriteLock(documentId, async () => {
    const databaseId = getServerAppwriteConfig().databaseId;
    let currentDocument = await findStationProductSummaryDocument(
      databases,
      documentId,
      seedData,
    );

    if (!currentDocument) {
      try {
        await databases.createDocument(
          databaseId,
          STATION_PRODUCT_DAILY_SUMMARY_COLLECTION,
          documentId,
          {
            ...seedData,
            ...summaryDelta,
          },
        );
        return;
      } catch (error) {
        if (!isAlreadyExistsError(error)) {
          throw error;
        }

        currentDocument = await waitForStationProductSummaryDocument(
          databases,
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
      STATION_PRODUCT_DAILY_SUMMARY_COLLECTION,
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

async function findStationProductSummaryDocument(databases, documentId, seedData) {
  const directDocument = await getDocumentOrNull(
    databases,
    STATION_PRODUCT_DAILY_SUMMARY_COLLECTION,
    documentId,
  );

  if (directDocument) {
    return directDocument;
  }

  const date = `${seedData?.date || ""}`.trim();
  const stationId = `${seedData?.station_id || ""}`.trim();
  const productName = `${seedData?.product_name || ""}`.trim();

  if (!date || !stationId || !productName) {
    return null;
  }

  const queries = [
    Query.equal("date", date),
    Query.equal("station_id", stationId),
    Query.equal("product_name", productName),
  ];

  const response = await databases.listDocuments(
    getServerAppwriteConfig().databaseId,
    STATION_PRODUCT_DAILY_SUMMARY_COLLECTION,
    [...queries, Query.limit(1)],
  );

  return response.documents?.[0] || null;
}

async function waitForStationProductSummaryDocument(
  databases,
  documentId,
  seedData,
) {
  for (
    let attempt = 1;
    attempt <= SUMMARY_READ_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    const document = await findStationProductSummaryDocument(
      databases,
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

function withSummaryWriteLock(lockKey, worker) {
  const previous =
    stationProductSummaryWriteLocks.get(lockKey) || Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(worker)
    .finally(() => {
      if (stationProductSummaryWriteLocks.get(lockKey) === current) {
        stationProductSummaryWriteLocks.delete(lockKey);
      }
    });

  stationProductSummaryWriteLocks.set(lockKey, current);
  return current;
}

function buildSummaryDocumentId(prefix, value) {
  return `${prefix}_${createHash("sha1")
    .update(String(value || ""))
    .digest("hex")
    .slice(0, 24)}`.slice(0, 36);
}

function buildStationProductSummaryIdentity({ productId, productName }) {
  const normalizedProductName = `${productName || ""}`.trim().toLowerCase();

  if (normalizedProductName) {
    return normalizedProductName;
  }

  return `${productId || ""}`.trim().toLowerCase();
}

function isNotFoundError(error) {
  return `${error?.code || ""}` === "404" || `${error?.type || ""}` === "document_not_found";
}

function isAlreadyExistsError(error) {
  return (
    `${error?.code || ""}` === "409" ||
    `${error?.type || ""}` === "document_already_exists"
  );
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
