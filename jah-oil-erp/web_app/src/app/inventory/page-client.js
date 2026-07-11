"use client";

import { useMemo, useState } from "react";

import DataTable from "@/components/dashboard/DataTable";
import DashboardPageShell from "@/features/dashboard/page-shell";
import { PAGE_SIZE, paginateItems } from "@/features/operations/helpers";
import {
  CompactActionButton,
  CompactFieldLabel,
  CompactFilterCard,
  CompactLayerHeader,
  CompactSelect,
  CompactSplitPanel,
  CompactSummaryCards,
  PaginationControls,
  PaginationSummary,
  TopPerformersCard,
} from "@/features/operations/ui";
import {
  buildInventoryRiskCardData,
  buildInventoryRows,
  buildInventoryStationBreakdown,
  buildInventoryStationSummary,
  buildInventorySummaryCards,
} from "@/features/sales/sales-utils";

const stationColumns = [
  { key: "station", label: "Station" },
  { key: "trackedItems", label: "Tracked Items" },
  { key: "lowStock", label: "Low Stock" },
  { key: "criticalItem", label: "Priority Item" },
];

const detailColumns = [
  { key: "name", label: "Item" },
  { key: "quantity", label: "Quantity" },
  { key: "unit", label: "Unit" },
  { key: "reorderLevel", label: "Reorder Level" },
  { key: "status", label: "Status" },
];

export default function InventoryPageClient({ inventoryRecords, shellProps }) {
  const [stationFilter, setStationFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedStation, setSelectedStation] = useState("");
  const [detailPage, setDetailPage] = useState(1);

  const inventoryRows = useMemo(
    () => buildInventoryRows(inventoryRecords),
    [inventoryRecords],
  );

  const stationOptions = useMemo(
    () => ["All", ...new Set(inventoryRows.map((record) => record.station))],
    [inventoryRows],
  );

  const filteredInventory = useMemo(
    () =>
      inventoryRows.filter((record) => {
        if (stationFilter !== "All" && record.station !== stationFilter) {
          return false;
        }
        if (statusFilter !== "All" && record.status !== statusFilter) {
          return false;
        }
        return true;
      }),
    [inventoryRows, stationFilter, statusFilter],
  );

  const stationSummary = useMemo(
    () => buildInventoryStationSummary(filteredInventory),
    [filteredInventory],
  );
  const riskCardData = useMemo(
    () => buildInventoryRiskCardData(filteredInventory),
    [filteredInventory],
  );
  const summaryCards = useMemo(
    () => buildInventorySummaryCards(filteredInventory),
    [filteredInventory],
  );
  const selectedStationRows = useMemo(
    () => buildInventoryStationBreakdown(filteredInventory, selectedStation),
    [filteredInventory, selectedStation],
  );
  const paginatedStationRows = useMemo(
    () => paginateItems(selectedStationRows, detailPage, PAGE_SIZE),
    [selectedStationRows, detailPage],
  );

  function resetFilters() {
    setStationFilter("All");
    setStatusFilter("All");
    setSelectedStation("");
    setDetailPage(1);
  }

  function handleStationSelect(station) {
    const stationName =
      typeof station === "string" ? station : station?.station || station?.label || "";

    setSelectedStation(stationName);
    setDetailPage(1);
  }

  return (
    <DashboardPageShell
      title="Inventory"
      description="Review stock levels, reorder thresholds, and station-level inventory risk."
      {...shellProps}
    >
      <CompactFilterCard
        actions={
          <>
            <CompactActionButton onClick={resetFilters}>
              Reset filters
            </CompactActionButton>
          </>
        }
      >
        <div>
          <CompactFieldLabel>station</CompactFieldLabel>
          <CompactSelect
            value={stationFilter}
            onChange={(event) => {
              setStationFilter(event.target.value);
              setSelectedStation("");
              setDetailPage(1);
            }}
          >
            {stationOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </CompactSelect>
        </div>
        <div>
          <CompactFieldLabel>status</CompactFieldLabel>
          <CompactSelect
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setSelectedStation("");
              setDetailPage(1);
            }}
          >
            <option value="All">All</option>
            <option value="Healthy">Healthy</option>
            <option value="Low Stock">Low Stock</option>
          </CompactSelect>
        </div>
      </CompactFilterCard>

      {!selectedStation ? (
        <>
          <CompactSummaryCards items={summaryCards} fullRow />
          <CompactSplitPanel
            className="gap-6"
            left={
              <DataTable
                columns={stationColumns}
                data={stationSummary}
                title="Inventory by Station"
                subtitle="Compare tracked items, low-stock counts, and the most critical item."
                onRowClick={(row) => handleStationSelect(row.station)}
              />
            }
            right={
              <TopPerformersCard
                title="Inventory Risk"
                items={riskCardData}
                onSelect={handleStationSelect}
                itemLabel="Low-stock items"
                valuePrefix=""
              />
            }
            leftSpan="xl:col-span-8"
            rightSpan="xl:col-span-2"
          />
        </>
      ) : (
        <div className="space-y-6">
          <CompactSummaryCards
            items={buildInventorySummaryCards(selectedStationRows)}
            fullRow
          />
          <PaginationSummary
            currentPage={detailPage}
            totalItems={selectedStationRows.length}
            pageSize={PAGE_SIZE}
            label="Inventory items"
            actions={
              <CompactActionButton
                onClick={() => {
                  setSelectedStation("");
                  setDetailPage(1);
                }}
              >
                ← Back to stations
              </CompactActionButton>
            }
          />
          <DataTable
            columns={detailColumns}
            data={paginatedStationRows}
            title={`${selectedStation} Inventory Breakdown`}
            subtitle="Review item-level stock health and reorder exposure for the selected station."
          />
          <PaginationControls
            currentPage={detailPage}
            totalItems={selectedStationRows.length}
            pageSize={PAGE_SIZE}
            onPageChange={setDetailPage}
          />
        </div>
      )}
    </DashboardPageShell>
  );
}
