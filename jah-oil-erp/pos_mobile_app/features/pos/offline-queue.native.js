import * as SQLite from "expo-sqlite";

import storage from "../storage/local-storage";

const DATABASE_NAME = "jah_pos_mobile_queue.db";
const TABLE_NAME = "pending_pos_sales";
const POS_PENDING_SALES_KEY = "jah_pos_mobile_pending_sales_v1";

let databasePromise = null;
let migrationPromise = null;

function safeParseJson(value, fallbackValue) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function normalizeDate(value, fallbackValue = "") {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return fallbackValue;
  }

  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? fallbackValue : date.toISOString();
}

function normalizeQueueEntry(entry) {
  const payload = entry?.payload && typeof entry.payload === "object"
    ? entry.payload
    : {};
  const id = `${entry?.id || payload.clientSaleId || ""}`.trim();
  const syncAction = `${entry?.syncAction || payload.syncAction || "sale_create"}`
    .trim()
    .toLowerCase();
  const saleDate = normalizeDate(payload.saleDate || entry?.saleDate, "");
  const normalizedPayload = {
    ...payload,
    syncAction,
    clientSaleId: id,
    ...(saleDate ? { saleDate } : {}),
  };

  return {
    id,
    syncAction,
    status: `${entry?.status || "queued"}`.trim() || "queued",
    queuedAt: normalizeDate(entry?.queuedAt, new Date().toISOString()),
    saleDate,
    stationName: `${payload.stationName || entry?.stationName || ""}`.trim(),
    cashierName: `${payload.cashierName || entry?.cashierName || ""}`.trim(),
    amount: Number(entry?.amount ?? payload.totalAmount ?? 0) || 0,
    retryCount: Math.max(0, Number(entry?.retryCount || 0)),
    nextRetryAt: normalizeDate(entry?.nextRetryAt, ""),
    lastAttemptAt: normalizeDate(entry?.lastAttemptAt, ""),
    lastError: `${entry?.lastError || ""}`.trim(),
    payload: normalizedPayload,
    updatedAt: normalizeDate(entry?.updatedAt, new Date().toISOString()),
  };
}

function rowToQueueEntry(row) {
  const payload = safeParseJson(row.payload_json, {});

  return {
    id: row.id,
    syncAction: row.sync_action || payload.syncAction || "sale_create",
    queuedAt: row.queued_at || "",
    saleDate: row.sale_date || payload.saleDate || "",
    stationName: row.station_name || payload.stationName || "",
    cashierName: row.cashier_name || payload.cashierName || "",
    amount: Number(row.amount || 0),
    status: row.status || "queued",
    retryCount: Number(row.retry_count || 0),
    nextRetryAt: row.next_retry_at || "",
    lastAttemptAt: row.last_attempt_at || "",
    lastError: row.last_error || "",
    payload: {
      ...payload,
      clientSaleId: payload.clientSaleId || row.id,
      syncAction: payload.syncAction || row.sync_action || "sale_create",
      saleDate: payload.saleDate || row.sale_date || "",
    },
  };
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(
      async (database) => {
        await database.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
            id TEXT PRIMARY KEY NOT NULL,
            sync_action TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            queued_at TEXT NOT NULL,
            sale_date TEXT,
            station_name TEXT,
            cashier_name TEXT,
            amount REAL NOT NULL DEFAULT 0,
            retry_count INTEGER NOT NULL DEFAULT 0,
            next_retry_at TEXT,
            last_attempt_at TEXT,
            last_error TEXT,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_pending_pos_sales_status_queued
            ON ${TABLE_NAME} (status, queued_at);
          CREATE INDEX IF NOT EXISTS idx_pending_pos_sales_station_date
            ON ${TABLE_NAME} (station_name, sale_date);
          CREATE INDEX IF NOT EXISTS idx_pending_pos_sales_cashier_date
            ON ${TABLE_NAME} (cashier_name, sale_date);
          CREATE INDEX IF NOT EXISTS idx_pending_pos_sales_next_retry
            ON ${TABLE_NAME} (next_retry_at);
        `);

        return database;
      },
    );
  }

  return databasePromise;
}

async function insertOrReplaceQueueEntry(database, entry) {
  const normalizedEntry = normalizeQueueEntry(entry);

  if (!normalizedEntry.id) {
    return;
  }

  await database.runAsync(
    `
      INSERT OR REPLACE INTO ${TABLE_NAME} (
        id,
        sync_action,
        status,
        queued_at,
        sale_date,
        station_name,
        cashier_name,
        amount,
        retry_count,
        next_retry_at,
        last_attempt_at,
        last_error,
        payload_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    normalizedEntry.id,
    normalizedEntry.syncAction,
    normalizedEntry.status,
    normalizedEntry.queuedAt,
    normalizedEntry.saleDate,
    normalizedEntry.stationName,
    normalizedEntry.cashierName,
    normalizedEntry.amount,
    normalizedEntry.retryCount,
    normalizedEntry.nextRetryAt,
    normalizedEntry.lastAttemptAt,
    normalizedEntry.lastError,
    JSON.stringify(normalizedEntry.payload),
    new Date().toISOString(),
  );
}

async function migrateLegacyQueue() {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const raw = await storage.getItem(POS_PENDING_SALES_KEY);
      const legacyQueue = safeParseJson(raw, []);

      if (!Array.isArray(legacyQueue) || legacyQueue.length === 0) {
        return;
      }

      const database = await getDatabase();

      for (const entry of legacyQueue) {
        await insertOrReplaceQueueEntry(database, entry);
      }

      await storage.removeItem(POS_PENDING_SALES_KEY);
    })();
  }

  return migrationPromise;
}

async function loadPendingPosSales() {
  const database = await getDatabase();
  await migrateLegacyQueue();

  const rows = await database.getAllAsync(
    `
      SELECT *
      FROM ${TABLE_NAME}
      ORDER BY queued_at ASC
    `,
  );

  return (Array.isArray(rows) ? rows : []).map(rowToQueueEntry);
}

async function replaceQueue(database, queue) {
  await database.runAsync(`DELETE FROM ${TABLE_NAME}`);

  for (const entry of Array.isArray(queue) ? queue : []) {
    await insertOrReplaceQueueEntry(database, entry);
  }
}

async function savePendingPosSales(queue) {
  const database = await getDatabase();
  await migrateLegacyQueue();

  if (typeof database.withTransactionAsync === "function") {
    await database.withTransactionAsync(async () => {
      await replaceQueue(database, queue);
    });
    return;
  }

  await replaceQueue(database, queue);
}

async function removePendingPosSale(saleId) {
  const normalizedSaleId = `${saleId || ""}`.trim();

  if (!normalizedSaleId) {
    return;
  }

  const database = await getDatabase();
  await migrateLegacyQueue();
  await database.runAsync(
    `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
    normalizedSaleId,
  );
}

const offlineQueue = {
  loadPendingPosSales,
  savePendingPosSales,
  removePendingPosSale,
};

export default offlineQueue;
