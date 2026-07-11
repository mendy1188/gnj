"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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

const stationColumns = [
  { key: "station", label: "Station" },
  { key: "date", label: "Date" },
  { key: "fuel", label: "Fuel Sales", format: "currency" },
  { key: "shop", label: "Shop Sales", format: "currency" },
  { key: "cement", label: "Cement Sales", format: "currency" },
  { key: "total", label: "Total Sales", format: "currency" },
];

const dailyColumns = [
  { key: "date", label: "Date" },
  { key: "fuel", label: "Fuel", format: "currency" },
  { key: "shop", label: "Shop", format: "currency" },
  { key: "cement", label: "Cement", format: "currency" },
  { key: "total", label: "Total", format: "currency" },
  { key: "transactions", label: "Transactions" },
];

function getStationsErrorMessage(error, fallbackMessage) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Stations",
    genericLabel: "load station data",
    fallbackMessage,
  });
}

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

const transactionColumns = [
  {
    key: "saleDate",
    label: "Date",
    render: (row) => formatDisplayDateTime(row.saleDate),
  },
  { key: "category", label: "Category" },
  { key: "item", label: "Item" },
  { key: "cashierName", label: "Cashier" },
  { key: "customerName", label: "Customer", render: renderCustomerCell },
  { key: "paymentMethod", label: "Payment", render: renderPaymentMethodCell },
  { key: "quantity", label: "Quantity", render: renderTransactionQuantityCell },
  { key: "amount", label: "Amount", format: "currency" },
];

const TRANSACTION_CATEGORY_OPTIONS = ["All", "Fuel", "Shop", "Cement"];

export default function StationsPageClient({
  initialStationData,
  shellProps,
  fromDate: initialFromDate,
  toDate: initialToDate,
  defaultFromDate,
  defaultToDate,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const transactionPagesRef = useRef(new Map());
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [stationRows, setStationRows] = useState(
    initialStationData?.records || [],
  );
  const [stationTotalItems, setStationTotalItems] = useState(
    Number(initialStationData?.totalItems || 0),
  );
  const [topStations, setTopStations] = useState(
    initialStationData?.topStations || [],
  );
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedStationId, setSelectedStationId] = useState("");
  const [selectedStationSummary, setSelectedStationSummary] = useState([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedDaySummary, setSelectedDaySummary] = useState([]);
  const [selectedDayRecord, setSelectedDayRecord] = useState(null);
  const [stationPage, setStationPage] = useState(1);
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyRows, setDailyRows] = useState([]);
  const [dailyTotalItems, setDailyTotalItems] = useState(0);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionCategoryFilter, setTransactionCategoryFilter] =
    useState("All");
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
  const [isStationLoading, setIsStationLoading] = useState(false);
  const [isDailyLoading, setIsDailyLoading] = useState(false);
  const [isTransactionsLoading, setIsTransactionsLoading] = useState(false);
  const [stationError, setStationError] = useState("");
  const [dailyError, setDailyError] = useState("");
  const [transactionsError, setTransactionsError] = useState("");

  useEffect(() => {
    setFromDate(initialFromDate);
    setToDate(initialToDate);
    setStationRows(initialStationData?.records || []);
    setStationTotalItems(Number(initialStationData?.totalItems || 0));
    setTopStations(initialStationData?.topStations || []);
    setSelectedStation("");
    setSelectedStationId("");
    setSelectedStationSummary([]);
    setSelectedDay("");
    setSelectedDaySummary([]);
    setSelectedDayRecord(null);
    setStationPage(1);
    setDailyPage(1);
    setDailyRows([]);
    setDailyTotalItems(0);
    setTransactionCategoryFilter("All");
    setTransactionItemFilter("All");
    setTransactionItemOptions(["All"]);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
    setStationError("");
    setDailyError("");
  }, [initialFromDate, initialStationData, initialToDate]);

  useEffect(() => {
    if (stationPage !== 1) {
      return;
    }

    setStationRows(initialStationData?.records || []);
    setStationTotalItems(Number(initialStationData?.totalItems || 0));
    setTopStations(initialStationData?.topStations || []);
    setStationError("");
  }, [initialStationData, stationPage]);

  useEffect(() => {
    if (stationPage === 1) {
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    async function loadStationOverview() {
      setIsStationLoading(true);
      setStationError("");

      try {
        const params = new URLSearchParams({
          from: fromDate,
          to: toDate,
          page: `${stationPage}`,
        });
        const response = await fetch(
          `/api/stations/overview?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(
            payload?.message || "Failed to load station performance.",
          );
        }

        const payload = await response.json();

        if (!isActive) {
          return;
        }

        setStationRows(Array.isArray(payload?.records) ? payload.records : []);
        setStationTotalItems(Number(payload?.totalItems || 0));
        setTopStations(
          Array.isArray(payload?.topStations) ? payload.topStations : [],
        );
      } catch (error) {
        if (!isActive || error?.name === "AbortError") {
          return;
        }

        setStationError(
          getStationsErrorMessage(error, "Failed to load station performance."),
        );
      } finally {
        if (isActive) {
          setIsStationLoading(false);
        }
      }
    }

    loadStationOverview();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [fromDate, stationPage, toDate]);

  useEffect(() => {
    if (!selectedStationId) {
      setDailyRows([]);
      setDailyTotalItems(0);
      setSelectedStationSummary([]);
      setDailyError("");
      setIsDailyLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    async function loadDailyBreakdown() {
      setIsDailyLoading(true);
      setDailyError("");

      try {
        const params = new URLSearchParams({
          from: fromDate,
          to: toDate,
          stationId: selectedStationId,
          page: `${dailyPage}`,
        });
        const response = await fetch(
          `/api/stations/days?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

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

        setDailyRows(Array.isArray(payload?.records) ? payload.records : []);
        setDailyTotalItems(Number(payload?.totalItems || 0));
        setSelectedStationSummary(
          Array.isArray(payload?.summaryCards) ? payload.summaryCards : [],
        );
      } catch (error) {
        if (!isActive || error?.name === "AbortError") {
          return;
        }

        setDailyRows([]);
        setDailyTotalItems(0);
        setSelectedStationSummary([]);
        setDailyError(
          getStationsErrorMessage(error, "Failed to load daily breakdown."),
        );
      } finally {
        if (isActive) {
          setIsDailyLoading(false);
        }
      }
    }

    loadDailyBreakdown();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [dailyPage, fromDate, selectedStationId, toDate]);

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
          getStationsErrorMessage(error, "Failed to load transactions."),
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
    transactionCategoryFilter,
    transactionItemFilter,
    transactionCashierFilter,
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
    setStationPage(1);
    setDailyPage(1);
    setDailyRows([]);
    setDailyTotalItems(0);
    setTransactionCategoryFilter("All");
    setTransactionItemFilter("All");
    setTransactionItemOptions(["All"]);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
    navigateToRange(defaultFromDate, defaultToDate, { useDefaultRange: true });
  }

  function handleStationSelect(row) {
    setSelectedStation(row.station || "");
    setSelectedStationId(row.stationId || "");
    setSelectedStationSummary([]);
    setSelectedDay("");
    setSelectedDaySummary([]);
    setSelectedDayRecord(null);
    setDailyPage(1);
    setTransactionCategoryFilter("All");
    setTransactionItemFilter("All");
    setTransactionItemOptions(["All"]);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
  }

  function handleTopStationSelect(station) {
    handleStationSelect({
      station: station.label,
      stationId: station.stationId || "",
    });
  }

  function handleDaySelect(row) {
    setSelectedDay(row.date || "");
    setSelectedDayRecord(row);
    setSelectedDaySummary(buildDaySummaryCards(row));
    setTransactionPage(1);
    setTransactionCategoryFilter("All");
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
      setTransactionPage(1);
      setTransactionCategoryFilter("All");
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
    setDailyPage(1);
    setDailyRows([]);
    setDailyTotalItems(0);
    setTransactionPage(1);
    setTransactionCategoryFilter("All");
    setTransactionItemFilter("All");
    setTransactionItemOptions(["All"]);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
  }

  async function requestTransactionsPage({ cursor = "", signal } = {}) {
    const params = new URLSearchParams({
      stationId: selectedStationId,
      date: selectedDay,
    });

    if (transactionCategoryFilter !== "All") {
      params.set("category", transactionCategoryFilter.toLowerCase());
    }

    if (transactionItemFilter !== "All") {
      params.set("item", transactionItemFilter);
    }

    if (transactionCashierFilter !== "All") {
      params.set("cashier", transactionCashierFilter);
    }

    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(
      `/api/stations/transactions?${params.toString()}`,
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
        getStationsErrorMessage(error, "Failed to load transactions."),
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

  function renderStationsLayer() {
    return (
      <CompactSplitPanel
        className="gap-6"
        left={
          <div className="space-y-4">
            <PaginationSummary
              currentPage={stationPage}
              totalItems={stationTotalItems}
              pageSize={PAGE_SIZE}
              label="Stations"
            />
            <DataTable
              columns={stationColumns}
              data={stationRows}
              title="Station Performance"
              onRowClick={handleStationSelect}
              loading={isStationLoading}
              loadingMessage="Loading station performance..."
            />
            {!isStationLoading && stationError ? (
              <p className="text-sm text-rose-600">{stationError}</p>
            ) : null}
            <PaginationControls
              currentPage={stationPage}
              totalItems={stationTotalItems}
              pageSize={PAGE_SIZE}
              onPageChange={setStationPage}
            />
          </div>
        }
        right={
          <TopPerformersCard
            title="Top 3 Stations"
            items={topStations}
            onSelect={handleTopStationSelect}
            itemLabel="Total station performance"
          />
        }
        leftSpan="xl:col-span-8"
        rightSpan="xl:col-span-2"
      />
    );
  }

  function renderDaysLayer() {
    const hasDailyRecords = dailyTotalItems > 0;
    const dailyStartItem = hasDailyRecords
      ? (dailyPage - 1) * PAGE_SIZE + 1
      : 0;
    const dailyEndItem = hasDailyRecords
      ? Math.min(dailyPage * PAGE_SIZE, dailyTotalItems)
      : 0;

    return (
      <div className="space-y-6">
        <CompactSummaryCards items={selectedStationSummary} fullRow />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {hasDailyRecords
              ? `Showing ${dailyStartItem}–${dailyEndItem} of ${dailyTotalItems} daily records`
              : "No daily records available."}
          </div>
          <div className="flex justify-start sm:justify-end">
            <CompactActionButton onClick={handleBack}>
              ← Back to stations
            </CompactActionButton>
          </div>
        </div>
        <DataTable
          columns={dailyColumns}
          data={dailyRows}
          title={`${selectedStation} Daily Breakdown`}
          subtitle="Review daily totals and drill into each day’s individual transactions."
          onRowClick={handleDaySelect}
          loading={isDailyLoading}
          loadingMessage="Loading daily breakdown..."
        />
        {!isDailyLoading && dailyError ? (
          <p className="text-sm text-rose-600">{dailyError}</p>
        ) : null}
        <PaginationControls
          currentPage={dailyPage}
          totalItems={dailyTotalItems}
          pageSize={PAGE_SIZE}
          onPageChange={setDailyPage}
        />
      </div>
    );
  }

  function renderTransactionsLayer() {
    return (
      <div className="space-y-6">
        <CompactSummaryCards
          items={selectedDaySummary}
          fullRow
          columnsClass="grid-cols-3"
          cardClassName="px-3 py-3.5"
          titleClassName="text-[10px]"
          valueClassName="text-sm"
          iconClassName="text-base"
          gapClassName="gap-4"
        />
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
              <div className="min-w-[130px]">
                <CompactFieldLabel>category</CompactFieldLabel>
                <CompactSelect
                  value={transactionCategoryFilter}
                  onChange={(event) => {
                    setTransactionCategoryFilter(event.target.value);
                    setTransactionItemFilter("All");
                    setTransactionCashierFilter("All");
                    setTransactionPage(1);
                  }}
                >
                  {TRANSACTION_CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </CompactSelect>
              </div>
              <div className="min-w-[150px]">
                <CompactFieldLabel>item</CompactFieldLabel>
                <CompactSelect
                  value={transactionItemFilter}
                  onChange={(event) => {
                    setTransactionItemFilter(event.target.value);
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
    );
  }

  return (
    <DashboardPageShell
      title="Stations"
      description="Compare stations by sales, drill into daily activity, and inspect individual transactions."
      {...shellProps}
    >
      <CompactFilterCard
        columnsClass="md:grid-cols-2"
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
              setStationPage(1);
              setDailyPage(1);
              setDailyRows([]);
              setDailyTotalItems(0);
              setTransactionCategoryFilter("All");
              setTransactionItemFilter("All");
              setTransactionItemOptions(["All"]);
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
              setStationPage(1);
              setDailyPage(1);
              setDailyRows([]);
              setDailyTotalItems(0);
              setTransactionCategoryFilter("All");
              setTransactionItemFilter("All");
              setTransactionItemOptions(["All"]);
              resetTransactionPagination();
              navigateToRange(fromDate, nextToDate);
            }}
            disabled={isPending}
          />
        </div>
      </CompactFilterCard>

      {view === "stations" ? renderStationsLayer() : null}
      {view === "days" ? renderDaysLayer() : null}
      {view === "transactions" ? renderTransactionsLayer() : null}
    </DashboardPageShell>
  );
}

function buildDaySummaryCards(row) {
  if (!row) {
    return [];
  }

  return [
    {
      title: "Total Sales",
      value: `D${Number(row.total || 0).toLocaleString()}`,
      icon: "💰",
    },
    {
      title: "Transactions",
      value: Number(row.transactions || 0).toLocaleString(),
      icon: "🧾",
    },
    {
      title: "Best Category",
      value: resolveBestCategory(row),
      icon: "🏆",
    },
  ];
}

function resolveBestCategory(row) {
  const categories = [
    { label: "Fuel", value: Number(row.fuel || 0) },
    { label: "Shop", value: Number(row.shop || 0) },
    { label: "Cement", value: Number(row.cement || 0) },
  ].sort((left, right) => right.value - left.value);

  return `${categories[0]?.label || "None"} · D${Number(
    categories[0]?.value || 0,
  ).toLocaleString()}`;
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
