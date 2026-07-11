"use client";

const POS_PENDING_SALES_KEY = "jah_oil_pos_pending_sales_v1";
const POS_LAST_SYNCED_AT_KEY = "jah_oil_pos_last_synced_at_v1";
const POS_SYNC_ACTIVITY_KEY = "jah_oil_pos_sync_activity_v1";
const POS_SYNC_STATUS_EVENT = "jah:pos-sync-status";
const POS_SYNC_RETRY_MESSAGE =
  "Internet is unavailable. Pending sales will sync automatically once the connection is restored.";
const POS_SYNC_ACTIVITY_LIMIT = 120;

let activeSyncPromise = null;
let syncInProgress = false;

export function buildQueuedPosSale(payload) {
  const clientSaleId = `${payload?.clientSaleId || createClientSaleId()}`.trim();
  const saleDate = normalizeSaleDate(payload?.saleDate) || new Date().toISOString();
  const syncAction = `${payload?.syncAction || "sale_create"}`.trim().toLowerCase();

  return {
    id: clientSaleId,
    queuedAt: new Date().toISOString(),
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

export function removePendingPosSale(saleId) {
  const normalizedSaleId = `${saleId || ""}`.trim();

  if (!normalizedSaleId) {
    return;
  }

  const nextQueue = loadPendingPosSales().filter(
    (entry) => `${entry?.id || ""}` !== normalizedSaleId,
  );
  savePendingPosSales(nextQueue);
  savePosSyncActivity(
    loadPosSyncActivity().filter(
      (entry) => `${entry?.id || ""}` !== normalizedSaleId,
    ),
  );
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

  return {
    id: `${sourceEntry?.id || ""}`.trim(),
    syncAction: `${payload?.syncAction || "sale_create"}`.trim().toLowerCase(),
    queuedAt: normalizeSaleDate(sourceEntry?.queuedAt) || new Date().toISOString(),
    receiptNumber: `${payload?.receiptNumber || ""}`.trim(),
    stationName: `${payload?.stationName || ""}`.trim(),
    cashierName: `${payload?.cashierName || ""}`.trim(),
    totalAmount: calculateQueuedSaleAmount(payload),
    status: sourceEntry?.lastError ? "failed" : "queued",
    lastAttemptAt: normalizeSaleDate(sourceEntry?.lastAttemptAt),
    lastError: `${sourceEntry?.lastError || ""}`.trim(),
    lastSyncedAt: "",
    updatedAt: new Date().toISOString(),
  };
}

function serializeQueuedSale(sourceEntry, activityEntry) {
  const payload = sourceEntry?.payload || {};
  const resolvedStatus = `${activityEntry?.status || ""}`.trim();

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
    status: resolvedStatus || (sourceEntry?.lastError ? "failed" : "queued"),
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
