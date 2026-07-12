import {
  reportMobilePosDeviceSyncStatus,
  syncMobilePosSale,
} from "../auth/api";
import { getUserFacingErrorMessage } from "../errors/messages";
import storage from "../storage/local-storage";
import offlineQueue from "./offline-queue";

const POS_LAST_SYNCED_AT_KEY = "jah_pos_mobile_last_synced_at_v1";
const POS_SYNC_ACTIVITY_KEY = "jah_pos_mobile_sync_activity_v1";
const POS_BOOTSTRAP_CACHE_KEY = "jah_pos_mobile_bootstrap_v1";
const POS_DEVICE_ID_KEY = "jah_pos_mobile_device_id_v1";
const POS_SYNC_ACTIVITY_LIMIT = 120;
const POS_SYNC_RETRY_BASE_DELAY_MS = 5000;
const POS_SYNC_RETRY_MAX_DELAY_MS = 5 * 60 * 1000;
const POS_DEVICE_STATUS_HEARTBEAT_MS = 5 * 60 * 1000;

let isSyncing = false;
let lastKnownOnline = true;
let lastDeviceStatusReportAt = 0;
let lastDeviceStatusReportSignature = "";
const listeners = new Set();

function emitStatus() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener failures.
    }
  });
}

function createRandomToken(length = 10) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const cryptoObject = globalThis.crypto;

  if (cryptoObject?.getRandomValues) {
    const randomValues = new Uint8Array(length);
    cryptoObject.getRandomValues(randomValues);

    return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
  }

  return Math.random().toString(36).slice(2, 2 + length).padEnd(length, "0");
}

function createClientSaleId() {
  const timestamp = Date.now().toString(36);
  const suffix = createRandomToken(10);

  return `mpos_${timestamp}_${suffix}`;
}

function normalizeSaleDate(value) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return "";
  }

  const parsedDate = new Date(normalizedValue);

  return Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();
}

function safeParseJson(value, fallbackValue) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
}

async function loadPendingPosSales() {
  return offlineQueue.loadPendingPosSales();
}

async function savePendingPosSales(queue) {
  await offlineQueue.savePendingPosSales(queue);
  emitStatus();
}

async function loadPosSyncActivity() {
  const raw = await storage.getItem(POS_SYNC_ACTIVITY_KEY);
  return Array.isArray(safeParseJson(raw, [])) ? safeParseJson(raw, []) : [];
}

async function savePosSyncActivity(activity) {
  const normalizedActivity = (Array.isArray(activity) ? activity : [])
    .filter((entry) => entry?.id)
    .sort((left, right) => {
      const leftUpdatedAt = `${left?.updatedAt || left?.queuedAt || ""}`;
      const rightUpdatedAt = `${right?.updatedAt || right?.queuedAt || ""}`;
      return rightUpdatedAt.localeCompare(leftUpdatedAt);
    })
    .slice(0, POS_SYNC_ACTIVITY_LIMIT);

  await storage.setItem(
    POS_SYNC_ACTIVITY_KEY,
    JSON.stringify(normalizedActivity),
  );
  emitStatus();
}

async function getLastSyncedAt() {
  return (await storage.getItem(POS_LAST_SYNCED_AT_KEY)) || "";
}

async function saveLastSyncedAt(value) {
  const normalizedValue = normalizeSaleDate(value);

  if (!normalizedValue) {
    await storage.removeItem(POS_LAST_SYNCED_AT_KEY);
  } else {
    await storage.setItem(POS_LAST_SYNCED_AT_KEY, normalizedValue);
  }
}

async function getPosDeviceId() {
  const existingDeviceId = `${(await storage.getItem(POS_DEVICE_ID_KEY)) || ""}`.trim();

  if (existingDeviceId) {
    return existingDeviceId;
  }

  const deviceId = `mpos_${createClientSaleId()}`;
  await storage.setItem(POS_DEVICE_ID_KEY, deviceId);

  return deviceId;
}

function getNormalizedDateFromEntry(entry, keys) {
  for (const key of keys) {
    const normalizedDate = normalizeSaleDate(entry?.[key]);

    if (normalizedDate) {
      return normalizedDate;
    }
  }

  const payload = entry?.payload || {};

  for (const key of keys) {
    const normalizedDate = normalizeSaleDate(payload?.[key]);

    if (normalizedDate) {
      return normalizedDate;
    }
  }

  return "";
}

function getOldestDateValue(entries, keys) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => getNormalizedDateFromEntry(entry, keys))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))[0] || "";
}

function getLatestDateValue(entries, keys) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => getNormalizedDateFromEntry(entry, keys))
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0] || "";
}

function getLatestErrorValue(activity, queue) {
  return [...(Array.isArray(activity) ? activity : []), ...(Array.isArray(queue) ? queue : [])]
    .filter((entry) => `${entry?.lastError || ""}`.trim())
    .sort((left, right) =>
      `${right?.lastAttemptAt || right?.updatedAt || right?.queuedAt || ""}`.localeCompare(
        `${left?.lastAttemptAt || left?.updatedAt || left?.queuedAt || ""}`,
      ),
    )[0]?.lastError || "";
}

function buildDeviceStatusSignature(payload) {
  return JSON.stringify({
    deviceId: payload.deviceId,
    platform: payload.platform,
    stationId: payload.stationId,
    stationName: payload.stationName,
    cashierName: payload.cashierName,
    pendingCount: payload.pendingCount,
    failedCount: payload.failedCount,
    needsReviewCount: payload.needsReviewCount,
    oldestUnsyncedAt: payload.oldestUnsyncedAt,
    lastSyncAttemptAt: payload.lastSyncAttemptAt,
    lastSyncedAt: payload.lastSyncedAt,
    lastError: payload.lastError,
    isOnline: payload.isOnline,
  });
}

export async function reportPosDeviceSyncStatus({
  token,
  context = {},
  force = false,
} = {}) {
  if (!token) {
    return null;
  }

  const queue = await loadPendingPosSales();
  const activity = await loadPosSyncActivity();
  const queueIds = new Set(queue.map((entry) => `${entry?.id || ""}`));
  const queuedActivity = activity.filter((entry) =>
    queueIds.has(`${entry?.id || ""}`),
  );
  const failedCount = queue.filter(
    (entry) => {
      const status = `${entry?.status || ""}`.trim().toLowerCase();
      return (
        status !== "needs_review" &&
        (status === "failed" || `${entry?.lastError || ""}`.trim())
      );
    },
  ).length;
  const needsReviewCount = queue.filter(
    (entry) => `${entry?.status || ""}`.trim().toLowerCase() === "needs_review",
  ).length;
  const firstPayload = queue.find((entry) => entry?.payload)?.payload || {};
  const payload = {
    deviceId: await getPosDeviceId(),
    platform: "mobile",
    appVersion: "pos-mobile",
    stationId: `${context.stationId || firstPayload?.stationId || ""}`.trim(),
    stationName: `${context.stationName || firstPayload?.stationName || ""}`.trim(),
    cashierName: `${context.cashierName || firstPayload?.cashierName || ""}`.trim(),
    pendingCount: queue.length,
    failedCount,
    needsReviewCount,
    oldestUnsyncedAt: getOldestDateValue(queue, ["queuedAt", "saleDate"]),
    lastSyncAttemptAt: getLatestDateValue(queuedActivity, ["lastAttemptAt"]),
    lastSyncedAt: await getLastSyncedAt(),
    lastError: getLatestErrorValue(queuedActivity, queue),
    isOnline: lastKnownOnline,
    reportedAt: new Date().toISOString(),
  };
  const signature = buildDeviceStatusSignature(payload);
  const now = Date.now();

  if (
    !force &&
    signature === lastDeviceStatusReportSignature &&
    now - lastDeviceStatusReportAt < POS_DEVICE_STATUS_HEARTBEAT_MS
  ) {
    return {
      success: true,
      skipped: true,
    };
  }

  try {
    const result = await reportMobilePosDeviceSyncStatus({ token, payload });
    lastDeviceStatusReportSignature = signature;
    lastDeviceStatusReportAt = now;

    return result;
  } catch {
    return null;
  }
}

function calculateQueuedSaleAmount(payload) {
  const payloadTotalAmount = Number(payload?.totalAmount ?? 0);

  if (Number.isFinite(payloadTotalAmount) && payloadTotalAmount > 0) {
    return Number(payloadTotalAmount.toFixed(2));
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];

  return items.reduce((total, item) => {
    const amount = Number(item?.amount ?? 0);
    const quantity = Number(item?.qty ?? 0);
    const unitPrice = Number(item?.price ?? 0);
    const lineTotal = amount > 0 ? amount : quantity * unitPrice;

    return total + (Number.isFinite(lineTotal) ? lineTotal : 0);
  }, 0);
}

function buildSyncActivityEntry(sourceEntry) {
  const payload = sourceEntry?.payload || {};
  const sourceStatus = `${sourceEntry?.status || ""}`.trim().toLowerCase();

  return {
    id: sourceEntry?.id || createClientSaleId(),
    syncAction: `${payload?.syncAction || "sale_create"}`.trim().toLowerCase(),
    queuedAt: sourceEntry?.queuedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: sourceStatus || "queued",
    stationName: `${payload?.stationName || ""}`.trim(),
    cashierName: `${payload?.cashierName || ""}`.trim(),
    amount: calculateQueuedSaleAmount(payload),
    saleDate: `${payload?.saleDate || ""}`.trim(),
    lastAttemptAt: "",
    lastError: "",
    lastSyncedAt: "",
    receiptNumber: `${payload?.receiptNumber || ""}`.trim(),
    retryCount: Number(sourceEntry?.retryCount || 0),
    nextRetryAt: `${sourceEntry?.nextRetryAt || ""}`.trim(),
  };
}

async function upsertSyncActivityEntry(sourceEntry, overrides = {}) {
  const activity = await loadPosSyncActivity();
  const activityById = new Map(
    activity.map((entry) => [`${entry?.id || ""}`, entry]),
  );
  const entryId = `${sourceEntry?.id || ""}`.trim();
  const currentEntry = activityById.get(entryId) || buildSyncActivityEntry(sourceEntry);
  const nextEntry = {
    ...currentEntry,
    ...overrides,
    id: entryId,
    updatedAt: new Date().toISOString(),
  };

  activityById.set(entryId, nextEntry);
  await savePosSyncActivity(Array.from(activityById.values()));

  return nextEntry;
}

function serializeQueuedSale(sourceEntry, activityEntry) {
  const payload = sourceEntry?.payload || {};
  const resolvedStatus = `${activityEntry?.status || ""}`.trim();
  const sourceStatus = `${sourceEntry?.status || ""}`.trim();

  return {
    id: `${sourceEntry?.id || ""}`.trim(),
    syncAction: `${payload?.syncAction || activityEntry?.syncAction || "sale_create"}`
      .trim()
      .toLowerCase(),
    queuedAt: `${sourceEntry?.queuedAt || ""}`.trim(),
    saleDate: `${payload?.saleDate || ""}`.trim(),
    stationName: `${payload?.stationName || activityEntry?.stationName || ""}`.trim(),
    cashierName: `${payload?.cashierName || activityEntry?.cashierName || ""}`.trim(),
    amount: calculateQueuedSaleAmount(payload),
    status: sourceStatus || resolvedStatus || "queued",
    lastAttemptAt: `${activityEntry?.lastAttemptAt || ""}`.trim(),
    lastError: `${activityEntry?.lastError || ""}`.trim(),
    lastSyncedAt: `${activityEntry?.lastSyncedAt || ""}`.trim(),
    receiptNumber: `${payload?.receiptNumber || activityEntry?.receiptNumber || ""}`.trim(),
    retryCount: Number(sourceEntry?.retryCount || activityEntry?.retryCount || 0),
    nextRetryAt: `${sourceEntry?.nextRetryAt || activityEntry?.nextRetryAt || ""}`.trim(),
  };
}

function getRetryDelayMs(retryCount) {
  const normalizedRetryCount = Math.max(1, Number(retryCount || 1));
  const delay = POS_SYNC_RETRY_BASE_DELAY_MS * 2 ** (normalizedRetryCount - 1);

  return Math.min(delay, POS_SYNC_RETRY_MAX_DELAY_MS);
}

function buildFailedQueueEntry(entry, attemptTimestamp, lastError) {
  const retryCount = Number(entry?.retryCount || 0) + 1;
  const nextRetryAt = new Date(Date.now() + getRetryDelayMs(retryCount)).toISOString();

  return {
    ...entry,
    status: "failed",
    retryCount,
    nextRetryAt,
    lastAttemptAt: attemptTimestamp,
    lastError,
  };
}

function canRetryEntry(entry, { force = false, prioritizeSaleId = "" } = {}) {
  const isNeedsReview =
    `${entry?.status || ""}`.trim().toLowerCase() === "needs_review";
  const isPrioritized = `${entry?.id || ""}` === `${prioritizeSaleId || ""}`;

  if (isNeedsReview && !force && !isPrioritized) {
    return false;
  }

  if (force || isPrioritized) {
    return true;
  }

  const nextRetryAt = `${entry?.nextRetryAt || ""}`.trim();

  if (!nextRetryAt) {
    return true;
  }

  const nextRetryTime = Date.parse(nextRetryAt);

  return !Number.isFinite(nextRetryTime) || nextRetryTime <= Date.now();
}

export async function queuePendingPosSale(payload) {
  const queue = await loadPendingPosSales();
  const clientSaleId = `${payload?.clientSaleId || createClientSaleId()}`.trim();
  const saleDate = normalizeSaleDate(payload?.saleDate) || new Date().toISOString();
  const syncAction = `${payload?.syncAction || "sale_create"}`
    .trim()
    .toLowerCase();
  const queuedSale = {
    id: clientSaleId,
    queuedAt: new Date().toISOString(),
    status: "queued",
    lastAttemptAt: "",
    lastError: "",
    retryCount: 0,
    nextRetryAt: "",
    payload: {
      ...payload,
      syncAction,
      clientSaleId,
      saleDate,
    },
  };

  queue.push(queuedSale);
  await savePendingPosSales(queue);
  await upsertSyncActivityEntry(queuedSale, {
    status: "queued",
    lastAttemptAt: "",
    lastError: "",
    lastSyncedAt: "",
  });

  return queuedSale;
}

export async function queuePendingPosReversal(payload) {
  return queuePendingPosSale({
    ...payload,
    syncAction: "sale_reverse",
  });
}

export async function markPendingPosSaleNeedsReview(saleId) {
  const normalizedSaleId = `${saleId || ""}`.trim();

  if (!normalizedSaleId) {
    return;
  }

  const queue = await loadPendingPosSales();
  const nextQueue = queue.map((entry) => {
    if (`${entry?.id || ""}` !== normalizedSaleId) {
      return entry;
    }

    return {
      ...entry,
      status: "needs_review",
      lastError:
        `${entry?.lastError || ""}`.trim() ||
        "This queued POS record was flagged for admin review.",
    };
  });
  const flaggedEntry = nextQueue.find(
    (entry) => `${entry?.id || ""}` === normalizedSaleId,
  );

  await savePendingPosSales(nextQueue);

  if (flaggedEntry) {
    await upsertSyncActivityEntry(flaggedEntry, {
      status: "needs_review",
      lastError:
        `${flaggedEntry?.lastError || ""}`.trim() ||
        "This queued POS record was flagged for admin review.",
    });
  }
}

export async function clearResolvedPosSyncEntries() {
  const queue = await loadPendingPosSales();
  const queueIds = new Set(queue.map((entry) => `${entry?.id || ""}`));
  const nextActivity = (await loadPosSyncActivity()).filter((entry) => {
    const entryId = `${entry?.id || ""}`;

    if (queueIds.has(entryId)) {
      return true;
    }

    return `${entry?.status || ""}` !== "synced";
  });

  await savePosSyncActivity(nextActivity);
}

export async function getPosSyncStatusSnapshot() {
  return {
    pendingCount: (await loadPendingPosSales()).length,
    lastSyncedAt: await getLastSyncedAt(),
    isOnline: lastKnownOnline,
    isSyncing,
  };
}

export async function getPosSyncPanelSnapshot() {
  const queue = await loadPendingPosSales();
  const queueIds = new Set(queue.map((entry) => `${entry?.id || ""}`));
  const activity = await loadPosSyncActivity();
  const activityById = new Map(
    activity.map((entry) => [`${entry?.id || ""}`, entry]),
  );

  return {
    ...(await getPosSyncStatusSnapshot()),
    queuedSales: queue
      .map((entry) => serializeQueuedSale(entry, activityById.get(`${entry?.id || ""}`)))
      .sort((left, right) => right.queuedAt.localeCompare(left.queuedAt)),
    recentActivity: activity
      .filter((entry) => !queueIds.has(`${entry?.id || ""}`))
      .sort((left, right) => `${right?.updatedAt || ""}`.localeCompare(`${left?.updatedAt || ""}`)),
  };
}

export function subscribeToPosSyncStatus(listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export async function loadCachedPosBootstrap() {
  const raw = await storage.getItem(POS_BOOTSTRAP_CACHE_KEY);
  return safeParseJson(raw, null);
}

export async function saveCachedPosBootstrap(value) {
  await storage.setItem(POS_BOOTSTRAP_CACHE_KEY, JSON.stringify(value || null));
}

export async function syncPendingPosSales({
  token,
  prioritizeSaleId = "",
  force = false,
} = {}) {
  if (!token) {
    throw new Error("Missing session token.");
  }

  const currentQueue = await loadPendingPosSales();

  if (currentQueue.length === 0) {
    return {
      syncedCount: 0,
      pendingCount: 0,
      results: {},
      lastSyncedAt: await getLastSyncedAt(),
    };
  }

  if (isSyncing) {
    return {
      syncedCount: 0,
      pendingCount: currentQueue.length,
      results: {},
      lastSyncedAt: await getLastSyncedAt(),
    };
  }

  isSyncing = true;
  emitStatus();

  try {
    const initialQueue = currentQueue;
    const prioritizedQueue = [
      ...initialQueue.filter((entry) => `${entry?.id || ""}` === `${prioritizeSaleId || ""}`),
      ...initialQueue.filter((entry) => `${entry?.id || ""}` !== `${prioritizeSaleId || ""}`),
    ];
    const nextQueue = [];
    const results = {};
    let syncedCount = 0;
    let lastSyncedAt = await getLastSyncedAt();

    for (const entry of prioritizedQueue) {
      const attemptTimestamp = new Date().toISOString();

      if (!canRetryEntry(entry, { force, prioritizeSaleId })) {
        nextQueue.push(entry);
        continue;
      }

      await upsertSyncActivityEntry(entry, {
        status: "syncing",
        lastAttemptAt: attemptTimestamp,
        lastError: "",
      });

      try {
        const result = await syncMobilePosSale({
          token,
          payload: entry.payload,
        });
        lastKnownOnline = true;

        if (result?.success) {
          syncedCount += 1;
          lastSyncedAt = `${result?.syncedAt || new Date().toISOString()}`.trim();
          await saveLastSyncedAt(lastSyncedAt);
          await upsertSyncActivityEntry(entry, {
            status: "synced",
            lastAttemptAt: attemptTimestamp,
            lastError: "",
            lastSyncedAt,
            receiptNumber: `${result?.receiptNumber || ""}`.trim(),
            retryCount: Number(entry?.retryCount || 0),
            nextRetryAt: "",
          });
          results[entry.id] = {
            success: true,
            receiptNumber: `${result?.receiptNumber || ""}`.trim(),
            message: result?.message || "",
          };
          continue;
        }

        const userFacingSyncMessage = getUserFacingErrorMessage(
          { message: result?.message || "Sync failed." },
          { context: "sync" },
        );
        const failedEntry = buildFailedQueueEntry(
          entry,
          attemptTimestamp,
          userFacingSyncMessage,
        );
        nextQueue.push(failedEntry);
        await upsertSyncActivityEntry(entry, {
          status: "failed",
          lastAttemptAt: attemptTimestamp,
          lastError: userFacingSyncMessage,
          retryCount: failedEntry.retryCount,
          nextRetryAt: failedEntry.nextRetryAt,
        });
        results[entry.id] = {
          success: false,
          message: userFacingSyncMessage,
        };
      } catch (error) {
        lastKnownOnline = false;
        const userFacingSyncMessage = getUserFacingErrorMessage(error, {
          context: "sync",
        });
        const failedEntry = buildFailedQueueEntry(
          entry,
          attemptTimestamp,
          userFacingSyncMessage,
        );
        nextQueue.push(failedEntry);
        await upsertSyncActivityEntry(entry, {
          status: "failed",
          lastAttemptAt: attemptTimestamp,
          lastError: userFacingSyncMessage,
          retryCount: failedEntry.retryCount,
          nextRetryAt: failedEntry.nextRetryAt,
        });
        results[entry.id] = {
          success: false,
          message: userFacingSyncMessage,
        };
      }
    }

    await savePendingPosSales(nextQueue);

    return {
      syncedCount,
      pendingCount: nextQueue.length,
      results,
      lastSyncedAt,
    };
  } finally {
    isSyncing = false;
    emitStatus();
    void reportPosDeviceSyncStatus({ token });
  }
}

export function formatLastSyncedAt(value) {
  const normalizedValue = normalizeSaleDate(value);

  if (!normalizedValue) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(normalizedValue));
}

export function buildClientReceiptNumber({ saleDate = "", clientSaleId = "" } = {}) {
  const now = saleDate ? new Date(saleDate) : new Date();
  const normalizedDate = Number.isNaN(now.getTime()) ? new Date() : now;
  const datePart = [
    normalizedDate.getUTCFullYear(),
    String(normalizedDate.getUTCMonth() + 1).padStart(2, "0"),
    String(normalizedDate.getUTCDate()).padStart(2, "0"),
  ].join("");
  const timePart = [
    String(normalizedDate.getUTCHours()).padStart(2, "0"),
    String(normalizedDate.getUTCMinutes()).padStart(2, "0"),
    String(normalizedDate.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = `${clientSaleId || createClientSaleId()}`
    .replaceAll(/[^a-zA-Z0-9]/g, "")
    .slice(-6)
    .toUpperCase();

  return `POS-${datePart}-${timePart}-${suffix || "LOCAL1"}`;
}
