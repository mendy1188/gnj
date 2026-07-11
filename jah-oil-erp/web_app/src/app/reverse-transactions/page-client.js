"use client";

import { useEffect, useMemo, useState } from "react";

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
  CompactSplitPanel,
  CompactSummaryCards,
  PaginationControls,
  PaginationSummary,
} from "@/features/operations/ui";

const stationColumns = [
  { key: "station", label: "Station" },
  { key: "reversalCount", label: "Reversed", format: "number" },
  { key: "totalAmount", label: "Amount", format: "currency" },
  { key: "latestReversedAtLabel", label: "Latest" },
];

const transactionColumns = [
  { key: "reversedAtLabel", label: "Reversed At" },
  { key: "receiptNumber", label: "Receipt" },
  { key: "itemSummary", label: "Items" },
  { key: "cashierName", label: "Cashier" },
  { key: "paymentMethod", label: "Payment" },
  { key: "amount", label: "Amount", format: "currency" },
  { key: "reversedBy", label: "Reversed By" },
];

function buildSummaryCards(records) {
  const stationCount = new Set(
    records.map((record) => `${record.station || ""}`.trim()).filter(Boolean),
  ).size;
  const totalAmount = records.reduce(
    (sum, record) => sum + Number(record.amount || 0),
    0,
  );

  return [
    {
      title: "Reversed Transactions",
      value: records.length.toLocaleString(),
      icon: "↩️",
    },
    {
      title: "Reversed Amount",
      value: formatCurrency(totalAmount),
      icon: "💸",
    },
    {
      title: "Stations",
      value: stationCount.toLocaleString(),
      icon: "🏢",
    },
  ];
}

export default function ReverseTransactionsPageClient({
  reversedTransactions,
  shellProps,
}) {
  const [selectedStation, setSelectedStation] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [stationPage, setStationPage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);

  const normalizedTransactions = useMemo(
    () =>
      (Array.isArray(reversedTransactions) ? reversedTransactions : []).map((record) => ({
        ...record,
        reversedAtLabel: formatDisplayDateTime(record.reversedAt || record.saleDate),
      })),
    [reversedTransactions],
  );

  const stationRows = useMemo(() => {
    const grouped = new Map();

    normalizedTransactions.forEach((record) => {
      const stationKey = `${record.station || "Unknown station"}`.trim();
      const current = grouped.get(stationKey) || {
        id: record.stationId || stationKey,
        station: stationKey,
        reversalCount: 0,
        totalAmount: 0,
        latestReversedAt: "",
      };

      current.reversalCount += 1;
      current.totalAmount += Number(record.amount || 0);

      if (
        `${record.reversedAt || record.saleDate || ""}`.localeCompare(
          `${current.latestReversedAt || ""}`,
        ) > 0
      ) {
        current.latestReversedAt = record.reversedAt || record.saleDate || "";
      }

      grouped.set(stationKey, current);
    });

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        latestReversedAtLabel: formatDisplayDateTime(row.latestReversedAt),
      }))
      .sort(
        (left, right) =>
          `${right.latestReversedAt || ""}`.localeCompare(
            `${left.latestReversedAt || ""}`,
          ) || `${left.station || ""}`.localeCompare(`${right.station || ""}`),
      );
  }, [normalizedTransactions]);

  useEffect(() => {
    if (!selectedStation && stationRows.length > 0) {
      setSelectedStation(stationRows[0].station);
    }
  }, [selectedStation, stationRows]);

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return normalizedTransactions.filter((record) => {
      if (selectedStation && record.station !== selectedStation) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        record.station,
        record.receiptNumber,
        record.itemSummary,
        record.cashierName,
        record.customerName,
        record.customerPhone,
        record.reversedBy,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [normalizedTransactions, searchTerm, selectedStation]);

  const stationPagination = useMemo(
    () => buildPaginatedResult(stationRows, stationPage, PAGE_SIZE),
    [stationPage, stationRows],
  );
  const transactionPagination = useMemo(
    () => buildPaginatedResult(filteredTransactions, transactionPage, PAGE_SIZE),
    [filteredTransactions, transactionPage],
  );
  const summaryCards = useMemo(
    () => buildSummaryCards(normalizedTransactions),
    [normalizedTransactions],
  );
  const selectedStationLabel = selectedStation || "All stations";

  useEffect(() => {
    setStationPage(1);
  }, [stationRows.length]);

  useEffect(() => {
    setTransactionPage(1);
  }, [filteredTransactions.length, selectedStation, searchTerm]);

  return (
    <DashboardPageShell
      title="Reversed Transactions"
      description="Review reversed POS transactions by station and see who reversed them."
      {...shellProps}
    >
      <CompactFilterCard columnsClass="lg:flex-nowrap">
        <div className="min-w-[220px]">
          <CompactFieldLabel htmlFor="reverseTransactionStationFilter">
            station
          </CompactFieldLabel>
          <CompactSelect
            id="reverseTransactionStationFilter"
            value={selectedStation}
            onChange={(event) => setSelectedStation(event.target.value)}
          >
            {stationRows.map((station) => (
              <option key={station.station} value={station.station}>
                {station.station}
              </option>
            ))}
          </CompactSelect>
        </div>
        <div className="min-w-[280px]">
          <CompactFieldLabel htmlFor="reverseTransactionSearch">
            search
          </CompactFieldLabel>
          <CompactInput
            id="reverseTransactionSearch"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search receipt, cashier, customer, station"
          />
        </div>
      </CompactFilterCard>

      <CompactSummaryCards items={summaryCards} fullRow />

      <CompactSplitPanel
        className="gap-6"
        leftSpan="xl:col-span-4"
        rightSpan="xl:col-span-6"
        left={
          <div className="space-y-4">
            <PaginationSummary
              currentPage={stationPagination.currentPage}
              totalItems={stationPagination.totalItems}
              pageSize={PAGE_SIZE}
              label="Stations"
            />
            <DataTable
              columns={stationColumns}
              data={stationPagination.records}
              title="Stations"
              subtitle="Select a station to inspect its reversed POS transactions."
              onRowClick={(row) => setSelectedStation(row.station)}
              selectedRowKey={selectedStation}
              selectedRowField="station"
            />
            <PaginationControls
              currentPage={stationPagination.currentPage}
              totalItems={stationPagination.totalItems}
              pageSize={PAGE_SIZE}
              onPageChange={setStationPage}
            />
          </div>
        }
        right={
          <div className="space-y-4">
            <PaginationSummary
              currentPage={transactionPagination.currentPage}
              totalItems={transactionPagination.totalItems}
              pageSize={PAGE_SIZE}
              label="Transactions"
            />
            <DataTable
              columns={transactionColumns}
              data={transactionPagination.records}
              title={`${selectedStationLabel} Reversed Transactions`}
              subtitle="Latest reversals appear first. Amounts reflect the original sale values that were voided."
            />
            <PaginationControls
              currentPage={transactionPagination.currentPage}
              totalItems={transactionPagination.totalItems}
              pageSize={PAGE_SIZE}
              onPageChange={setTransactionPage}
            />
          </div>
        }
      />
    </DashboardPageShell>
  );
}
