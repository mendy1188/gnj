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

function getCommoditySalesErrorMessage(error, fallbackMessage) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Commodity Sales",
    genericLabel: "load commodity sales data",
    fallbackMessage,
  });
}

const stationColumns = [
  { key: "station", label: "Station" },
  { key: "date", label: "Date" },
  { key: "riceSales", label: "Rice", format: "currency" },
  { key: "cookingOilSales", label: "Cooking Oil", format: "currency" },
  { key: "otherSales", label: "Others", format: "currency" },
  { key: "totalAmount", label: "Total Sales", format: "currency" },
];

const itemColumns = [
  { key: "item", label: "Commodity" },
  { key: "type", label: "Category" },
  { key: "totalQuantity", label: "Quantity", format: "number" },
  { key: "totalAmount", label: "Amount", format: "currency" },
  { key: "transactions", label: "Transactions" },
];

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
  {
    key: "paymentMethod",
    label: "Payment",
    render: renderPaymentMethodCell,
  },
  { key: "quantity", label: "Quantity" },
  { key: "amount", label: "Amount", format: "currency" },
];

export default function CommoditySalesPageClient({
  initialOverviewData,
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
  const [stationFilter, setStationFilter] = useState("All");
  const [stationOptions, setStationOptions] = useState(
    initialOverviewData?.stationOptions || ["All"],
  );
  const [overviewRows, setOverviewRows] = useState(
    initialOverviewData?.records || [],
  );
  const [overviewTotalItems, setOverviewTotalItems] = useState(
    Number(initialOverviewData?.totalItems || 0),
  );
  const [overallCards, setOverallCards] = useState(
    initialOverviewData?.summaryCards || [],
  );
  const [topStations, setTopStations] = useState(
    initialOverviewData?.topStations || [],
  );
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedStationId, setSelectedStationId] = useState("");
  const [selectedStationSummary, setSelectedStationSummary] = useState([]);
  const [selectedItem, setSelectedItem] = useState("");
  const [selectedItemSummary, setSelectedItemSummary] = useState([]);
  const [overviewPage, setOverviewPage] = useState(1);
  const [itemPage, setItemPage] = useState(1);
  const [stationItems, setStationItems] = useState([]);
  const [stationItemsTotal, setStationItemsTotal] = useState(0);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionCashierFilter, setTransactionCashierFilter] =
    useState("All");
  const [transactionCashierOptions, setTransactionCashierOptions] = useState([
    "All",
  ]);
  const [itemTransactions, setItemTransactions] = useState([]);
  const [transactionHasNextPage, setTransactionHasNextPage] = useState(false);
  const [transactionTotalItems, setTransactionTotalItems] = useState(0);
  const [transactionPageSize, setTransactionPageSize] = useState(20);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [isItemsLoading, setIsItemsLoading] = useState(false);
  const [isTransactionsLoading, setIsTransactionsLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [itemsError, setItemsError] = useState("");
  const [transactionsError, setTransactionsError] = useState("");

  useEffect(() => {
    setFromDate(initialFromDate);
    setToDate(initialToDate);
    setStationFilter("All");
    setStationOptions(initialOverviewData?.stationOptions || ["All"]);
    setOverviewRows(initialOverviewData?.records || []);
    setOverviewTotalItems(Number(initialOverviewData?.totalItems || 0));
    setOverallCards(initialOverviewData?.summaryCards || []);
    setTopStations(initialOverviewData?.topStations || []);
    setSelectedStation("");
    setSelectedStationId("");
    setSelectedStationSummary([]);
    setSelectedItem("");
    setSelectedItemSummary([]);
    setOverviewPage(1);
    setItemPage(1);
    setStationItems([]);
    setStationItemsTotal(0);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
    setOverviewError("");
    setItemsError("");
  }, [initialFromDate, initialOverviewData, initialToDate]);

  useEffect(() => {
    if (overviewPage !== 1 || stationFilter !== "All") {
      return;
    }

    setStationOptions(initialOverviewData?.stationOptions || ["All"]);
    setOverviewRows(initialOverviewData?.records || []);
    setOverviewTotalItems(Number(initialOverviewData?.totalItems || 0));
    setOverallCards(initialOverviewData?.summaryCards || []);
    setTopStations(initialOverviewData?.topStations || []);
    setOverviewError("");
  }, [initialOverviewData, overviewPage, stationFilter]);

  useEffect(() => {
    if (overviewPage === 1 && stationFilter === "All") {
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    async function loadOverviewPage() {
      setIsOverviewLoading(true);
      setOverviewError("");

      try {
        const params = new URLSearchParams({
          from: fromDate,
          to: toDate,
          station: stationFilter,
          page: `${overviewPage}`,
        });
        const response = await fetch(
          `/api/commodities-sales/overview?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(
            payload?.message || "Failed to load station summary.",
          );
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
        setTopStations(
          Array.isArray(payload?.topStations) ? payload.topStations : [],
        );
        setStationOptions(
          Array.isArray(payload?.stationOptions)
            ? payload.stationOptions
            : ["All"],
        );
      } catch (error) {
        if (!isActive || error?.name === "AbortError") {
          return;
        }

        setOverviewError(
          getCommoditySalesErrorMessage(error, "Failed to load station summary."),
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
  }, [fromDate, overviewPage, stationFilter, toDate]);

  useEffect(() => {
    if (!selectedStationId) {
      setStationItems([]);
      setStationItemsTotal(0);
      setSelectedStationSummary([]);
      setItemsError("");
      setIsItemsLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    async function loadItems() {
      setIsItemsLoading(true);
      setItemsError("");

      try {
        const params = new URLSearchParams({
          stationId: selectedStationId,
          from: fromDate,
          to: toDate,
          page: `${itemPage}`,
        });
        const response = await fetch(
          `/api/commodities-sales/items?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.message || "Failed to load item breakdown.");
        }

        const payload = await response.json();

        if (!isActive) {
          return;
        }

        setStationItems(Array.isArray(payload?.records) ? payload.records : []);
        setStationItemsTotal(Number(payload?.totalItems || 0));
        setSelectedStationSummary(
          Array.isArray(payload?.summaryCards) ? payload.summaryCards : [],
        );
      } catch (error) {
        if (!isActive || error?.name === "AbortError") {
          return;
        }

        setStationItems([]);
        setStationItemsTotal(0);
        setSelectedStationSummary([]);
        setItemsError(
          getCommoditySalesErrorMessage(error, "Failed to load item breakdown."),
        );
      } finally {
        if (isActive) {
          setIsItemsLoading(false);
        }
      }
    }

    loadItems();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [fromDate, itemPage, selectedStationId, toDate]);

  useEffect(() => {
    if (!selectedStationId || !selectedItem) {
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
        setItemTransactions(pageEntry.records);
        setTransactionHasNextPage(pageEntry.hasNextPage);
        setTransactionTotalItems(Number(payload.totalItems || 0));
        setTransactionPageSize(Number(payload.pageSize || 20));
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
          getCommoditySalesErrorMessage(error, "Failed to load transactions."),
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
    fromDate,
    selectedItem,
    selectedStationId,
    toDate,
    transactionCashierFilter,
  ]);

  const isDefaultRange =
    fromDate === defaultFromDate && toDate === defaultToDate;

  const view = selectedItem
    ? "transactions"
    : selectedStation
      ? "items"
      : "stations";

  function resetFilters() {
    setFromDate(defaultFromDate);
    setToDate(defaultToDate);
    setStationFilter("All");
    setSelectedStation("");
    setSelectedStationId("");
    setSelectedStationSummary([]);
    setSelectedItem("");
    setSelectedItemSummary([]);
    setOverviewPage(1);
    setItemPage(1);
    setStationItems([]);
    setStationItemsTotal(0);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
    navigateToRange(defaultFromDate, defaultToDate, { useDefaultRange: true });
  }

  function handleStationSelect(row) {
    setSelectedStation(row.station || row.label || "");
    setSelectedStationId(row.stationId || "");
    setSelectedStationSummary([]);
    setSelectedItem("");
    setSelectedItemSummary([]);
    setItemPage(1);
    setStationItems([]);
    setStationItemsTotal(0);
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

  function handleBack() {
    if (view === "transactions") {
      setSelectedItem("");
      setSelectedItemSummary([]);
      setTransactionCashierFilter("All");
      setTransactionCashierOptions(["All"]);
      resetTransactionPagination();
      return;
    }

    setSelectedStation("");
    setSelectedStationId("");
    setSelectedStationSummary([]);
    setSelectedItem("");
    setSelectedItemSummary([]);
    setItemPage(1);
    setStationItems([]);
    setStationItemsTotal(0);
    setTransactionCashierFilter("All");
    setTransactionCashierOptions(["All"]);
    resetTransactionPagination();
  }

  async function requestTransactionsPage({ cursor = "", signal } = {}) {
    const params = new URLSearchParams({
      stationId: selectedStationId,
      item: selectedItem,
      from: fromDate,
      to: toDate,
    });

    if (transactionCashierFilter !== "All") {
      params.set("cashier", transactionCashierFilter);
    }

    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(
      `/api/commodities-sales/transactions?${params.toString()}`,
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
      setItemTransactions(cachedPage.records);
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
      setItemTransactions(nextPageEntry.records);
      setTransactionHasNextPage(nextPageEntry.hasNextPage);
    } catch (error) {
      setTransactionsError(
        getCommoditySalesErrorMessage(error, "Failed to load transactions."),
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
    setItemTransactions(cachedPage.records);
    setTransactionHasNextPage(cachedPage.hasNextPage);
  }

  function resetTransactionPagination() {
    transactionPagesRef.current = new Map();
    setTransactionPage(1);
    setItemTransactions([]);
    setTransactionHasNextPage(false);
    setTransactionTotalItems(0);
    setTransactionPageSize(20);
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
    <DashboardPageShell
      title="Commodity Sales"
      description="Review commodity sales by date and drill into station, item, and transaction performance."
      {...shellProps}
    >
      <CompactFilterCard
        columnsClass="md:grid-cols-4"
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
              setSelectedItem("");
              setOverviewPage(1);
              setItemPage(1);
              setStationItems([]);
              setStationItemsTotal(0);
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
              setSelectedItem("");
              setOverviewPage(1);
              setItemPage(1);
              setStationItems([]);
              setStationItemsTotal(0);
              resetTransactionPagination();
              navigateToRange(fromDate, nextToDate);
            }}
            disabled={isPending}
          />
        </div>
        <div>
          <CompactFieldLabel>station</CompactFieldLabel>
          <CompactSelect
            value={stationFilter}
            onChange={(event) => {
              setStationFilter(event.target.value);
              setSelectedStation("");
              setSelectedStationId("");
              setSelectedStationSummary([]);
              setSelectedItem("");
              setOverviewPage(1);
              setItemPage(1);
              setStationItems([]);
              setStationItemsTotal(0);
              resetTransactionPagination();
            }}
            disabled={isPending}
          >
            {stationOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </CompactSelect>
        </div>
      </CompactFilterCard>

      {view === "stations" ? (
        <div className="space-y-6">
          <CompactSummaryCards
            items={overallCards}
            fullRow
            columnsClass="md:grid-cols-4"
          />
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
                  columns={stationColumns}
                  data={overviewRows}
                  title="Station Commodity Performance"
                  subtitle="Review summary totals first, then drill into live item and transaction details."
                  onRowClick={handleStationSelect}
                  loading={isOverviewLoading}
                  loadingMessage="Loading station summary..."
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
                title="Top 3 Stations"
                items={topStations}
                onSelect={handleTopStationSelect}
                itemLabel="Commodity sales"
              />
            }
            leftSpan="xl:col-span-8"
            rightSpan="xl:col-span-2"
          />
        </div>
      ) : null}

      {view === "items" ? (
        <div className="space-y-6">
          <CompactSummaryCards
            items={selectedStationSummary}
            fullRow
            columnsClass="md:grid-cols-4"
          />
          <PaginationSummary
            currentPage={itemPage}
            totalItems={stationItemsTotal}
            pageSize={PAGE_SIZE}
            label="Items"
            actions={
              <CompactActionButton onClick={handleBack}>
                ← Back to stations
              </CompactActionButton>
            }
          />
          <DataTable
            columns={itemColumns}
            data={stationItems}
            title={`${selectedStation} Item Breakdown`}
            subtitle="Live item totals for the selected date range. Select an item to inspect individual transactions."
            onRowClick={(row) => {
              setSelectedItem(row.item || "");
              setSelectedItemSummary(buildItemSummaryCards(row));
              resetTransactionPagination();
            }}
            loading={isItemsLoading}
            loadingMessage="Loading item breakdown..."
          />
          {!isItemsLoading && itemsError ? (
            <p className="text-sm text-rose-600">{itemsError}</p>
          ) : null}
          <PaginationControls
            currentPage={itemPage}
            totalItems={stationItemsTotal}
            pageSize={PAGE_SIZE}
            onPageChange={setItemPage}
          />
        </div>
      ) : null}

      {view === "transactions" ? (
        <div className="space-y-6">
          <CompactSummaryCards items={selectedItemSummary} fullRow />
          <RemotePaginationSummary
            actions={
              <CompactActionButton onClick={handleBack}>
                ← Back to item breakdown
              </CompactActionButton>
            }
          />
          <DataTable
            columns={transactionColumns}
            data={itemTransactions}
            title={`${selectedItem} Transactions`}
            subtitle={`Latest individual commodity transactions for ${selectedStation}.`}
            headerContent={
              <div className="flex flex-wrap items-end gap-3 lg:justify-center">
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

function buildItemSummaryCards(row) {
  return [
    {
      title: "Total Sales",
      value: `D${Number(row?.totalAmount || 0).toLocaleString()}`,
      icon: "💰",
    },
    {
      title: "Units",
      value: Number(row?.totalQuantity || 0).toLocaleString(),
      icon: "📦",
    },
    {
      title: "Transactions",
      value: Number(row?.transactions || 0).toLocaleString(),
      icon: "🧾",
    },
  ];
}
