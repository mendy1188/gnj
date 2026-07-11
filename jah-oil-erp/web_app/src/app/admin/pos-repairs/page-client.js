"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/dashboard/DataTable";
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
  CompactSelect,
  CompactSummaryCards,
  PaginationControls,
  PaginationSummary,
} from "@/features/operations/ui";

import { markPosTransactionEnvelopeAppliedAction } from "./actions";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "repair_needed", label: "Repair needed" },
  { value: "applying", label: "Applying" },
  { value: "applied", label: "Applied" },
];

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

function buildSummaryCards(records) {
  const repairNeeded = records.filter(
    (record) => record.status === "repair_needed",
  ).length;
  const applying = records.filter((record) => record.status === "applying").length;
  const totalAmount = records.reduce(
    (sum, record) => sum + Number(record.totalAmount || 0),
    0,
  );

  return [
    {
      title: "Repair Needed",
      value: repairNeeded.toLocaleString(),
      icon: "🛠️",
    },
    {
      title: "Applying",
      value: applying.toLocaleString(),
      icon: "⏳",
    },
    {
      title: "Envelope Value",
      value: formatCurrency(totalAmount),
      icon: "🧾",
    },
  ];
}

export default function PosRepairsPageClient({ envelopes, shellProps }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("repair_needed");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
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

  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return records.filter((record) => {
      if (statusFilter !== "all" && record.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        record.transactionTypeLabel,
        record.statusLabel,
        record.idempotencyKey,
        record.receiptNumber,
        record.stationName,
        record.cashierName,
        record.errorMessage,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [records, searchTerm, statusFilter]);

  const pagination = useMemo(
    () => buildPaginatedResult(filteredRecords, page, PAGE_SIZE),
    [filteredRecords, page],
  );
  const summaryCards = useMemo(() => buildSummaryCards(records), [records]);

  function markApplied(record) {
    const formData = new FormData();
    formData.set("envelopeId", record.id);

    setMessage("");
    startTransition(async () => {
      const result = await markPosTransactionEnvelopeAppliedAction(formData);
      setMessage(result?.message || "");

      if (result?.success) {
        router.refresh();
      }
    });
  }

  const columns = [
    { key: "updatedAtLabel", label: "Updated" },
    { key: "transactionTypeLabel", label: "Type" },
    { key: "statusLabel", label: "Status" },
    { key: "receiptNumber", label: "Receipt" },
    { key: "stationName", label: "Station" },
    { key: "cashierName", label: "Cashier" },
    { key: "totalAmount", label: "Amount", format: "currency" },
    { key: "errorMessage", label: "Last Error" },
    {
      key: "action",
      label: "Action",
      render: (record) =>
        record.status === "applied" ? (
          <span className="text-xs font-semibold text-emerald-700">Applied</span>
        ) : (
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

  return (
    <DashboardPageShell
      title="POS Repairs"
      description="Review POS sale and reversal operations that need consistency checks."
      {...shellProps}
    >
      <CompactFilterCard columnsClass="lg:flex-nowrap">
        <div className="min-w-[220px]">
          <CompactFieldLabel htmlFor="posRepairStatus">
            status
          </CompactFieldLabel>
          <CompactSelect
            id="posRepairStatus"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </CompactSelect>
        </div>
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

      {message ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
          {message}
        </div>
      ) : null}

      <CompactSummaryCards items={summaryCards} fullRow />

      <div className="space-y-4">
        <PaginationSummary
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={PAGE_SIZE}
          label="POS repair records"
        />
        <DataTable
          columns={columns}
          data={pagination.records}
          title="POS Transaction Envelopes"
          subtitle="Inspect records before marking them applied. Keep failed financial records auditable."
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
