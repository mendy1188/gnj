"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AppIcon } from "@/components/ui/AppIcon";
import {
  clearResolvedPosSyncEntries,
  formatLastSyncedAt as formatPosSyncTime,
  getPosSyncPanelSnapshot,
  markPendingPosSaleNeedsReview,
  subscribeToPosSyncStatus,
  syncPendingPosSales,
} from "@/features/pos/offline-sync";

const DEFAULT_PANEL_SNAPSHOT = {
  pendingCount: 0,
  lastSyncedAt: "",
  isOnline: true,
  isSyncing: false,
  queuedSales: [],
  recentActivity: [],
};

function formatCurrency(value) {
  return `D${Number(value || 0).toLocaleString()}`;
}

function getSyncButtonState({ isOnline, isSyncing, pendingCount }) {
  if (!isOnline) {
    return {
      buttonClassName:
        "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
      dotClassName: "bg-amber-500",
    };
  }

  return {
    buttonClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    dotClassName: "bg-emerald-500",
  };
}

function getQueuedSaleStatusLabel(entry) {
  const status = `${entry?.status || ""}`.trim().toLowerCase();

  if (status === "syncing") {
    return "Syncing";
  }

  if (status === "failed") {
    return "Failed";
  }

  if (status === "needs_review") {
    return "Needs review";
  }

  if (status === "synced") {
    return "Synced";
  }

  return "Queued";
}

function getQueuedSaleStatusClassName(entry) {
  const status = `${entry?.status || ""}`.trim().toLowerCase();

  if (status === "syncing") {
    return "bg-sky-100 text-sky-700";
  }

  if (status === "failed") {
    return "bg-rose-100 text-rose-700";
  }

  if (status === "needs_review") {
    return "bg-violet-100 text-violet-700";
  }

  if (status === "synced") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-amber-100 text-amber-700";
}

function buildTooltipText(snapshot) {
  if (!snapshot.isOnline) {
    return `POS is offline. Queued items will sync automatically when connection is restored.\nLast synced: ${formatPosSyncTime(
      snapshot.lastSyncedAt,
    )}`;
  }

  if (snapshot.pendingCount > 0) {
    return `POS is online. ${snapshot.pendingCount.toLocaleString()} queued item${
      snapshot.pendingCount === 1 ? "" : "s"
    } waiting to sync.\nLast synced: ${formatPosSyncTime(snapshot.lastSyncedAt)}`;
  }

  return `POS is online and synced.\nLast synced: ${formatPosSyncTime(
    snapshot.lastSyncedAt,
  )}`;
}

function getQueuedEntryTypeLabel(entry) {
  return `${entry?.syncAction || ""}`.trim().toLowerCase() === "sale_reverse"
    ? "Reversal"
    : "Sale";
}

function SyncIcon({ isSyncing = false }) {
  return <AppIcon name="sync" className="h-5 w-5" spin={isSyncing} />;
}

export default function PosSyncNavControl() {
  const [snapshot, setSnapshot] = useState(DEFAULT_PANEL_SNAPSHOT);
  const [isOpen, setIsOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    const syncSnapshot = () => {
      setSnapshot(getPosSyncPanelSnapshot());
    };

    syncSnapshot();

    return subscribeToPosSyncStatus(syncSnapshot);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const buttonState = getSyncButtonState(snapshot);
  const tooltipText = buildTooltipText(snapshot);
  const hasSyncedActivity = snapshot.recentActivity.some(
    (entry) => `${entry?.status || ""}`.trim().toLowerCase() === "synced",
  );
  const hasFailedQueuedSales = snapshot.queuedSales.some(
    (entry) =>
      `${entry?.status || ""}`.trim().toLowerCase() === "failed" || entry?.lastError,
  );
  const emptyStateMessage = useMemo(() => {
    if (!snapshot.isOnline) {
      return "POS is offline. New POS actions will stay queued until connectivity returns.";
    }

    if (snapshot.isSyncing) {
      return "POS is syncing queued items now.";
    }

    return "No queued items at the moment.";
  }, [snapshot.isOnline, snapshot.isSyncing]);

  async function handleRetrySync(prioritizeSaleId = "") {
    setIsRetrying(true);

    try {
      await syncPendingPosSales({ prioritizeSaleId });
    } finally {
      setIsRetrying(false);
    }
  }

  function handleFlagForReview(saleId) {
    markPendingPosSaleNeedsReview(saleId);
    setSnapshot(getPosSyncPanelSnapshot());
  }

  return (
    <div ref={panelRef} className="group relative">
      <button
        type="button"
        aria-label="POS sync status"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className={`cursor-pointer relative inline-flex h-11 w-11 items-center justify-center rounded-3xl border transition ${buttonState.buttonClassName}`.trim()}
      >
        <SyncIcon isSyncing={snapshot.isSyncing || isRetrying} />
        <span
          className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-white ${buttonState.dotClassName}`.trim()}
        />
        {hasFailedQueuedSales ? (
          <span className="absolute bottom-1.5 right-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
            !
          </span>
        ) : null}
        {snapshot.pendingCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1.2rem] items-center justify-center rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {snapshot.pendingCount > 99 ? "99+" : snapshot.pendingCount}
          </span>
        ) : null}
      </button>

      {!isOpen ? (
        <div className="pointer-events-none absolute right-0 top-[calc(100%+0.75rem)] z-50 hidden w-72 rounded-2xl border border-slate-200 bg-slate-950 px-3 py-2 text-left text-xs text-white shadow-2xl group-hover:block group-focus-within:block">
          <p className="whitespace-pre-line leading-5 text-slate-100">
            {tooltipText}
          </p>
        </div>
      ) : null}

      {isOpen ? (
        <div
          role="dialog"
          aria-label="POS sync queue"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
        >
          <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-sky-200">
                  POS Sync
                </p>
                <h3 className="mt-1 text-lg font-semibold">
                  {snapshot.pendingCount.toLocaleString()} queued item
                  {snapshot.pendingCount === 1 ? "" : "s"}
                </h3>
                <p className="mt-1 text-xs text-slate-300">
                  Last synced: {formatPosSyncTime(snapshot.lastSyncedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleRetrySync()}
                disabled={
                  isRetrying ||
                  snapshot.isSyncing ||
                  !snapshot.isOnline ||
                  snapshot.pendingCount === 0
                }
                className="inline-flex cursor-pointer items-center rounded-full bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-300"
              >
                {isRetrying || snapshot.isSyncing ? "Syncing..." : "Retry sync"}
              </button>
              <button
                type="button"
                onClick={clearResolvedPosSyncEntries}
                disabled={!hasSyncedActivity}
                className="inline-flex cursor-pointer items-center rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear synced
              </button>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  snapshot.isOnline
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "bg-amber-500/15 text-amber-200"
                }`}
              >
                {snapshot.isOnline ? "Online" : "Offline"}
              </span>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900">Queued items</h4>
                <span className="text-xs text-slate-500">
                  {snapshot.pendingCount.toLocaleString()} pending
                </span>
              </div>

              {snapshot.queuedSales.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  {emptyStateMessage}
                </div>
              ) : (
                <div className="space-y-3">
                  {snapshot.queuedSales.map((entry) => {
                    const entryStatus = `${entry?.status || ""}`.trim().toLowerCase();
                    const isFlaggedForReview = entryStatus === "needs_review";

                    return (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {getQueuedEntryTypeLabel(entry)} ·{" "}
                                {entry.stationName || "Unknown station"}
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getQueuedSaleStatusClassName(
                                  entry,
                                )}`.trim()}
                              >
                                {getQueuedSaleStatusLabel(entry)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatPosSyncTime(entry.queuedAt)} ·{" "}
                              {entry.cashierName || "Unknown cashier"}
                            </p>
                            {entry.receiptNumber ? (
                              <p className="mt-1 text-xs text-slate-500">
                                {entry.receiptNumber}
                              </p>
                            ) : null}
                          </div>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatCurrency(entry.totalAmount)}
                          </p>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                          <div>
                            <span className="font-semibold text-slate-700">
                              Last sync attempt:
                            </span>{" "}
                            {formatPosSyncTime(entry.lastAttemptAt)}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-700">Error:</span>{" "}
                            {entry.lastError || "None"}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRetrySync(entry.id)}
                            disabled={
                              isRetrying ||
                              snapshot.isSyncing ||
                              !snapshot.isOnline ||
                              isFlaggedForReview
                            }
                            className="inline-flex cursor-pointer items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Retry sync
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFlagForReview(entry.id)}
                            disabled={isFlaggedForReview}
                            className="inline-flex cursor-pointer items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isFlaggedForReview ? "Flagged for review" : "Flag issue"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {snapshot.recentActivity.length > 0 ? (
              <div className="mt-5 border-t border-slate-200 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Recent sync activity
                  </h4>
                  <span className="text-xs text-slate-500">
                    {snapshot.recentActivity.length.toLocaleString()} records
                  </span>
                </div>
                <div className="space-y-3">
                  {snapshot.recentActivity.slice(0, 8).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {entry.stationName || "Unknown station"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatPosSyncTime(entry.lastAttemptAt || entry.queuedAt)} ·{" "}
                            {entry.cashierName || "Unknown cashier"}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getQueuedSaleStatusClassName(
                              entry,
                            )}`.trim()}
                          >
                            {getQueuedSaleStatusLabel(entry)}
                          </span>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {formatCurrency(entry.totalAmount)}
                          </p>
                        </div>
                      </div>
                      {entry.lastError ? (
                        <p className="mt-2 text-xs text-rose-600">{entry.lastError}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
