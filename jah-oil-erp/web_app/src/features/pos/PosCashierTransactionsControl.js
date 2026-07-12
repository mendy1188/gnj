"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AppIcon } from "@/components/ui/AppIcon";
import ToastMessage from "@/components/ui/ToastMessage";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import {
  getPosSyncPanelSnapshot,
  queuePendingPosReversal,
  subscribeToPosSyncStatus,
  syncPendingPosSales,
} from "@/features/pos/offline-sync";

const PAGE_SIZE = 20;

function formatCurrency(value) {
  return `D${Number(value || 0).toLocaleString()}`;
}

function formatDisplayDate(value) {
  const parsedDate = new Date(value || "");

  if (Number.isNaN(parsedDate.getTime())) {
    return "Today";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsedDate);
}

function formatTimeOnly(value) {
  const parsedDate = new Date(value || "");

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getQueuedReversalReceiptIds(queuedSales = []) {
  return new Set(
    (Array.isArray(queuedSales) ? queuedSales : [])
      .filter(
        (entry) =>
          `${entry?.syncAction || ""}`.trim().toLowerCase() === "sale_reverse",
      )
      .map((entry) => `${entry?.receiptNumber || ""}`.trim())
      .filter(Boolean),
  );
}

function removeReceiptFromSummary(summary, receiptNumber, amount) {
  const normalizedReceiptNumber = `${receiptNumber || ""}`.trim();

  if (!normalizedReceiptNumber) {
    return summary;
  }

  const nextRecords = (Array.isArray(summary?.records) ? summary.records : []).filter(
    (record) => `${record?.receiptNumber || ""}`.trim() !== normalizedReceiptNumber,
  );
  const removedCount =
    (Array.isArray(summary?.records) ? summary.records.length : 0) - nextRecords.length;

  if (removedCount <= 0) {
    return summary;
  }

  return {
    ...summary,
    totalTransactions: Math.max(0, Number(summary?.totalTransactions || 0) - removedCount),
    totalAmount: Math.max(
      0,
      Number((Number(summary?.totalAmount || 0) - Number(amount || 0)).toFixed(2)),
    ),
    records: nextRecords,
  };
}

function removeQueuedReversalTransactions(summary, queuedReceiptNumbers) {
  const queuedIds = queuedReceiptNumbers instanceof Set
    ? queuedReceiptNumbers
    : new Set();

  return (Array.isArray(summary?.records) ? summary.records : []).reduce(
    (currentSummary, record) => {
      const receiptNumber = `${record?.receiptNumber || ""}`.trim();

      if (!receiptNumber || !queuedIds.has(receiptNumber)) {
        return currentSummary;
      }

      return removeReceiptFromSummary(
        currentSummary,
        receiptNumber,
        Number(record?.amount || 0),
      );
    },
    summary,
  );
}

function buildQueuedReversalToastMessage(syncMessage) {
  const normalizedMessage = `${syncMessage || ""}`.trim().toLowerCase();

  if (!normalizedMessage) {
    return "Transaction reversed on this device and added to the sync queue. It will sync automatically shortly.";
  }

  if (
    normalizedMessage.includes("connection") ||
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("reach the server") ||
    normalizedMessage.includes("unable to sync")
  ) {
    return "No connection right now. Transaction reversed on this device and queued. It will sync automatically when the connection improves.";
  }

  return "Transaction reversed on this device, but it could not sync right now. It was added to the queue and will retry automatically.";
}

export default function PosCashierTransactionsControl({
  session,
  refreshKey = 0,
}) {
  const panelRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(() => getPosSyncPanelSnapshot());
  const [summary, setSummary] = useState({
    date: "",
    totalTransactions: 0,
    totalAmount: 0,
    nextCursor: "",
    hasMore: false,
    pageSize: PAGE_SIZE,
    records: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [cursor, setCursor] = useState("");
  const [cursorHistory, setCursorHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [reversingReceiptNumber, setReversingReceiptNumber] = useState("");
  const todayDate = useMemo(() => getTodayDateString(), []);
  const pendingReversalReceiptIds = useMemo(
    () => getQueuedReversalReceiptIds(snapshot.queuedSales),
    [snapshot.queuedSales],
  );

  useEffect(() => {
    const syncSnapshot = () => {
      setSnapshot(getPosSyncPanelSnapshot());
    };

    syncSnapshot();
    return subscribeToPosSyncStatus(syncSnapshot);
  }, []);

  useEffect(() => {
    if (!feedback?.message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isActive = true;

    async function loadTransactions() {
      setIsLoading(true);
      setError("");

      try {
        const searchParams = new URLSearchParams();
        searchParams.set("date", todayDate);
        if (session?.branchId) {
          searchParams.set("stationId", session.branchId);
        }
        if (cursor) {
          searchParams.set("cursor", cursor);
        }
        searchParams.set("pageSize", String(PAGE_SIZE));

        const response = await fetch(`/api/pos/day-transactions?${searchParams.toString()}`, {
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message || "Failed to load cashier transactions.");
        }

        if (!isActive) {
          return;
        }

        setSummary((current) =>
          removeQueuedReversalTransactions(
            {
              date: payload?.date || todayDate,
              totalTransactions:
                typeof payload?.totalTransactions === "number"
                  ? Number(payload.totalTransactions)
                  : current.totalTransactions,
              totalAmount:
                typeof payload?.totalAmount === "number"
                  ? Number(payload.totalAmount)
                  : current.totalAmount,
              nextCursor: `${payload?.nextCursor || ""}`.trim(),
              hasMore: Boolean(payload?.hasMore),
              pageSize: Number(payload?.pageSize || PAGE_SIZE),
              records: Array.isArray(payload?.records) ? payload.records : [],
            },
            pendingReversalReceiptIds,
          ),
        );
      } catch (fetchError) {
        if (!isActive) {
          return;
        }

        setError(
          getUserFacingErrorMessage(fetchError, {
            moduleName: "POS",
            genericLabel: "load cashier transactions",
            fallbackMessage: "Failed to load cashier transactions.",
          }),
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadTransactions();

    return () => {
      isActive = false;
    };
  }, [
    cursor,
    isOpen,
    pendingReversalReceiptIds,
    refreshKey,
    session?.branchId,
    todayDate,
  ]);

  async function handleReverse(record) {
    const receiptNumber = `${record?.receiptNumber || ""}`.trim();

    if (!receiptNumber || reversingReceiptNumber) {
      return;
    }

    setFeedback(null);
    setReversingReceiptNumber(receiptNumber);

    try {
      const queuedReversal = queuePendingPosReversal({
        receiptId: record?.receiptId || record?.id || "",
        receiptNumber,
        saleDate: record?.saleDate || new Date().toISOString(),
        reversedAt: new Date().toISOString(),
        stationId: record?.stationId || session?.branchId || "",
        stationName: record?.station || session?.branchName || "",
        cashierName: session?.fullName || "",
        totalAmount: Number(record?.amount || 0),
      });

      setSummary((current) =>
        removeReceiptFromSummary(current, receiptNumber, record?.amount || 0),
      );

      const syncResult = await syncPendingPosSales({
        prioritizeSaleId: queuedReversal.id,
      });
      const queuedResult = syncResult?.results?.[queuedReversal.id];
      setSnapshot(getPosSyncPanelSnapshot());

      if (queuedResult?.success) {
        setFeedback({
          tone: "success",
          message: "Transaction reversed successfully.",
        });
        return;
      }

      setFeedback({
        tone: "warning",
        message: buildQueuedReversalToastMessage(queuedResult?.message),
      });
    } catch (reverseError) {
      setFeedback({
        tone: "error",
        message: getUserFacingErrorMessage(reverseError, {
          moduleName: "POS",
          genericLabel: "reverse this transaction",
          fallbackMessage: "Failed to reverse transaction.",
        }),
      });
    } finally {
      setReversingReceiptNumber("");
    }
  }

  const transactionRangeStart = summary.records.length
    ? (page - 1) * summary.pageSize + 1
    : 0;
  const transactionRangeEnd = summary.records.length
    ? transactionRangeStart + summary.records.length - 1
    : 0;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        aria-label="Open today's cashier transactions for reversal"
        title="Open today's transactions"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          setCursor("");
          setCursorHistory([]);
          setPage(1);
          setSummary((current) => ({
            ...current,
            nextCursor: "",
            hasMore: false,
            pageSize: PAGE_SIZE,
            records: [],
          }));
          setIsOpen((current) => !current);
        }}
        className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-3xl border border-slate-200 bg-slate-100 px-3 text-slate-700 transition hover:bg-slate-200"
      >
        <AppIcon name="receipt" className="h-5 w-5" />
        {/* <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 sm:inline">
          Reverse
        </span> */}
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Today's cashier transactions"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[34rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
        >
          <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-sky-200">
                  Today&apos;s Transactions
                </p>
                <h3 className="mt-1 text-lg font-semibold">
                  {session?.fullName || "Cashier"}
                </h3>
                <p className="mt-1 text-xs text-slate-300">
                  {formatDisplayDate(summary.date || todayDate)}
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
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
            <ToastMessage
              message={feedback?.message || ""}
              tone={
                feedback?.tone === "success"
                  ? "success"
                  : feedback?.tone === "warning"
                    ? "warning"
                    : feedback
                      ? "error"
                      : "info"
              }
              onClose={() => setFeedback(null)}
            />

            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                Loading transactions…
              </div>
            ) : error ? (
              <ToastMessage message={error} tone="error" onClose={() => setError("")} />
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Total Sales
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatCurrency(summary.totalAmount)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Transactions
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {summary.totalTransactions.toLocaleString()}
                    </p>
                  </div>
                </div>

                {summary.records.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                    No cashier transactions recorded today.
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {summary.records.map((record) => {
                        const isQueued = pendingReversalReceiptIds.has(
                          `${record?.receiptNumber || ""}`.trim(),
                        );
                        const isReversing =
                          reversingReceiptNumber === record.receiptNumber;

                        return (
                          <div
                            key={record.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {record.itemSummary || record.receiptNumber || "Transaction"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatTimeOnly(record.saleDate)} ·{" "}
                                  {Number(record.itemCount || 0).toLocaleString()} item
                                  {Number(record.itemCount || 0) === 1 ? "" : "s"} ·{" "}
                                  {record.paymentMethod || "Payment"}
                                </p>
                                {record.customerName || record.customerPhone ? (
                                  <p className="mt-1 text-xs text-slate-500">
                                    {record.customerName || "Walk-in Customer"}
                                    {record.customerPhone
                                      ? ` · ${record.customerPhone}`
                                      : ""}
                                  </p>
                                ) : null}
                                {record.receiptNumber ? (
                                  <p className="mt-1 text-xs text-slate-500">
                                    {record.receiptNumber}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex flex-col items-end gap-2">
                                <p className="text-sm font-semibold text-slate-900">
                                  {formatCurrency(record.amount)}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleReverse(record)}
                                  disabled={isQueued || isReversing}
                                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                    isQueued || isReversing
                                      ? "cursor-not-allowed border-rose-200 bg-rose-50 text-rose-400"
                                      : "cursor-pointer border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  }`}
                                >
                                  {isQueued
                                    ? "Queued"
                                    : isReversing
                                      ? "Reversing..."
                                      : "Reverse"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (cursorHistory.length === 0) {
                            return;
                          }

                          const nextHistory = [...cursorHistory];
                          const previousCursor = nextHistory.pop() || "";
                          setCursorHistory(nextHistory);
                          setCursor(previousCursor);
                          setPage((current) => Math.max(1, current - 1));
                        }}
                        disabled={cursorHistory.length === 0}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          cursorHistory.length === 0
                            ? "cursor-not-allowed bg-slate-100 text-slate-400"
                            : "cursor-pointer bg-slate-900 text-white hover:bg-slate-800"
                        }`}
                      >
                        Previous
                      </button>
                      <p className="flex-1 text-center text-xs text-slate-500">
                        Page {page} · {transactionRangeStart}-{transactionRangeEnd} of{" "}
                        {summary.totalTransactions.toLocaleString()}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (!summary.hasMore || !summary.nextCursor) {
                            return;
                          }

                          setCursorHistory((current) => [...current, cursor]);
                          setCursor(summary.nextCursor);
                          setPage((current) => current + 1);
                        }}
                        disabled={!summary.hasMore || !summary.nextCursor}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          !summary.hasMore || !summary.nextCursor
                            ? "cursor-not-allowed bg-slate-100 text-slate-400"
                            : "cursor-pointer bg-slate-900 text-white hover:bg-slate-800"
                        }`}
                      >
                        Next
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
