"use client";

import { useEffect, useState, useTransition } from "react";
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
  TopPerformersCard,
} from "@/features/operations/ui";

const stationColumns = [
  { key: "station", label: "Station" },
  { key: "lastDate", label: "Last Date" },
  { key: "totalQuantity", label: "Quantity", format: "number" },
  { key: "deliveries", label: "Deliveries" },
  { key: "delivered", label: "Delivered" },
  { key: "pending", label: "Pending" },
];

const deliveryColumns = [
  {
    key: "deliveryDate",
    label: "Date",
    render: (row) => formatDisplayDateTime(row.deliveryDate || row.date),
  },
  { key: "type", label: "Fuel Type" },
  { key: "quantity", label: "Quantity", format: "number" },
  { key: "status", label: "Status" },
  { key: "recordedBy", label: "Recorded By" },
];

function getFuelDeliveriesErrorMessage(error, fallbackMessage) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Fuel Deliveries",
    genericLabel: "load fuel delivery data",
    fallbackMessage,
  });
}

export default function FuelDeliveriesPageClient({
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
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [recordedByFilter, setRecordedByFilter] = useState("All");
  const [recordedByOptions, setRecordedByOptions] = useState(["All"]);
  const [overviewRows, setOverviewRows] = useState(initialOverviewData?.records || []);
  const [overviewTotalItems, setOverviewTotalItems] = useState(
    Number(initialOverviewData?.totalItems || 0),
  );
  const [summaryCards, setSummaryCards] = useState(
    initialOverviewData?.summaryCards || [],
  );
  const [topStations, setTopStations] = useState(initialOverviewData?.topStations || []);
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedStationSummary, setSelectedStationSummary] = useState([]);
  const [detailRows, setDetailRows] = useState([]);
  const [detailTotalItems, setDetailTotalItems] = useState(0);
  const [overviewPage, setOverviewPage] = useState(1);
  const [detailPage, setDetailPage] = useState(1);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [detailError, setDetailError] = useState("");
  const isDefaultFilters =
    fromDate === defaultFromDate &&
    toDate === defaultToDate &&
    typeFilter === "All" &&
    statusFilter === "All" &&
    recordedByFilter === "All";

  useEffect(() => {
    setFromDate(initialFromDate);
    setToDate(initialToDate);
    setTypeFilter("All");
    setStatusFilter("All");
    setSelectedStation("");
    setSelectedStationSummary([]);
    setDetailRows([]);
    setDetailTotalItems(0);
    setRecordedByFilter("All");
    setRecordedByOptions(["All"]);
    setOverviewPage(1);
    setDetailPage(1);
    setOverviewError("");
    setDetailError("");
  }, [initialFromDate, initialToDate]);

  useEffect(() => {
    if (overviewPage !== 1) {
      return;
    }

    setOverviewRows(initialOverviewData?.records || []);
    setOverviewTotalItems(Number(initialOverviewData?.totalItems || 0));
    setSummaryCards(initialOverviewData?.summaryCards || []);
    setTopStations(initialOverviewData?.topStations || []);
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
          from: fromDate,
          to: toDate,
          page: `${overviewPage}`,
        });
        const response = await fetch(
          `/api/fuel-deliveries/overview?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.message || "Failed to load delivery summary.");
        }

        const payload = await response.json();

        if (!isActive) {
          return;
        }

        setOverviewRows(Array.isArray(payload?.records) ? payload.records : []);
        setOverviewTotalItems(Number(payload?.totalItems || 0));
        setSummaryCards(Array.isArray(payload?.summaryCards) ? payload.summaryCards : []);
        setTopStations(Array.isArray(payload?.topStations) ? payload.topStations : []);
      } catch (error) {
        if (!isActive || error?.name === "AbortError") {
          return;
        }

        setOverviewError(
          getFuelDeliveriesErrorMessage(error, "Failed to load delivery summary."),
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
  }, [fromDate, overviewPage, toDate]);

  useEffect(() => {
    if (!selectedStation) {
      setSelectedStationSummary([]);
      setDetailRows([]);
      setDetailTotalItems(0);
      setDetailError("");
      setRecordedByOptions(["All"]);
      setIsDetailLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    async function loadStationLog() {
      setIsDetailLoading(true);
      setDetailError("");

      try {
        const params = new URLSearchParams({
          station: selectedStation,
          from: fromDate,
          to: toDate,
          type: typeFilter,
          status: statusFilter,
          recordedBy: recordedByFilter,
          page: `${detailPage}`,
        });
        const response = await fetch(
          `/api/fuel-deliveries/station-log?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.message || "Failed to load delivery log.");
        }

        const payload = await response.json();

        if (!isActive) {
          return;
        }

        setDetailRows(Array.isArray(payload?.records) ? payload.records : []);
        setDetailTotalItems(Number(payload?.totalItems || 0));
        setSelectedStationSummary(
          Array.isArray(payload?.summaryCards) ? payload.summaryCards : [],
        );
        setRecordedByOptions(
          Array.isArray(payload?.recordedByOptions)
            ? payload.recordedByOptions
            : ["All"],
        );
      } catch (error) {
        if (!isActive || error?.name === "AbortError") {
          return;
        }

        setDetailRows([]);
        setDetailTotalItems(0);
        setSelectedStationSummary([]);
        setRecordedByOptions(["All"]);
        setDetailError(
          getFuelDeliveriesErrorMessage(error, "Failed to load delivery log."),
        );
      } finally {
        if (isActive) {
          setIsDetailLoading(false);
        }
      }
    }

    loadStationLog();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [
    detailPage,
    fromDate,
    recordedByFilter,
    selectedStation,
    statusFilter,
    toDate,
    typeFilter,
  ]);

  function resetFilters() {
    setFromDate(defaultFromDate);
    setToDate(defaultToDate);
    setTypeFilter("All");
    setStatusFilter("All");
    setRecordedByFilter("All");
    setRecordedByOptions(["All"]);
    setSelectedStation("");
    setSelectedStationSummary([]);
    setOverviewPage(1);
    setDetailPage(1);
    setDetailRows([]);
    setDetailTotalItems(0);
    navigateToRange(defaultFromDate, defaultToDate, { useDefaultRange: true });
  }

  function handleStationSelect(station) {
    const stationName =
      typeof station === "string" ? station : station?.station || station?.label || "";

    setSelectedStation(stationName);
    setTypeFilter("All");
    setStatusFilter("All");
    setRecordedByFilter("All");
    setRecordedByOptions(["All"]);
    setDetailPage(1);
  }

  function handleTopStationSelect(station) {
    handleStationSelect(station?.label || station?.station || "");
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
      title="Fuel Deliveries"
      description="Review dispatches, arrivals, and pending fuel replenishment activity across stations."
      {...shellProps}
    >
      <CompactFilterCard
        columnsClass="md:grid-cols-2"
        helperText={`From: ${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}.`}
        actions={
          <CompactActionButton onClick={resetFilters} disabled={isDefaultFilters || isPending}>
            {isPending
              ? "Updating range..."
              : isDefaultFilters
                ? "Showing last 7 days"
                : "Reset filters"}
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
              setSelectedStationSummary([]);
              setOverviewPage(1);
              setDetailPage(1);
              setDetailRows([]);
              setDetailTotalItems(0);
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
              setSelectedStationSummary([]);
              setOverviewPage(1);
              setDetailPage(1);
              setDetailRows([]);
              setDetailTotalItems(0);
              navigateToRange(fromDate, nextToDate);
            }}
            disabled={isPending}
          />
        </div>
      </CompactFilterCard>

      {!selectedStation ? (
        <>
          <CompactSummaryCards items={summaryCards} fullRow />
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
                  title="Fuel Deliveries by Station"
                  onRowClick={(row) => handleStationSelect(row.station)}
                  loading={isOverviewLoading}
                  loadingMessage="Loading delivery summary..."
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
                title="Top Delivery Stations"
                items={topStations}
                onSelect={handleTopStationSelect}
                itemLabel="Delivered quantity"
                valuePrefix=""
              />
            }
            leftSpan="xl:col-span-8"
            rightSpan="xl:col-span-2"
          />
        </>
      ) : (
        <div className="space-y-6">
          <CompactSummaryCards items={selectedStationSummary} fullRow />
          <PaginationSummary
            currentPage={detailPage}
            totalItems={detailTotalItems}
            pageSize={PAGE_SIZE}
            label="Deliveries"
            actions={
              <CompactActionButton
                onClick={() => {
                  setSelectedStation("");
                  setSelectedStationSummary([]);
                  setTypeFilter("All");
                  setStatusFilter("All");
                  setRecordedByFilter("All");
                  setRecordedByOptions(["All"]);
                  setDetailPage(1);
                  setDetailRows([]);
                  setDetailTotalItems(0);
                }}
              >
                ← Back to stations
              </CompactActionButton>
            }
          />
          <DataTable
            columns={deliveryColumns}
            data={detailRows}
            title={`${selectedStation} Delivery Log`}
            subtitle="Review individual fuel delivery activity for the selected station."
            headerContent={
              <div className="flex flex-wrap items-end gap-3 lg:justify-center">
                <div className="min-w-[150px]">
                  <CompactFieldLabel>fuel type</CompactFieldLabel>
                  <CompactSelect
                    value={typeFilter}
                    onChange={(event) => {
                      setTypeFilter(event.target.value);
                      setRecordedByFilter("All");
                      setDetailPage(1);
                    }}
                  >
                    <option value="All">All</option>
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                  </CompactSelect>
                </div>
                <div className="min-w-[150px]">
                  <CompactFieldLabel>status</CompactFieldLabel>
                  <CompactSelect
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setRecordedByFilter("All");
                      setDetailPage(1);
                    }}
                  >
                    <option value="All">All</option>
                    <option value="delivered">Delivered</option>
                    <option value="pending">Pending</option>
                  </CompactSelect>
                </div>
                <div className="min-w-[170px]">
                  <CompactFieldLabel>recorded by</CompactFieldLabel>
                  <CompactSelect
                    value={recordedByFilter}
                    onChange={(event) => {
                      setRecordedByFilter(event.target.value);
                      setDetailPage(1);
                    }}
                  >
                    {recordedByOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </CompactSelect>
                </div>
              </div>
            }
            loading={isDetailLoading}
            loadingMessage="Loading delivery log..."
          />
          {!isDetailLoading && detailError ? (
            <p className="text-sm text-rose-600">{detailError}</p>
          ) : null}
          <PaginationControls
            currentPage={detailPage}
            totalItems={detailTotalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setDetailPage}
          />
        </div>
      )}
    </DashboardPageShell>
  );
}
