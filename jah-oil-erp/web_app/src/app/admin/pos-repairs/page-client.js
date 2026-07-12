"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/dashboard/DataTable";
import ToastMessage from "@/components/ui/ToastMessage";
import DashboardPageShell from "@/features/dashboard/page-shell";
import {
  PAGE_SIZE,
  buildPaginatedResult,
  formatCurrency,
  formatDisplayDateTime,
} from "@/features/operations/helpers";
import {
  CompactFieldLabel,
  CompactFilterCard,
  CompactInput,
  CompactSummaryCards,
  PaginationControls,
  PaginationSummary,
} from "@/features/operations/ui";

import { markPosTransactionEnvelopeAppliedAction } from "./actions";

function formatStatus(value) {
  return `${value || ""}`
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTransactionType(value) {
  return `${value || ""}`
    .replace("sale_create", "Sale")
    .replace("sale_reverse", "Reversal");
}

function formatDeviceStatus(value) {
  return `${value || "unknown"}`
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildSummaryCards(records) {
  const totalAmount = records.reduce(
    (sum, record) => sum + Number(record.totalAmount || 0),
    0,
  );

  return [
    {
      title: "Repair Needed",
      value: records.length.toLocaleString(),
      icon: "wrench",
    },
    {
      title: "Failed Value",
      value: formatCurrency(totalAmount),
      icon: "receipt",
    },
    {
      title: "Manual Review",
      value: records.filter((record) => record.errorMessage).length.toLocaleString(),
      icon: "warning",
    },
    {
      title: "Latest Issue",
      value: records[0]?.updatedAtLabel || "None",
      icon: "clock",
    },
  ];
}

export default function PosRepairsPageClient({
  envelopes,
  deviceSyncStatuses = [],
  shellProps,
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState(null);
  const [isPending, startTransition] = useTransition();

  const records = useMemo(
    () =>
      (Array.isArray(envelopes) ? envelopes : []).map((record) => ({
        ...record,
        transactionTypeLabel: formatTransactionType(record.transactionType),
        statusLabel: formatStatus(record.status),
        updatedAtLabel: formatDisplayDateTime(record.updatedAt || record.createdAt),
        createdAtLabel: formatDisplayDateTime(record.createdAt),
      })),
    [envelopes],
  );
  const deviceRecords = useMemo(
    () =>
      (Array.isArray(deviceSyncStatuses) ? deviceSyncStatuses : []).map(
        (record) => ({
          ...record,
          statusLabel: formatDeviceStatus(record.status),
          updatedAtLabel: formatDisplayDateTime(record.updatedAt || record.reportedAt),
          reportedAtLabel: formatDisplayDateTime(record.reportedAt),
          oldestUnsyncedAtLabel: formatDisplayDateTime(record.oldestUnsyncedAt),
          lastSyncAttemptAtLabel: formatDisplayDateTime(record.lastSyncAttemptAt),
          lastSyncedAtLabel: formatDisplayDateTime(record.lastSyncedAt),
        }),
      ),
    [deviceSyncStatuses],
  );

  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return records.filter((record) => {
      if (!normalizedSearch) {
        return true;
      }

      return [
        record.id,
        record.transactionTypeLabel,
        record.statusLabel,
        record.idempotencyKey,
        record.receiptNumber,
        record.stationName,
        record.cashierName,
        record.payloadSummary,
        record.errorMessage,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [records, searchTerm]);
  const filteredDeviceRecords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return deviceRecords.filter((record) => {
      if (!normalizedSearch) {
        return true;
      }

      return [
        record.deviceId,
        record.platform,
        record.appVersion,
        record.statusLabel,
        record.stationName,
        record.cashierName,
        record.lastError,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [deviceRecords, searchTerm]);

  const pagination = useMemo(
    () => buildPaginatedResult(filteredRecords, page, PAGE_SIZE),
    [filteredRecords, page],
  );
  const summaryCards = useMemo(() => buildSummaryCards(records), [records]);

  function markApplied(record) {
    const formData = new FormData();
    formData.set("envelopeId", record.id);

    setFeedback(null);
    startTransition(async () => {
      const result = await markPosTransactionEnvelopeAppliedAction(formData);
      setFeedback(result || null);

      if (result?.success) {
        router.refresh();
      }
    });
  }

  function renderStatus(record) {
    const className =
      record.status === "applied"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
        : record.status === "repair_needed"
          ? "bg-amber-50 text-amber-700 ring-amber-100"
          : "bg-sky-50 text-sky-700 ring-sky-100";

    return (
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}
      >
        {record.statusLabel || "Unknown"}
      </span>
    );
  }

  function renderDeviceStatus(record) {
    const status = `${record?.status || ""}`.trim().toLowerCase();
    const className =
      status === "synced"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
        : status === "failed"
          ? "bg-rose-50 text-rose-700 ring-rose-100"
          : status === "offline"
            ? "bg-amber-50 text-amber-700 ring-amber-100"
            : "bg-sky-50 text-sky-700 ring-sky-100";

    return (
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}
      >
        {record.statusLabel || "Unknown"}
      </span>
    );
  }

  const columns = [
    { key: "updatedAtLabel", label: "Updated" },
    { key: "transactionTypeLabel", label: "Type" },
    { key: "statusLabel", label: "Status", render: renderStatus },
    {
      key: "id",
      label: "Envelope",
      render: (record) => (
        <div className="space-y-1">
          <p className="font-mono text-xs font-semibold text-slate-900">
            {record.id}
          </p>
          <p className="font-mono text-[11px] text-slate-500">
            {record.idempotencyKey || "No idempotency key"}
          </p>
        </div>
      ),
    },
    { key: "receiptNumber", label: "Receipt" },
    { key: "stationName", label: "Station" },
    { key: "cashierName", label: "Cashier" },
    { key: "totalAmount", label: "Amount", format: "currency" },
    {
      key: "payloadSummary",
      label: "Payload",
      render: (record) => (
        <span className="line-clamp-2 max-w-[280px] text-xs text-slate-600">
          {record.payloadSummary || "—"}
        </span>
      ),
    },
    {
      key: "errorMessage",
      label: "Last Error",
      render: (record) => (
        <span className="block max-w-[420px] whitespace-normal break-words text-xs leading-5 text-amber-700">
          {record.errorMessage || "—"}
        </span>
      ),
    },
    {
      key: "action",
      label: "Action",
      render: (record) => (
        <button
          type="button"
          disabled={isPending}
          onClick={(event) => {
            event.stopPropagation();
            markApplied(record);
          }}
          className="cursor-pointer rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving" : "Mark applied"}
        </button>
      ),
    },
  ];
  const deviceColumns = [
    { key: "updatedAtLabel", label: "Updated" },
    { key: "statusLabel", label: "Status", render: renderDeviceStatus },
    {
      key: "deviceId",
      label: "Device",
      render: (record) => (
        <div className="space-y-1">
          <p className="font-mono text-xs font-semibold text-slate-900">
            {record.deviceId || record.id}
          </p>
          <p className="text-[11px] text-slate-500">
            {record.platform || "unknown"} {record.appVersion ? `· ${record.appVersion}` : ""}
          </p>
        </div>
      ),
    },
    { key: "stationName", label: "Station" },
    { key: "cashierName", label: "Cashier" },
    { key: "pendingCount", label: "Queued", format: "number" },
    { key: "failedCount", label: "Failed", format: "number" },
    { key: "needsReviewCount", label: "Review", format: "number" },
    { key: "oldestUnsyncedAtLabel", label: "Oldest Unsynced" },
    { key: "lastSyncedAtLabel", label: "Last Synced" },
    {
      key: "lastError",
      label: "Last Error",
      render: (record) => (
        <span className="line-clamp-2 max-w-[280px] text-xs text-amber-700">
          {record.lastError || "—"}
        </span>
      ),
    },
  ];

  return (
    <DashboardPageShell
      title="POS Envelopes"
      description="Review repair-needed POS envelopes that indicate partially applied or failed operations."
      {...shellProps}
    >
      <CompactFilterCard columnsClass="lg:flex-nowrap">
        <div className="min-w-[320px]">
          <CompactFieldLabel htmlFor="posRepairSearch">
            search
          </CompactFieldLabel>
          <CompactInput
            id="posRepairSearch"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
            placeholder="Search receipt, station, cashier, error"
          />
        </div>
      </CompactFilterCard>

      <ToastMessage
        message={feedback?.message || ""}
        tone={feedback?.success ? "success" : feedback ? "error" : "info"}
        onClose={() => setFeedback(null)}
      />

      <CompactSummaryCards
        items={summaryCards}
        fullRow
        columnsClass="sm:grid-cols-2 xl:grid-cols-4"
      />

      <div className="space-y-4">
        <DataTable
          columns={deviceColumns}
          data={filteredDeviceRecords}
          title="POS Device Queue Status"
          subtitle="Tracks cashier devices with queued, failed, or review-needed local POS records."
        />

        <PaginationSummary
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={PAGE_SIZE}
          label="repair-needed POS envelope records"
        />
        <DataTable
          columns={columns}
          data={pagination.records}
          title="Repair-needed POS Envelopes"
          subtitle="Only partially applied or failed POS sale and reversal operations are shown here."
        />
        <PaginationControls
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </DashboardPageShell>
  );
}
