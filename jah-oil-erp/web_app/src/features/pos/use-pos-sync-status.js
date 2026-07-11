"use client";

import { useEffect, useState } from "react";

import {
  getPosSyncStatusSnapshot,
  subscribeToPosSyncStatus,
  syncPendingPosSales,
} from "@/features/pos/offline-sync";

const DEFAULT_POS_SYNC_STATUS = {
  pendingCount: 0,
  lastSyncedAt: "",
  isOnline: true,
  isSyncing: false,
};

export function usePosSyncStatus({ autoSync = false } = {}) {
  const [status, setStatus] = useState(DEFAULT_POS_SYNC_STATUS);

  useEffect(() => {
    setStatus(getPosSyncStatusSnapshot());

    return subscribeToPosSyncStatus(setStatus);
  }, []);

  useEffect(() => {
    if (!autoSync || typeof window === "undefined") {
      return;
    }

    const maybeSync = () => {
      const snapshot = getPosSyncStatusSnapshot();

      if (snapshot.isOnline && snapshot.pendingCount > 0) {
        void syncPendingPosSales();
      }
    };

    maybeSync();

    window.addEventListener("online", maybeSync);
    window.addEventListener("focus", maybeSync);

    const intervalId = window.setInterval(maybeSync, 15000);

    return () => {
      window.removeEventListener("online", maybeSync);
      window.removeEventListener("focus", maybeSync);
      window.clearInterval(intervalId);
    };
  }, [autoSync]);

  return status;
}
