"use client";

const POS_PENDING_SALES_KEY = "jah_oil_pos_pending_sales_v1";
const POS_LAST_SYNCED_AT_KEY = "jah_oil_pos_last_synced_at_v1";
const POS_SYNC_ACTIVITY_KEY = "jah_oil_pos_sync_activity_v1";
const POS_DEVICE_ID_KEY = "jah_oil_pos_device_id_v1";
const POS_SYNC_STATUS_EVENT = "jah:pos-sync-status";
const POS_SYNC_RETRY_MESSAGE =
  "Internet is unavailable. Pending sales will sync automatically once the connection is restored.";
const POS_SYNC_ACTIVITY_LIMIT = 120;
const POS_DEVICE_STATUS_HEARTBEAT_MS = 5 * 60 * 1000;

let activeSyncPromise = null;
let syncInProgress = false;
let lastDeviceStatusReportAt = 0;
let lastDeviceStatusReportSignature = "";

export function buildQueuedPosSale(payload) {
  const clientSaleId = `${payload?.clientSaleId || createClientSaleId()}`.trim();
  const saleDate = normalizeSaleDate(payload?.saleDate) || new Date().toISOString();
  const syncAction = `${payload?.syncAction || "sale_create"}`.trim().toLowerCase();

  return {
    id: clientSaleId,
    queuedAt: new Date().toISOString(),
    status: "queued",
    lastAttemptAt: "",
    lastError: "",
    payload: {
      ...payload,
      syncAction,
      clientSaleId,
      saleDate,
    },
  };
}

export function queuePendingPosSale(payload) {
  const queue = loadPendingPosSales();
  const queuedSale = buildQueuedPosSale(payload);

  queue.push(queuedSale);
  savePendingPosSales(queue);
  upsertSyncActivityEntry(queuedSale, {
    status: "queued",
    lastAttemptAt: "",
    lastError: "",
    lastSyncedAt: "",
  });
  void reportPosDeviceSyncStatus();

  return queuedSale;
}

export function queuePendingPosReversal(payload) {
  return queuePendingPosSale({
    ...payload,
    syncAction: "sale_reverse",
  });
}

export function getPosSyncStatusSnapshot() {
  return {
    pendingCount: loadPendingPosSales().length,
    lastSyncedAt: getLastSyncedAt(),
    isOnline: canUseBrowserApis() ? window.navigator.onLine : true,
    isSyncing: syncInProgress,
  };
}

export function getPosSyncPanelSnapshot() {
  const queue = loadPendingPosSales();
  const queueIds = new Set(queue.map((entry) => `${entry?.id || ""}`));
  const activity = loadPosSyncActivity();
  const activityById = new Map(
    activity.map((entry) => [`${entry?.id || ""}`, entry]),
  );

  return {
    ...getPosSyncStatusSnapshot(),
    queuedSales: queue
      .map((entry) => {
        const activityEntry = activityById.get(`${entry?.id || ""}`);

        return serializeQueuedSale(entry, activityEntry);
      })
      .sort((left, right) => right.queuedAt.localeCompare(left.queuedAt)),
    recentActivity: activity
      .filter((entry) => !queueIds.has(`${entry?.id || ""}`))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

export function markPendingPosSaleNeedsReview(saleId) {
  const normalizedSaleId = `${saleId || ""}`.trim();

  if (!normalizedSaleId) {
    return;
  }

  const queue = loadPendingPosSales();
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

  savePendingPosSales(nextQueue);

  if (flaggedEntry) {
    upsertSyncActivityEntry(flaggedEntry, {
      status: "needs_review",
      lastError:
        `${flaggedEntry?.lastError || ""}`.trim() ||
        "This queued POS record was flagged for admin review.",
    });
  }

  void reportPosDeviceSyncStatus();
}

export function clearResolvedPosSyncEntries() {
  const currentQueue = loadPendingPosSales();
  const queueIds = new Set(currentQueue.map((entry) => `${entry?.id || ""}`));
  const nextActivity = loadPosSyncActivity().filter((entry) => {
    const entryId = `${entry?.id || ""}`;

    if (queueIds.has(entryId)) {
      return true;
    }

    return `${entry?.status || ""}` !== "synced";
  });

  savePosSyncActivity(nextActivity);
  void reportPosDeviceSyncStatus();
}

export function subscribeToPosSyncStatus(listener) {
  if (!canUseBrowserApis()) {
    return () => undefined;
  }

  const notify = () => listener(getPosSyncStatusSnapshot());
  const handleStorage = (event) => {
    if (
      event.key &&
      event.key !== POS_PENDING_SALES_KEY &&
      event.key !== POS_LAST_SYNCED_AT_KEY &&
      event.key !== POS_SYNC_ACTIVITY_KEY
    ) {
      return;
    }

    notify();
  };

  window.addEventListener(POS_SYNC_STATUS_EVENT, notify);
  window.addEventListener("storage", handleStorage);
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);

  return () => {
    window.removeEventListener(POS_SYNC_STATUS_EVENT, notify);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

export async function syncPendingPosSales({ prioritizeSaleId = "" } = {}) {
  if (!canUseBrowserApis()) {
    return {
      syncedCount: 0,
      pendingCount: 0,
      results: {},
      lastSyncedAt: "",
    };
  }

  if (syncInProgress && activeSyncPromise) {
    return activeSyncPromise;
  }

  syncInProgress = true;
  broadcastPosSyncStatus();

  activeSyncPromise = runPendingPosSalesSync({ prioritizeSaleId }).finally(() => {
    syncInProgress = false;
    activeSyncPromise = null;
    broadcastPosSyncStatus();
    void reportPosDeviceSyncStatus();
  });

  return activeSyncPromise;
}

export async function registerPosOfflineSupport() {
  if (!canUseBrowserApis() || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("/pos-offline-sw.js");
    const registration = await navigator.serviceWorker.ready;
    const currentPath = `${window.location.origin}${window.location.pathname}`;
    const resourceUrls = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => {
        try {
          const parsedUrl = new URL(url);
          return (
            parsedUrl.origin === window.location.origin &&
            !parsedUrl.pathname.startsWith("/api/")
          );
        } catch {
          return false;
        }
      });
    const urls = Array.from(new Set([currentPath, ...resourceUrls]));
    const activeWorker =
      registration.active || registration.waiting || registration.installing;

    activeWorker?.postMessage({
      type: "CACHE_URLS",
      urls,
    });
  } catch {
    // Offline sync queue continues to work even when service worker registration fails.
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

async function runPendingPosSalesSync({ prioritizeSaleId = "" } = {}) {
  if (!window.navigator.onLine) {
    void reportPosDeviceSyncStatus();

    return {
      syncedCount: 0,
      pendingCount: loadPendingPosSales().length,
      results: {},
      lastSyncedAt: getLastSyncedAt(),
    };
  }

  const initialQueue = loadPendingPosSales();
  const prioritizedQueue = prioritizeQueue(initialQueue, prioritizeSaleId);
  const nextQueue = [];
  const results = {};
  let syncedCount = 0;
  let lastSyncedAt = getLastSyncedAt();

  for (let index = 0; index < prioritizedQueue.length; index += 1) {
    const entry = prioritizedQueue[index];
    const attemptTimestamp = new Date().toISOString();
    const entryStatus = `${entry?.status || ""}`.trim().toLowerCase();

    if (entryStatus === "needs_review") {
      nextQueue.push(entry);
      continue;
    }

    upsertSyncActivityEntry(entry, {
      status: "syncing",
      lastAttemptAt: attemptTimestamp,
      lastError: "",
    });

    try {
      const response = await fetch("/api/pos/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(entry.payload),
      });
      const result = await response.json().catch(() => ({
        success: false,
        message: "Failed to sync sale.",
      }));

      results[entry.id] = result;

      if (result?.success) {
        syncedCount += 1;
        lastSyncedAt = normalizeSaleDate(result?.syncedAt) || new Date().toISOString();
        saveLastSyncedAt(lastSyncedAt);
        upsertSyncActivityEntry(entry, {
          status: "synced",
          lastAttemptAt: attemptTimestamp,
          lastError: "",
          lastSyncedAt,
        });
        continue;
      }

      nextQueue.push({
        ...entry,
        status: "failed",
        lastAttemptAt: attemptTimestamp,
        lastError: `${result?.message || "Failed to sync sale."}`.trim(),
      });
      upsertSyncActivityEntry(entry, {
        status: "failed",
        lastAttemptAt: attemptTimestamp,
        lastError: `${result?.message || "Failed to sync sale."}`.trim(),
      });

      if (!response.ok && (response.status === 401 || response.status === 403)) {
        nextQueue.push(...prioritizedQueue.slice(index + 1));
        const mergedQueue = mergePendingQueue(initialQueue, nextQueue);
        savePendingPosSales(mergedQueue);

        return {
          syncedCount,
          pendingCount: mergedQueue.length,
          results,
          lastSyncedAt,
        };
      }
    } catch {
      results[entry.id] = {
        success: false,
        message: POS_SYNC_RETRY_MESSAGE,
      };
      nextQueue.push({
        ...entry,
        status: "failed",
        lastAttemptAt: attemptTimestamp,
        lastError: POS_SYNC_RETRY_MESSAGE,
      });
      upsertSyncActivityEntry(entry, {
        status: "failed",
        lastAttemptAt: attemptTimestamp,
        lastError: POS_SYNC_RETRY_MESSAGE,
      });
      nextQueue.push(...prioritizedQueue.slice(index + 1));
      const mergedQueue = mergePendingQueue(initialQueue, nextQueue);
      savePendingPosSales(mergedQueue);

      return {
        syncedCount,
        pendingCount: mergedQueue.length,
        results,
        lastSyncedAt,
      };
    }
  }

  const mergedQueue = mergePendingQueue(initialQueue, nextQueue);
  savePendingPosSales(mergedQueue);

  return {
    syncedCount,
    pendingCount: mergedQueue.length,
    results,
    lastSyncedAt,
  };
}

function loadPendingPosSales() {
  if (!canUseBrowserApis()) {
    return [];
  }

  return safeParseJson(window.localStorage.getItem(POS_PENDING_SALES_KEY), []);
}

function savePendingPosSales(queue) {
  if (!canUseBrowserApis()) {
    return;
  }

  window.localStorage.setItem(
    POS_PENDING_SALES_KEY,
    JSON.stringify(Array.isArray(queue) ? queue : []),
  );
  broadcastPosSyncStatus();
}

function getLastSyncedAt() {
  if (!canUseBrowserApis()) {
    return "";
  }

  return `${window.localStorage.getItem(POS_LAST_SYNCED_AT_KEY) || ""}`.trim();
}

function saveLastSyncedAt(value) {
  if (!canUseBrowserApis()) {
    return;
  }

  if (value) {
    window.localStorage.setItem(POS_LAST_SYNCED_AT_KEY, value);
  } else {
    window.localStorage.removeItem(POS_LAST_SYNCED_AT_KEY);
  }

  broadcastPosSyncStatus();
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

export async function reportPosDeviceSyncStatus(extraPayload = {}) {
  if (!canUseBrowserApis()) {
    return null;
  }

  const { force = false, ...payloadExtra } = extraPayload;
  const queue = loadPendingPosSales();
  const activity = loadPosSyncActivity();
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
    deviceId: getPosDeviceId(),
    platform: "web",
    appVersion: "web-pos",
    stationId: `${firstPayload?.stationId || ""}`.trim(),
    stationName: `${firstPayload?.stationName || ""}`.trim(),
    cashierName: `${firstPayload?.cashierName || ""}`.trim(),
    pendingCount: queue.length,
    failedCount,
    needsReviewCount,
    oldestUnsyncedAt: getOldestDateValue(queue, ["queuedAt", "saleDate"]),
    lastSyncAttemptAt: getLatestDateValue(queuedActivity, ["lastAttemptAt"]),
    lastSyncedAt: getLastSyncedAt(),
    lastError: getLatestErrorValue(queuedActivity, queue),
    isOnline: window.navigator.onLine,
    reportedAt: new Date().toISOString(),
    ...payloadExtra,
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
    const response = await fetch("/api/pos/device-sync-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => null);
    lastDeviceStatusReportSignature = signature;
    lastDeviceStatusReportAt = now;

    return result;
  } catch {
    return null;
  }
}

function loadPosSyncActivity() {
  if (!canUseBrowserApis()) {
    return [];
  }

  return safeParseJson(window.localStorage.getItem(POS_SYNC_ACTIVITY_KEY), []);
}

function savePosSyncActivity(activity) {
  if (!canUseBrowserApis()) {
    return;
  }

  const normalizedActivity = (Array.isArray(activity) ? activity : [])
    .filter((entry) => entry?.id)
    .sort((left, right) => {
      const leftUpdatedAt = `${left?.updatedAt || left?.queuedAt || ""}`;
      const rightUpdatedAt = `${right?.updatedAt || right?.queuedAt || ""}`;

      return rightUpdatedAt.localeCompare(leftUpdatedAt);
    })
    .slice(0, POS_SYNC_ACTIVITY_LIMIT);

  window.localStorage.setItem(
    POS_SYNC_ACTIVITY_KEY,
    JSON.stringify(normalizedActivity),
  );
  broadcastPosSyncStatus();
}

function broadcastPosSyncStatus() {
  if (!canUseBrowserApis()) {
    return;
  }

  window.dispatchEvent(new CustomEvent(POS_SYNC_STATUS_EVENT));
}

function prioritizeQueue(queue, prioritizeSaleId) {
  const normalizedId = `${prioritizeSaleId || ""}`.trim();

  if (!normalizedId) {
    return Array.isArray(queue) ? [...queue] : [];
  }

  const prioritized = [];
  const remaining = [];

  (Array.isArray(queue) ? queue : []).forEach((entry) => {
    if (`${entry?.id || ""}` === normalizedId) {
      prioritized.push(entry);
      return;
    }

    remaining.push(entry);
  });

  return [...prioritized, ...remaining];
}

function restoreQueueOrder(originalQueue, nextQueue) {
  const preservedEntries = new Map(
    (Array.isArray(nextQueue) ? nextQueue : []).map((entry) => [`${entry?.id || ""}`, entry]),
  );

  return (Array.isArray(originalQueue) ? originalQueue : [])
    .map((entry) => preservedEntries.get(`${entry?.id || ""}`))
    .filter(Boolean);
}

function mergePendingQueue(originalQueue, nextQueue) {
  const restoredQueue = restoreQueueOrder(originalQueue, nextQueue);
  const originalQueueIds = new Set(
    (Array.isArray(originalQueue) ? originalQueue : []).map((entry) => `${entry?.id || ""}`),
  );
  const liveQueueAdditions = loadPendingPosSales().filter(
    (entry) => !originalQueueIds.has(`${entry?.id || ""}`),
  );

  return [...restoredQueue, ...liveQueueAdditions];
}

function canUseBrowserApis() {
  return typeof window !== "undefined";
}

function getPosDeviceId() {
  if (!canUseBrowserApis()) {
    return "web-pos-unknown";
  }

  const existingDeviceId = `${window.localStorage.getItem(POS_DEVICE_ID_KEY) || ""}`.trim();

  if (existingDeviceId) {
    return existingDeviceId;
  }

  const deviceId = `web_pos_${createClientSaleId()}`;
  window.localStorage.setItem(POS_DEVICE_ID_KEY, deviceId);

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

function createClientSaleId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `pos_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
  if (!value) {
    return fallbackValue;
  }

  try {
    const parsedValue = JSON.parse(value);
    return Array.isArray(fallbackValue) && !Array.isArray(parsedValue)
      ? fallbackValue
      : parsedValue;
  } catch {
    return fallbackValue;
  }
}

function upsertSyncActivityEntry(sourceEntry, overrides = {}) {
  if (!canUseBrowserApis() || !sourceEntry?.id) {
    return;
  }

  const activity = loadPosSyncActivity();
  const activityById = new Map(
    activity.map((entry) => [`${entry?.id || ""}`, entry]),
  );
  const entryId = `${sourceEntry.id || ""}`;
  const currentEntry = activityById.get(entryId) || null;
  const nextEntry = {
    ...currentEntry,
    ...buildSyncActivityEntry(sourceEntry),
    ...overrides,
    updatedAt: new Date().toISOString(),
  };

  activityById.set(entryId, nextEntry);
  savePosSyncActivity(Array.from(activityById.values()));
}

function buildSyncActivityEntry(sourceEntry) {
  const payload = sourceEntry?.payload || {};
  const sourceStatus = `${sourceEntry?.status || ""}`.trim().toLowerCase();

  return {
    id: `${sourceEntry?.id || ""}`.trim(),
    syncAction: `${payload?.syncAction || "sale_create"}`.trim().toLowerCase(),
    queuedAt: normalizeSaleDate(sourceEntry?.queuedAt) || new Date().toISOString(),
    receiptNumber: `${payload?.receiptNumber || ""}`.trim(),
    stationName: `${payload?.stationName || ""}`.trim(),
    cashierName: `${payload?.cashierName || ""}`.trim(),
    totalAmount: calculateQueuedSaleAmount(payload),
    status: sourceStatus || (sourceEntry?.lastError ? "failed" : "queued"),
    lastAttemptAt: normalizeSaleDate(sourceEntry?.lastAttemptAt),
    lastError: `${sourceEntry?.lastError || ""}`.trim(),
    lastSyncedAt: "",
    updatedAt: new Date().toISOString(),
  };
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
    receiptNumber: `${payload?.receiptNumber || activityEntry?.receiptNumber || ""}`.trim(),
    queuedAt: normalizeSaleDate(sourceEntry?.queuedAt) || "",
    stationName: `${payload?.stationName || activityEntry?.stationName || ""}`.trim(),
    cashierName: `${payload?.cashierName || activityEntry?.cashierName || ""}`.trim(),
    totalAmount: calculateQueuedSaleAmount(payload),
    status: sourceStatus || resolvedStatus || (sourceEntry?.lastError ? "failed" : "queued"),
    lastAttemptAt:
      normalizeSaleDate(sourceEntry?.lastAttemptAt) ||
      normalizeSaleDate(activityEntry?.lastAttemptAt) ||
      "",
    lastError: `${sourceEntry?.lastError || activityEntry?.lastError || ""}`.trim(),
    lastSyncedAt: normalizeSaleDate(activityEntry?.lastSyncedAt) || "",
  };
}

function calculateQueuedSaleAmount(payload) {
  const payloadTotalAmount = Number(payload?.totalAmount ?? 0);

  if (Number.isFinite(payloadTotalAmount) && payloadTotalAmount > 0) {
    return Number(payloadTotalAmount.toFixed(2));
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];

  return Number(
    items
      .reduce((sum, item) => {
        const amount = Number(item?.amount ?? 0);
        const quantity = Number(item?.qty ?? 0);
        const unitPrice = Number(item?.price ?? 0);

        if (Number.isFinite(amount) && amount > 0) {
          return sum + amount;
        }

        if (
          Number.isFinite(quantity) &&
          quantity > 0 &&
          Number.isFinite(unitPrice) &&
          unitPrice >= 0
        ) {
          return sum + quantity * unitPrice;
        }

        return sum;
      }, 0)
      .toFixed(2),
  );
}
