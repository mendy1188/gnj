"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/dashboard/DataTable";
import DashboardPageShell from "@/features/dashboard/page-shell";
import {
  formatDisplayDateTime,
  PAGE_SIZE,
  paginateItems,
} from "@/features/operations/helpers";
import {
  CompactActionButton,
  CompactFieldLabel,
  CompactFilterCard,
  CompactInput,
  CompactSummaryCards,
  PaginationControls,
  PaginationSummary,
} from "@/features/operations/ui";

import { recordIncomingStockAction } from "./actions";

const stockColumns = [
  { key: "station", label: "Station" },
  { key: "name", label: "Product" },
  { key: "quantity", label: "Current Qty", format: "number" },
  { key: "unit", label: "Unit" },
  { key: "reorderLevel", label: "Reorder Level", format: "number" },
  { key: "status", label: "Status" },
  {
    key: "action",
    label: "Action",
    render: (row, _column, onSelect) => (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(row);
        }}
        className="cursor-pointer rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
      >
        Record New Stock
      </button>
    ),
  },
];

const historyColumns = [
  {
    key: "recordedAt",
    label: "Date",
    render: (row) => formatDisplayDateTime(row.recordedAt || row.date),
  },
  { key: "quantityAdded", label: "Added", format: "number" },
  { key: "previousQuantity", label: "Previous", format: "number" },
  { key: "newQuantity", label: "New Total", format: "number" },
  { key: "recordedBy", label: "Recorded By" },
];

function buildSummaryCards(records, historyRecords = []) {
  const totalQuantity = records.reduce(
    (sum, record) => sum + Number(record.quantity || 0),
    0,
  );
  const latestRecord = historyRecords[0];

  return [
    {
      title: "Available Products",
      value: records.length.toLocaleString(),
      icon: "📦",
    },
    {
      title: "Current Branch Stock",
      value: totalQuantity.toLocaleString(),
      icon: "📥",
    },
    {
      title: "Latest Receipt",
      value: latestRecord
        ? `${latestRecord.quantityAdded.toLocaleString()} ${latestRecord.unit}`
        : "No history",
      icon: "🧾",
    },
  ];
}

function buildDetailCards(selectedRecord, historyRecords) {
  const totalReceived = historyRecords.reduce(
    (sum, record) => sum + Number(record.quantityAdded || 0),
    0,
  );
  const latestRecord = historyRecords[0];

  return [
    {
      title: "Current Quantity",
      value: `${Number(selectedRecord?.quantity || 0).toLocaleString()} ${selectedRecord?.unit || ""}`.trim(),
      icon: "📦",
    },
    {
      title: "Total Incoming",
      value: `${totalReceived.toLocaleString()} ${selectedRecord?.unit || ""}`.trim(),
      icon: "📥",
    },
    {
      title: "Last Update",
      value: latestRecord?.recordedBy || "No entries",
      icon: "🕒",
    },
  ];
}

function normalizeStatus(record) {
  if (record.quantity <= 0) {
    return "Out";
  }
  if (record.quantity <= record.reorderLevel) {
    return "Low Stock";
  }
  return "Healthy";
}

export default function IncomingStockPageClient({
  inventoryRecords,
  incomingStockRecords,
  shellProps,
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stationFilter, setStationFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [quantityAdded, setQuantityAdded] = useState("");
  const [notes, setNotes] = useState("");
  const [submissionState, setSubmissionState] = useState(null);

  const stockRows = useMemo(
    () =>
      inventoryRecords.map((record) => ({
        ...record,
        status: normalizeStatus(record),
      })),
    [inventoryRecords],
  );

  const stationOptions = useMemo(
    () => ["All", ...new Set(stockRows.map((record) => record.station))],
    [stockRows],
  );

  const filteredRows = useMemo(
    () =>
      stockRows.filter((record) => {
        if (stationFilter !== "All" && record.station !== stationFilter) {
          return false;
        }
        if (statusFilter !== "All" && record.status !== statusFilter) {
          return false;
        }
        return true;
      }),
    [stockRows, stationFilter, statusFilter],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(filteredRows, incomingStockRecords),
    [filteredRows, incomingStockRecords],
  );

  const selectedRecord = useMemo(
    () => filteredRows.find((record) => record.id === selectedRecordId) || null,
    [filteredRows, selectedRecordId],
  );

  const historyRecords = useMemo(
    () =>
      incomingStockRecords.filter(
        (record) => record.inventoryItemId === selectedRecordId,
      ),
    [incomingStockRecords, selectedRecordId],
  );

  const paginatedHistory = useMemo(
    () => paginateItems(historyRecords, historyPage, PAGE_SIZE),
    [historyRecords, historyPage],
  );

  function resetFilters() {
    setStationFilter("All");
    setStatusFilter("All");
    setSelectedRecordId("");
    setHistoryPage(1);
    setQuantityAdded("");
    setNotes("");
    setSubmissionState(null);
  }

  function handleSelectRecord(record) {
    setSelectedRecordId(record.id);
    setHistoryPage(1);
    setSubmissionState(null);
  }

  function handleBack() {
    setSelectedRecordId("");
    setHistoryPage(1);
    setQuantityAdded("");
    setNotes("");
    setSubmissionState(null);
  }

  function handleSubmit() {
    if (!selectedRecord) {
      return;
    }

    setSubmissionState(null);

    startTransition(async () => {
      const result = await recordIncomingStockAction({
        inventoryItemId: selectedRecord.id,
        quantityAdded: Number(quantityAdded),
        notes,
      });

      setSubmissionState(result);

      if (result?.success) {
        setQuantityAdded("");
        setNotes("");
        router.refresh();
      }
    });
  }

  return (
    <DashboardPageShell
      title="Incoming Stock"
      description="Record stock receipts and review incoming stock history for each branch product."
      {...shellProps}
    >
      <CompactFilterCard
        actions={
          <CompactActionButton onClick={resetFilters}>
            Reset filters
          </CompactActionButton>
        }
      >
        <div>
          <CompactFieldLabel>station</CompactFieldLabel>
          <select
            value={stationFilter}
            onChange={(event) => {
              setStationFilter(event.target.value);
              setSelectedRecordId("");
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 transition outline-none focus:border-sky-500"
          >
            {stationOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div>
          <CompactFieldLabel>status</CompactFieldLabel>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setSelectedRecordId("");
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 transition outline-none focus:border-sky-500"
          >
            <option value="All">All</option>
            <option value="Healthy">Healthy</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out">Out</option>
          </select>
        </div>
      </CompactFilterCard>

      {!selectedRecord ? (
        <>
          <CompactSummaryCards items={summaryCards} fullRow />
          <DataTable
            columns={stockColumns}
            data={filteredRows}
            title="Available Products"
            subtitle="Review branch stock and open any item to record a new incoming quantity."
            onRowClick={(row) => handleSelectRecord(row)}
          />
        </>
      ) : (
        <div className="space-y-6">
          <CompactSummaryCards
            items={buildDetailCards(selectedRecord, historyRecords)}
            fullRow
          />

          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {selectedRecord.name} Incoming Stock
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Record new stock for {selectedRecord.station} and update branch
                  inventory immediately.
                </p>
              </div>
              <CompactActionButton onClick={handleBack}>
                ← Back to products
              </CompactActionButton>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[180px_1fr_auto]">
              <div>
                <CompactFieldLabel htmlFor="quantityAdded">
                  quantity
                </CompactFieldLabel>
                <CompactInput
                  id="quantityAdded"
                  type="number"
                  min="1"
                  value={quantityAdded}
                  onChange={(event) => setQuantityAdded(event.target.value)}
                  placeholder={`Add ${selectedRecord.unit}`}
                />
              </div>
              <div>
                <CompactFieldLabel htmlFor="notes">notes</CompactFieldLabel>
                <CompactInput
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional note"
                />
              </div>
              <div className="md:self-end">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending || !quantityAdded}
                  className="inline-flex w-full cursor-pointer items-center justify-center rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Saving..." : "Record New Stock"}
                </button>
              </div>
            </div>

            {submissionState?.message ? (
              <div
                className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                  submissionState.success
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {submissionState.message}
              </div>
            ) : null}
          </div>

          <PaginationSummary
            currentPage={historyPage}
            totalItems={historyRecords.length}
            pageSize={PAGE_SIZE}
            label="incoming stock records"
          />
          <DataTable
            columns={historyColumns}
            data={paginatedHistory}
            title={`${selectedRecord.name} Incoming History`}
            subtitle="Latest stock receipts are shown first."
          />
          <PaginationControls
            currentPage={historyPage}
            totalItems={historyRecords.length}
            pageSize={PAGE_SIZE}
            onPageChange={setHistoryPage}
          />
        </div>
      )}
    </DashboardPageShell>
  );
}
