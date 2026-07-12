import "server-only";

import { createHash } from "node:crypto";

import { Client, Databases } from "appwrite";

import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  posDeviceSyncStatus: "pos_device_sync_status",
};

const VALID_PLATFORMS = new Set(["web", "mobile", "unknown"]);

function normalizeText(value, maxLength = 255) {
  return `${value || ""}`.trim().slice(0, maxLength);
}

function normalizeNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeIsoDate(value) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return null;
  }

  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildDeviceStatus({
  isOnline,
  pendingCount,
  failedCount,
  needsReviewCount,
}) {
  if (!isOnline && pendingCount > 0) {
    return "offline";
  }

  if (failedCount > 0 || needsReviewCount > 0) {
    return "failed";
  }

  if (pendingCount > 0) {
    return "pending";
  }

  return "synced";
}

function buildDeviceDocumentId(deviceId) {
  const digest = createHash("sha1")
    .update(deviceId)
    .digest("hex")
    .slice(0, 28);

  return `pds_${digest}`;
}

function createDatabasesClient() {
  const config = getServerAppwriteConfig();
  const client = new Client()
    .setEndpoint(config.apiBaseUrl)
    .setProject(config.projectId);
  client.headers["X-Appwrite-Key"] = config.apiKey;

  return {
    databases: new Databases(client),
    databaseId: config.databaseId,
  };
}

function isNotFoundError(error) {
  return error?.code === 404 || error?.status === 404;
}

export async function upsertPosDeviceSyncStatus({
  session,
  payload,
  moduleName = "POS",
}) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  if (!session?.modules?.includes("pos")) {
    return {
      success: false,
      message: "Forbidden.",
    };
  }

  const deviceId = normalizeText(payload?.deviceId, 128);

  if (!deviceId) {
    return {
      success: false,
      message: "Device identifier is required.",
    };
  }

  const pendingCount = normalizeNonNegativeInteger(payload?.pendingCount);
  const failedCount = normalizeNonNegativeInteger(payload?.failedCount);
  const needsReviewCount = normalizeNonNegativeInteger(payload?.needsReviewCount);
  const isOnline = payload?.isOnline !== false;
  const now = new Date().toISOString();
  const platform = VALID_PLATFORMS.has(`${payload?.platform || ""}`)
    ? `${payload.platform}`
    : "unknown";
  const documentId = buildDeviceDocumentId(deviceId);
  const data = {
    device_id: deviceId,
    platform,
    app_version: normalizeText(payload?.appVersion, 64),
    station_id: normalizeText(payload?.stationId || session.branchId, 64),
    station_name: normalizeText(payload?.stationName || session.branchName, 255),
    cashier_user_id: normalizeText(session.userId, 64),
    cashier_name: normalizeText(payload?.cashierName || session.fullName, 255),
    status: buildDeviceStatus({
      isOnline,
      pendingCount,
      failedCount,
      needsReviewCount,
    }),
    pending_count: pendingCount,
    failed_count: failedCount,
    needs_review_count: needsReviewCount,
    oldest_unsynced_at: normalizeIsoDate(payload?.oldestUnsyncedAt),
    last_sync_attempt_at: normalizeIsoDate(payload?.lastSyncAttemptAt),
    last_synced_at: normalizeIsoDate(payload?.lastSyncedAt),
    last_error: normalizeText(payload?.lastError, 1000),
    is_online: isOnline,
    reported_at: normalizeIsoDate(payload?.reportedAt) || now,
    updated_at: now,
  };
  const { databases, databaseId } = createDatabasesClient();

  try {
    try {
      await databases.updateDocument(
        databaseId,
        COLLECTIONS.posDeviceSyncStatus,
        documentId,
        data,
      );
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }

      await databases.createDocument(
        databaseId,
        COLLECTIONS.posDeviceSyncStatus,
        documentId,
        data,
      );
    }

    return {
      success: true,
      status: data.status,
      reportedAt: data.reported_at,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName,
        genericLabel: "update POS sync status",
        fallbackMessage: "Could not update POS sync status.",
      }),
    };
  }
}
