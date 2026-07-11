"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import DataTable from "@/components/dashboard/DataTable";
import DashboardPageShell from "@/features/dashboard/page-shell";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  PAGE_SIZE,
} from "@/features/operations/helpers";
import {
  CompactActionButton,
  CompactFieldLabel,
  CompactFilterCard,
  CompactInput,
  CompactSelect,
  CompactSplitPanel,
  CompactSummaryCards,
  PaginationControls,
  PaginationSummary,
  RemotePaginationControls,
  RemotePaginationSummary,
  TopPerformersCard,
} from "@/features/operations/ui";
import { renderPaymentMethodCell } from "@/features/payments/ui";

function renderCustomerCell(row) {
  const customerName = `${row.customerName || ""}`.trim();
  const customerPhone = `${row.customerPhone || ""}`.trim();

  if (!customerName && !customerPhone) {
    return "—";
  }

  return (
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-slate-900">
        {customerName || "Walk-in Customer"}
      </p>
      {customerPhone ? (
        <p className="text-xs text-slate-500">{customerPhone}</p>
      ) : null}
    </div>
  );
}

function renderTransactionQuantityCell(row) {
  const quantity = Number(row.quantity || 0);

  if (!Number.isFinite(quantity)) {
    return "—";
  }

  if (`${row.category || ""}`.trim().toLowerCase() === "fuel") {
    return quantity.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  return quantity.toLocaleString();
}

function getTransactionColumns(variant) {
  const columns = [
    {
      key: "saleDate",
      label: "Date",
      render: (row) => formatDisplayDateTime(row.saleDate),
    },
    { key: "item", label: "Item" },
    { key: "cashierName", label: "Cashier" },
    { key: "customerName", label: "Customer", render: renderCustomerCell },
    {
      key: "paymentMethod",
      label: "Payment",
      render: renderPaymentMethodCell,
    },
  ];

  columns.push(
    { key: "quantity", label: "Quantity", render: renderTransactionQuantityCell },
    { key: "amount", label: "Amount", format: "currency" },
  );

  return columns;
}

const PAGE_CONFIGS = {
  fuel: {
    stationColumns: [
      { key: "station", label: "Station" },
      { key: "date", label: "Date" },
      { key: "petrolSales", label: "Petrol", format: "currency" },
      { key: "dieselSales", label: "Diesel", format: "currency" },
      { key: "totalAmount", label: "Total Sales", format: "currency" },
    ],
    dayColumns: [
      { key: "date", label: "Date" },
      { key: "petrolSales", label: "Petrol", format: "currency" },
      { key: "dieselSales", label: "Diesel", format: "currency" },
      { key: "totalAmount", label: "Total Sales", format: "currency" },
    ],
  },
  cement: {
    stationColumns: [
      { key: "station", label: "Station" },
      { key: "date", label: "Date" },
      { key: "totalQuantity", label: "Bags Sold", format: "number" },
      { key: "totalAmount", label: "Total Sales", format: "currency" },
    ],
    dayColumns: [
      { key: "date", label: "Date" },
      { key: "totalQuantity", label: "Bags Sold", format: "number" },
      { key: "totalAmount", label: "Total Sales", format: "currency" },
    ],
  },
};

export default function SalesDrilldownPage({
  title,
  description,
  initialOverviewData,
  quantityLabel,
  topCardTitle,
  shellProps,
  fromDate: initialFromDate,
  toDate: initialToDate,
  defaultFromDate,
  defaultToDate,
  variant,
}) {
  const config = PAGE_CONFIGS[variant] || PAGE_CONFIGS.fuel;
  const transactionColumns = getTransactionColumns(variant);
  const getSalesErrorMessage = (error, fallbackMessage) =>
    getUserFacingErrorMessage(error, {
      moduleName: title,
      genericLabel: `load ${title}`,
      fallbackMessage,
    });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const transactionPagesRef = useRef(new Map());
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [overviewRows, setOverviewRows] = useState(
    initialOverviewData?.records || [],
  );
  const [overviewTotalItems, setOverviewTotalItems] = useState(
    Number(initialOverviewData?.totalItems || 0),
  );
  const [overallCards, setOverallCards] = useState(
    initialOverviewData?.summaryCards || [],
  );
  const [topPerformers, setTopPerformers] = useState(
    initialOverviewData?.topPerformers || [],
  );
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedStationId, setSelectedStationId] = useState("");
  const [selectedStationSummary, setSelectedStationSummary] = useState([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedDaySummary, setSelectedDaySummary] = useState([]);
  const [selectedDayRecord, setSelectedDayRecord] = useState(null);
  const [overviewPage, setOverviewPage] = useState(1);
  const [dayPage, setDayPage] = useState(1);
  const [dayRows, setDayRows] = useState([]);
  const [dayTotalItems, setDayTotalItems] = useState(0);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionItemFilter, setTransactionItemFilter] = useState("All");
  const [transactionItemOptions, setTransactionItemOptions] = useState(["All"]);
  const [transactionCashierFilter, setTransactionCashierFilter] =
    useState("All");
  const [transactionCashierOptions, setTransactionCashierOptions] = useState([
    "All",
  ]);
  const [transactions, setTransactions] = useState([]);
  const [transactionHasNextPage, setTransactionHasNextPage] = useState(false);
  const [transactionTotalItems, setTransactionTotalItems] = useState(0);
  const [transactionPageSize, setTransactionPageSize] = useState(20);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [isDayLoading, setIsDayLoading] = useState(false);
  const [isTransactionsLoading, setIsTransactionsLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [dayError, setDayError] = useState("");
  const [transactionsError, setTransactionsError] = useState("");

  useEffect(() => {
    setFromDate(initialFromDate);
    setToDate(initialToDate);
    setOverviewRows(initialOverviewData?.records || []);
    setOverviewTotalItems(Number(initialOverviewData?.totalItems || 0));
    setOverallCards(initialOverviewData?.summaryCards || []);
    setTopPerformers(initialOverviewData?.topPerformers || []);
    setSelectedStation("");
    setSelectedStationId("");
    setSelectedStationSummary([]);
    setSelectedDay("");
    setSelectedDaySummary([]);
    setSelectedDayRecord(null);
    setOverviewPage(1);
    setDayPage(1);
    setDayRows([]);
    setDayTotalItems(0);
    setTransactionItemFilter("All");
    setTransactionItemOptions(["All"]);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
    setOverviewError("");
    setDayError("");
  }, [initialFromDate, initialOverviewData, initialToDate]);

  useEffect(() => {
    if (overviewPage !== 1) {
      return;
    }

    setOverviewRows(initialOverviewData?.records || []);
    setOverviewTotalItems(Number(initialOverviewData?.totalItems || 0));
    setOverallCards(initialOverviewData?.summaryCards || []);
    setTopPerformers(initialOverviewData?.topPerformers || []);
    setOverviewError("");
  }, [initialOverviewData, overviewPage]);

  useEffect(() => {
    if (overviewPage === 1) {
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    async function loadOverviewPage() {
      setIsOverviewLoading(true);
      setOverviewError("");

      try {
        const params = new URLSearchParams({
          type: variant,
          from: fromDate,
          to: toDate,
          page: `${overviewPage}`,
        });
        const response = await fetch(
          `/api/sales/overview?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.message || "Failed to load sales overview.");
        }

        const payload = await response.json();

        if (!isActive) {
          return;
        }

        setOverviewRows(Array.isArray(payload?.records) ? payload.records : []);
        setOverviewTotalItems(Number(payload?.totalItems || 0));
        setOverallCards(
          Array.isArray(payload?.summaryCards) ? payload.summaryCards : [],
        );
        setTopPerformers(
          Array.isArray(payload?.topPerformers) ? payload.topPerformers : [],
        );
      } catch (error) {
        if (!isActive || error?.name === "AbortError") {
          return;
        }

        setOverviewError(
          getSalesErrorMessage(error, "Failed to load sales overview."),
        );
      } finally {
        if (isActive) {
          setIsOverviewLoading(false);
        }
      }
    }

    loadOverviewPage();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [fromDate, overviewPage, toDate, variant]);

  useEffect(() => {
    if (!selectedStationId) {
      setDayRows([]);
      setDayTotalItems(0);
      setSelectedStationSummary([]);
      setDayError("");
      setIsDayLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    async function loadDayPage() {
      setIsDayLoading(true);
      setDayError("");

      try {
        const params = new URLSearchParams({
          type: variant,
          from: fromDate,
          to: toDate,
          stationId: selectedStationId,
          page: `${dayPage}`,
        });
        const response = await fetch(`/api/sales/days?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(
            payload?.message || "Failed to load daily breakdown.",
          );
        }

        const payload = await response.json();

        if (!isActive) {
          return;
        }

        setDayRows(Array.isArray(payload?.records) ? payload.records : []);
        setDayTotalItems(Number(payload?.totalItems || 0));
        setSelectedStationSummary(
          Array.isArray(payload?.summaryCards) ? payload.summaryCards : [],
        );
      } catch (error) {
        if (!isActive || error?.name === "AbortError") {
          return;
        }

        setDayRows([]);
        setDayTotalItems(0);
        setSelectedStationSummary([]);
        setDayError(
          getSalesErrorMessage(error, "Failed to load daily breakdown."),
        );
      } finally {
        if (isActive) {
          setIsDayLoading(false);
        }
      }
    }

    loadDayPage();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [dayPage, fromDate, selectedStationId, toDate, variant]);

  useEffect(() => {
    if (!selectedStationId || !selectedDay) {
      resetTransactionPagination();
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    async function loadTransactions() {
      setIsTransactionsLoading(true);
      setTransactionsError("");
      transactionPagesRef.current = new Map();

      try {
        const payload = await requestTransactionsPage({
          signal: controller.signal,
        });

        if (!isActive) {
          return;
        }

        const pageEntry = {
          records: payload.records,
          nextCursor: payload.nextCursor,
          hasNextPage: Boolean(payload.hasMore),
        };

        transactionPagesRef.current.set(1, pageEntry);
        setTransactions(pageEntry.records);
        setTransactionHasNextPage(pageEntry.hasNextPage);
        setTransactionTotalItems(Number(payload.totalItems || 0));
        setTransactionPageSize(Number(payload.pageSize || 20));
        setTransactionItemOptions(
          buildSelectOptions(payload.itemOptions, pageEntry.records, "item"),
        );
        setTransactionCashierOptions(
          buildSelectOptions(
            payload.cashierOptions,
            pageEntry.records,
            "cashierName",
          ),
        );
      } catch (error) {
        if (!isActive || error?.name === "AbortError") {
          return;
        }

        resetTransactionPagination();
        setTransactionsError(
          getSalesErrorMessage(error, "Failed to load transactions."),
        );
      } finally {
        if (isActive) {
          setIsTransactionsLoading(false);
        }
      }
    }

    loadTransactions();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [
    selectedDay,
    selectedStationId,
    transactionCashierFilter,
    transactionItemFilter,
    variant,
  ]);

  const isDefaultRange =
    fromDate === defaultFromDate && toDate === defaultToDate;

  const view = selectedDay
    ? "transactions"
    : selectedStation
      ? "days"
      : "stations";

  function resetFilters() {
    setFromDate(defaultFromDate);
    setToDate(defaultToDate);
    setSelectedStation("");
    setSelectedStationId("");
    setSelectedStationSummary([]);
    setSelectedDay("");
    setSelectedDaySummary([]);
    setSelectedDayRecord(null);
    setOverviewPage(1);
    setDayPage(1);
    setDayRows([]);
    setDayTotalItems(0);
    setTransactionItemFilter("All");
    setTransactionItemOptions(["All"]);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
    navigateToRange(defaultFromDate, defaultToDate, { useDefaultRange: true });
  }

  function handleStationSelect(row) {
    setSelectedStation(row.station || row.label || "");
    setSelectedStationId(row.stationId || "");
    setSelectedStationSummary([]);
    setSelectedDay("");
    setSelectedDaySummary([]);
    setSelectedDayRecord(null);
    setDayPage(1);
    setTransactionItemFilter("All");
    setTransactionItemOptions(["All"]);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
  }

  function handleTopStationSelect(item) {
    handleStationSelect({
      station: item?.label || "",
      stationId: item?.stationId || "",
    });
  }

  function handleDaySelect(row) {
    setSelectedDay(row.date || "");
    setSelectedDayRecord(row);
    setSelectedDaySummary(buildDaySummaryCards(variant, row));
    setTransactionItemFilter("All");
    setTransactionItemOptions(["All"]);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
  }

  function handleBack() {
    if (view === "transactions") {
      setSelectedDay("");
      setSelectedDaySummary([]);
      setSelectedDayRecord(null);
      setTransactionItemFilter("All");
      setTransactionItemOptions(["All"]);
      setTransactionCashierFilter("All");
      setTransactionCashierOptions(["All"]);
      resetTransactionPagination();
      return;
    }

    setSelectedStation("");
    setSelectedStationId("");
    setSelectedStationSummary([]);
    setSelectedDay("");
    setSelectedDaySummary([]);
    setSelectedDayRecord(null);
    setDayPage(1);
    setDayRows([]);
    setDayTotalItems(0);
    setTransactionItemFilter("All");
    setTransactionItemOptions(["All"]);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
  }

  async function requestTransactionsPage({ cursor = "", signal } = {}) {
    const params = new URLSearchParams({
      type: variant,
      stationId: selectedStationId,
      date: selectedDay,
    });

    if (variant === "fuel" && transactionItemFilter !== "All") {
      params.set("item", transactionItemFilter);
    }

    if (transactionCashierFilter !== "All") {
      params.set("cashier", transactionCashierFilter);
    }

    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(
      `/api/sales/transactions?${params.toString()}`,
      {
        method: "GET",
        cache: "no-store",
        signal,
      },
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || "Failed to load transactions.");
    }

    const payload = await response.json();

    return {
      records: Array.isArray(payload?.records) ? payload.records : [],
      nextCursor: `${payload?.nextCursor || ""}`,
      hasMore: Boolean(payload?.hasMore),
      totalItems:
        typeof payload?.totalItems === "number" ? payload.totalItems : null,
      pageSize: Number(payload?.pageSize || 20),
      itemOptions: Array.isArray(payload?.itemOptions)
        ? payload.itemOptions
        : null,
      cashierOptions: Array.isArray(payload?.cashierOptions)
        ? payload.cashierOptions
        : null,
    };
  }

  async function handleNextTransactionPage() {
    const currentPageEntry = transactionPagesRef.current.get(transactionPage);

    if (!currentPageEntry?.hasNextPage || !currentPageEntry?.nextCursor) {
      return;
    }

    const nextPage = transactionPage + 1;
    const cachedPage = transactionPagesRef.current.get(nextPage);

    if (cachedPage) {
      setTransactionPage(nextPage);
      setTransactions(cachedPage.records);
      setTransactionHasNextPage(cachedPage.hasNextPage);
      return;
    }

    setIsTransactionsLoading(true);
    setTransactionsError("");

    try {
      const payload = await requestTransactionsPage({
        cursor: currentPageEntry.nextCursor,
      });
      const nextPageEntry = {
        records: payload.records,
        nextCursor: payload.nextCursor,
        hasNextPage: Boolean(payload.hasMore),
      };

      transactionPagesRef.current.set(nextPage, nextPageEntry);
      setTransactionPage(nextPage);
      setTransactions(nextPageEntry.records);
      setTransactionHasNextPage(nextPageEntry.hasNextPage);
    } catch (error) {
      setTransactionsError(
        getSalesErrorMessage(error, "Failed to load transactions."),
      );
    } finally {
      setIsTransactionsLoading(false);
    }
  }

  function handlePreviousTransactionPage() {
    if (transactionPage === 1) {
      return;
    }

    const previousPage = transactionPage - 1;
    const cachedPage = transactionPagesRef.current.get(previousPage);

    if (!cachedPage) {
      return;
    }

    setTransactionPage(previousPage);
    setTransactions(cachedPage.records);
    setTransactionHasNextPage(cachedPage.hasNextPage);
  }

  function resetTransactionPagination() {
    transactionPagesRef.current = new Map();
    setTransactionPage(1);
    setTransactions([]);
    setTransactionHasNextPage(false);
    setTransactionTotalItems(0);
    setTransactionPageSize(20);
    setTransactionItemOptions(["All"]);
    setTransactionCashierOptions(["All"]);
    setIsTransactionsLoading(false);
    setTransactionsError("");
  }

  function navigateToRange(nextFromDate, nextToDate, options = {}) {
    const params = new URLSearchParams(searchParams?.toString() || "");

    if (options.useDefaultRange) {
      params.delete("from");
      params.delete("to");
    } else {
      params.set("from", nextFromDate);
      params.set("to", nextToDate);
    }

    const queryString = params.toString();
    const nextHref = queryString ? `${pathname}?${queryString}` : pathname;

    startTransition(() => {
      router.replace(nextHref, { scroll: false });
    });
  }

  return (
    <DashboardPageShell title={title} description={description} {...shellProps}>
      <CompactFilterCard
        helperText={`From: ${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}.`}
        actions={
          <CompactActionButton
            onClick={resetFilters}
            disabled={isDefaultRange || isPending}
          >
            {isPending
              ? "Updating range..."
              : isDefaultRange
                ? "Showing last 7 days"
                : "Reset to last 7 days"}
          </CompactActionButton>
        }
      >
        <div>
          <CompactFieldLabel>from</CompactFieldLabel>
          <CompactInput
            type="date"
            value={fromDate}
            onChange={(event) => {
              const nextFromDate = event.target.value;
              setFromDate(nextFromDate);
              setSelectedStation("");
              setSelectedStationId("");
              setSelectedStationSummary([]);
              setSelectedDay("");
              setSelectedDaySummary([]);
              setSelectedDayRecord(null);
              setOverviewPage(1);
              setDayPage(1);
              setDayRows([]);
              setDayTotalItems(0);
              resetTransactionPagination();
              navigateToRange(nextFromDate, toDate);
            }}
            disabled={isPending}
          />
        </div>
        <div>
          <CompactFieldLabel>to</CompactFieldLabel>
          <CompactInput
            type="date"
            value={toDate}
            onChange={(event) => {
              const nextToDate = event.target.value;
              setToDate(nextToDate);
              setSelectedStation("");
              setSelectedStationId("");
              setSelectedStationSummary([]);
              setSelectedDay("");
              setSelectedDaySummary([]);
              setSelectedDayRecord(null);
              setOverviewPage(1);
              setDayPage(1);
              setDayRows([]);
              setDayTotalItems(0);
              resetTransactionPagination();
              navigateToRange(fromDate, nextToDate);
            }}
            disabled={isPending}
          />
        </div>
      </CompactFilterCard>

      {view === "stations" ? (
        <div className="space-y-6">
          <CompactSummaryCards items={overallCards} fullRow />
          <CompactSplitPanel
            className="gap-6"
            left={
              <div className="space-y-4">
                <PaginationSummary
                  currentPage={overviewPage}
                  totalItems={overviewTotalItems}
                  pageSize={PAGE_SIZE}
                  label="Stations"
                />
                <DataTable
                  columns={config.stationColumns}
                  data={overviewRows}
                  title={`${title} by Station`}
                  subtitle="Review station-level totals and drill into the latest daily activity."
                  onRowClick={handleStationSelect}
                  loading={isOverviewLoading}
                  loadingMessage="Loading sales overview..."
                />
                {!isOverviewLoading && overviewError ? (
                  <p className="text-sm text-rose-600">{overviewError}</p>
                ) : null}
                <PaginationControls
                  currentPage={overviewPage}
                  totalItems={overviewTotalItems}
                  pageSize={PAGE_SIZE}
                  onPageChange={setOverviewPage}
                />
              </div>
            }
            right={
              <TopPerformersCard
                title={topCardTitle}
                items={topPerformers}
                onSelect={handleTopStationSelect}
                itemLabel={variant === "cement" ? "Cement sales" : "Fuel sales"}
              />
            }
            leftSpan="xl:col-span-8"
            rightSpan="xl:col-span-2"
          />
        </div>
      ) : null}

      {view === "days" ? (
        <div className="space-y-6">
          <CompactSummaryCards items={selectedStationSummary} fullRow />
          <PaginationSummary
            currentPage={dayPage}
            totalItems={dayTotalItems}
            pageSize={PAGE_SIZE}
            label="Daily records"
            actions={
              <CompactActionButton onClick={handleBack}>
                ← Back to stations
              </CompactActionButton>
            }
          />
          <DataTable
            columns={config.dayColumns}
            data={dayRows}
            title={`${selectedStation} Daily Breakdown`}
            subtitle={`Review daily ${title.toLowerCase()} totals for ${selectedStation}.`}
            onRowClick={handleDaySelect}
            loading={isDayLoading}
            loadingMessage="Loading daily breakdown..."
          />
          {!isDayLoading && dayError ? (
            <p className="text-sm text-rose-600">{dayError}</p>
          ) : null}
          <PaginationControls
            currentPage={dayPage}
            totalItems={dayTotalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setDayPage}
          />
        </div>
      ) : null}

      {view === "transactions" ? (
        <div className="space-y-6">
          <CompactSummaryCards items={selectedDaySummary} fullRow />
          <RemotePaginationSummary
            actions={
              <CompactActionButton onClick={handleBack}>
                ← Back to daily breakdown
              </CompactActionButton>
            }
          />
          <DataTable
            columns={transactionColumns}
            data={transactions}
            title={`${selectedStation} Transactions`}
            subtitle={`Individual transaction lines for ${selectedDayRecord?.date || selectedDay}.`}
            headerContent={
              <div className="flex flex-wrap items-end gap-3 lg:justify-center">
                {variant === "fuel" ? (
                  <div className="min-w-[150px]">
                    <CompactFieldLabel>item</CompactFieldLabel>
                    <CompactSelect
                      value={transactionItemFilter}
                      onChange={(event) => {
                        setTransactionItemFilter(event.target.value);
                        setTransactionCashierFilter("All");
                        setTransactionPage(1);
                      }}
                    >
                      {transactionItemOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </CompactSelect>
                  </div>
                ) : null}
                <div className="min-w-[150px]">
                  <CompactFieldLabel>cashier</CompactFieldLabel>
                  <CompactSelect
                    value={transactionCashierFilter}
                    onChange={(event) => {
                      setTransactionCashierFilter(event.target.value);
                      setTransactionPage(1);
                    }}
                  >
                    {transactionCashierOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </CompactSelect>
                </div>
              </div>
            }
            loading={isTransactionsLoading}
            loadingMessage="Loading latest transactions..."
          />
          {!isTransactionsLoading && transactionsError ? (
            <p className="text-sm text-rose-600">{transactionsError}</p>
          ) : null}
          <RemotePaginationControls
            currentPage={transactionPage}
            hasPreviousPage={transactionPage > 1}
            hasNextPage={transactionHasNextPage}
            onPreviousPage={handlePreviousTransactionPage}
            onNextPage={handleNextTransactionPage}
            isLoading={isTransactionsLoading}
            totalItems={transactionTotalItems}
            pageSize={transactionPageSize}
            label="transactions"
          />
        </div>
      ) : null}
    </DashboardPageShell>
  );
}

function buildSelectOptions(explicitOptions, records, key) {
  if (Array.isArray(explicitOptions) && explicitOptions.length > 0) {
    return Array.from(new Set(explicitOptions.filter(Boolean)));
  }

  return [
    "All",
    ...new Set(
      (Array.isArray(records) ? records : [])
        .map((record) => record[key])
        .filter(Boolean),
    ),
  ];
}

function buildDaySummaryCards(variant, row) {
  if (!row) {
    return [];
  }

  if (variant === "cement") {
    const totalAmount = Number(row.totalAmount || 0);
    const totalQuantity = Number(row.totalQuantity || 0);
    const averagePerBag = totalQuantity > 0 ? totalAmount / totalQuantity : 0;

    return [
      {
        title: "Total Sales",
        value: `D${totalAmount.toLocaleString()}`,
        icon: "💰",
      },
      { title: "Bags Sold", value: totalQuantity.toLocaleString(), icon: "🏗️" },
      {
        title: "Avg / Bag",
        value: `D${averagePerBag.toLocaleString()}`,
        icon: "📏",
      },
    ];
  }

  return [
    {
      title: "Total Sales",
      value: `D${Number(row.totalAmount || 0).toLocaleString()}`,
      icon: "💰",
    },
    {
      title: "Petrol",
      value: `D${Number(row.petrolSales || 0).toLocaleString()}`,
      icon: "⛽",
    },
    {
      title: "Diesel",
      value: `D${Number(row.dieselSales || 0).toLocaleString()}`,
      icon: "🚚",
    },
  ];
}
