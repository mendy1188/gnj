"use client";

import { useEffect, useMemo, useState } from "react";

import DataTable from "@/components/dashboard/DataTable";
import DashboardPageShell from "@/features/dashboard/page-shell";
import {
  buildBulkFuelClientRows,
  buildBulkFuelPurchaseRows,
  formatBulkFuelClientStatusLabel,
  formatBulkFuelPurchaseStatusLabel,
} from "@/features/bulk-fuel/helpers";
import {
  PAGE_SIZE,
  formatCurrency,
  formatDisplayDate,
  formatDisplayDateTime,
  paginateItems,
} from "@/features/operations/helpers";
import {
  CompactActionButton,
  CompactFieldLabel,
  CompactInput,
  CompactSelect,
  CompactSplitPanel,
  CompactSummaryCards,
  PaginationControls,
  PaginationSummary,
} from "@/features/operations/ui";

const clientColumns = [
  {
    key: "name",
    label: "Client",
    render: (row) => (
      <div>
        <p className="font-medium text-slate-900">{row.name}</p>
        <p className="text-xs text-slate-500">
          {row.phone}
          {row.address ? ` · ${row.address}` : ""}
        </p>
      </div>
    ),
  },
  { key: "dateJoinedLabel", label: "Date Joined" },
  { key: "purchaseCount", label: "Purchases", format: "number" },
  { key: "activePurchaseCount", label: "Active", format: "number" },
  { key: "availableBalance", label: "Available", format: "currency" },
];

const purchaseColumns = [
  {
    key: "clientName",
    label: "Client",
    render: (row) => (
      <div>
        <p className="font-medium text-slate-900">{row.clientName}</p>
        <p className="text-xs text-slate-500">{row.clientPhone}</p>
      </div>
    ),
  },
  { key: "purchaseDateLabel", label: "Purchase Date" },
  { key: "referenceCode", label: "Reference" },
  { key: "productName", label: "Fuel Type" },
  { key: "purchaseAmount", label: "Purchased", format: "currency" },
  { key: "availableBalance", label: "Available", format: "currency" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => <StatusBadge tone={row.isActive ? "active" : "inactive"} label={row.statusLabel} />,
  },
];

const redeemColumns = [
  { key: "movementDateLabel", label: "Redeem Date" },
  { key: "stationNameLabel", label: "Station" },
  { key: "receiptNumberLabel", label: "Receipt" },
  { key: "amountRedeemed", label: "Redeemed", format: "currency" },
  { key: "balanceAmount", label: "Balance After", format: "currency" },
  { key: "actorNameLabel", label: "Recorded By" },
];

const PURCHASE_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "redeemed", label: "Redeemed" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
];

function StatusBadge({ tone, label }) {
  const className =
    tone === "active"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-200 text-slate-700";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function InfoCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function buildSummaryCards(clientRows, purchaseRows) {
  const activePurchases = purchaseRows.filter((purchase) => purchase.isActive);

  return [
    {
      title: "Clients",
      value: clientRows.length.toLocaleString(),
      icon: "👥",
    },
    {
      title: "Active Bulk Purchases",
      value: activePurchases.length.toLocaleString(),
      icon: "🛢️",
    },
    {
      title: "Available Balance",
      value: formatCurrency(
        activePurchases.reduce(
          (sum, purchase) => sum + Number(purchase.availableBalance || 0),
          0,
        ),
      ),
      icon: "💰",
    },
  ];
}

function buildClientSummaryCards(client, purchaseRows) {
  const clientPurchases = purchaseRows.filter(
    (purchase) => purchase.clientPhone === client.phone,
  );
  const activePurchases = clientPurchases.filter((purchase) => purchase.isActive);

  return [
    {
      title: "Purchases",
      value: clientPurchases.length.toLocaleString(),
      icon: "🧾",
    },
    {
      title: "Active Purchases",
      value: activePurchases.length.toLocaleString(),
      icon: "✅",
    },
    {
      title: "Available Balance",
      value: formatCurrency(
        activePurchases.reduce(
          (sum, purchase) => sum + Number(purchase.availableBalance || 0),
          0,
        ),
      ),
      icon: "🏦",
    },
  ];
}

function buildPurchaseSummaryCards(purchase, redeemRows) {
  return [
    {
      title: "Purchased",
      value: formatCurrency(purchase.purchaseAmount),
      icon: "💵",
    },
    {
      title: "Redeemed",
      value: formatCurrency(purchase.redeemedAmount),
      icon: "↘️",
    },
    {
      title: "Available",
      value: formatCurrency(purchase.availableBalance),
      icon: "🏦",
    },
    {
      title: "Redeems Logged",
      value: redeemRows.length.toLocaleString(),
      icon: "🧾",
    },
  ];
}

export default function BulkFuelPurchasesPageClient({
  clients,
  balanceAccounts,
  movementRecords,
  shellProps,
}) {
  const [selectedClientKey, setSelectedClientKey] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState("all");
  const [clientPage, setClientPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [redeemPage, setRedeemPage] = useState(1);
  const [activePurchasePage, setActivePurchasePage] = useState(1);

  const purchaseRows = useMemo(
    () =>
      buildBulkFuelPurchaseRows(balanceAccounts, movementRecords).map((purchase) => ({
        ...purchase,
        purchaseDateLabel: formatDisplayDate(purchase.createdAt),
        updatedAtLabel: formatDisplayDateTime(purchase.updatedAt || purchase.createdAt),
        statusLabel: formatBulkFuelPurchaseStatusLabel(
          purchase.status,
          purchase.availableBalance,
        ),
      })),
    [balanceAccounts, movementRecords],
  );

  const clientRows = useMemo(
    () =>
      buildBulkFuelClientRows(clients, purchaseRows)
        .filter((client) => client.purchaseCount > 0)
        .map((client) => ({
          ...client,
          dateJoinedLabel: client.dateJoined ? formatDisplayDate(client.dateJoined) : "—",
          statusLabel: formatBulkFuelClientStatusLabel(client.status),
        })),
    [clients, purchaseRows],
  );

  const filteredClientRows = useMemo(() => {
    const normalizedSearch = clientSearch.trim().toLowerCase();

    return clientRows.filter((client) => {
      if (!normalizedSearch) {
        return true;
      }

      return [client.name, client.phone, client.address]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [clientRows, clientSearch]);

  const activePurchaseRows = useMemo(
    () => purchaseRows.filter((purchase) => purchase.isActive),
    [purchaseRows],
  );

  const selectedClient = useMemo(
    () => clientRows.find((client) => client.key === selectedClientKey) || null,
    [clientRows, selectedClientKey],
  );

  const selectedClientPurchases = useMemo(
    () =>
      selectedClient
        ? purchaseRows
            .filter((purchase) => purchase.clientPhone === selectedClient.phone)
            .filter((purchase) => {
              if (purchaseStatusFilter === "all") {
                return true;
              }

              return (
                formatBulkFuelPurchaseStatusLabel(
                  purchase.status,
                  purchase.availableBalance,
                )
                  .toLowerCase()
                  .replace(/\s+/g, "_") === purchaseStatusFilter
              );
            })
        : [],
    [purchaseRows, purchaseStatusFilter, selectedClient],
  );

  const selectedPurchase = useMemo(
    () =>
      selectedClientPurchases.find((purchase) => purchase.id === selectedPurchaseId) || null,
    [selectedClientPurchases, selectedPurchaseId],
  );

  const redeemRows = useMemo(
    () =>
      selectedPurchase
        ? movementRecords
            .filter(
              (movement) =>
                movement.accountId === selectedPurchase.id &&
                Number(movement.amountDelta || 0) < 0,
            )
            .map((movement) => ({
              ...movement,
              movementDateLabel: formatDisplayDateTime(movement.movementDate),
              stationNameLabel: movement.stationName || "—",
              receiptNumberLabel: movement.receiptNumber || "—",
              amountRedeemed: Math.abs(Number(movement.amountDelta || 0)),
              actorNameLabel: movement.actorName || "System",
            }))
            .sort(
              (left, right) =>
                `${right.movementDate || ""}`.localeCompare(`${left.movementDate || ""}`),
            )
        : [],
    [movementRecords, selectedPurchase],
  );

  const paginatedClients = useMemo(
    () => paginateItems(filteredClientRows, clientPage, PAGE_SIZE),
    [clientPage, filteredClientRows],
  );
  const paginatedPurchases = useMemo(
    () => paginateItems(selectedClientPurchases, purchasePage, PAGE_SIZE),
    [purchasePage, selectedClientPurchases],
  );
  const paginatedRedeems = useMemo(
    () => paginateItems(redeemRows, redeemPage, PAGE_SIZE),
    [redeemPage, redeemRows],
  );
  const paginatedActivePurchases = useMemo(
    () => paginateItems(activePurchaseRows, activePurchasePage, PAGE_SIZE),
    [activePurchasePage, activePurchaseRows],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(clientRows, purchaseRows),
    [clientRows, purchaseRows],
  );
  const clientSummaryCards = useMemo(
    () => (selectedClient ? buildClientSummaryCards(selectedClient, purchaseRows) : []),
    [purchaseRows, selectedClient],
  );
  const purchaseSummaryCards = useMemo(
    () => (selectedPurchase ? buildPurchaseSummaryCards(selectedPurchase, redeemRows) : []),
    [redeemRows, selectedPurchase],
  );

  useEffect(() => {
    setSelectedPurchaseId("");
    setPurchasePage(1);
    setRedeemPage(1);
  }, [selectedClientKey]);

  useEffect(() => {
    setRedeemPage(1);
  }, [selectedPurchaseId]);

  useEffect(() => {
    setClientPage(1);
  }, [clientSearch]);

  useEffect(() => {
    setPurchasePage(1);
  }, [purchaseStatusFilter]);

  return (
    <DashboardPageShell
      title="Bulk Fuel Purchases"
      description="Review active bulk fuel purchases, their client details, and every redeem that has been logged under each purchase reference."
      {...shellProps}
    >
      {!selectedClient ? (
        <>
          <CompactSummaryCards items={summaryCards} fullRow />

          <CompactSplitPanel
            className="gap-6"
            left={
              <div className="space-y-4">
                <DataTable
                  columns={clientColumns}
                  data={paginatedClients}
                  title="Clients with Bulk Fuel Purchases"
                  subtitle="Select a client to review all of their funded fuel purchases."
                  headerContent={
                    <div className="ml-auto grid min-w-[240px] gap-3 md:grid-cols-1 lg:max-w-[280px]">
                      <div>
                        <CompactFieldLabel>client search</CompactFieldLabel>
                        <CompactInput
                          value={clientSearch}
                          onChange={(event) => setClientSearch(event.target.value)}
                          placeholder="Search name, phone, address"
                        />
                      </div>
                    </div>
                  }
                  onRowClick={(row) => setSelectedClientKey(row.key)}
                  selectedRowKey={selectedClientKey}
                  selectedRowField="key"
                />
                <PaginationSummary
                  currentPage={clientPage}
                  totalItems={filteredClientRows.length}
                  pageSize={PAGE_SIZE}
                  label="clients"
                />
                <PaginationControls
                  currentPage={clientPage}
                  totalItems={filteredClientRows.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setClientPage}
                />
              </div>
            }
            right={
              <div className="space-y-4">
                <DataTable
                  columns={purchaseColumns}
                  data={paginatedActivePurchases}
                  title="All Active Bulk Fuel Purchases"
                  subtitle="Active purchases stay on top so available funded balances are easy to review."
                />
                <PaginationSummary
                  currentPage={activePurchasePage}
                  totalItems={activePurchaseRows.length}
                  pageSize={PAGE_SIZE}
                  label="active bulk fuel purchases"
                />
                <PaginationControls
                  currentPage={activePurchasePage}
                  totalItems={activePurchaseRows.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setActivePurchasePage}
                />
              </div>
            }
          />
        </>
      ) : !selectedPurchase ? (
        <>
          <CompactSummaryCards items={clientSummaryCards} fullRow />
          <div className="flex flex-wrap gap-2">
            <CompactActionButton onClick={() => setSelectedClientKey("")}>
              ← Back to clients
            </CompactActionButton>
          </div>
          <CompactSplitPanel
            className="gap-6"
            left={
              <div className="space-y-4">
                <DataTable
                  columns={purchaseColumns}
                  data={paginatedPurchases}
                  title={`${selectedClient.name} Bulk Fuel Purchases`}
                  subtitle="Active purchases stay on top. Open a purchase to inspect the redeem log under that reference."
                  headerContent={
                    <div className="ml-auto min-w-[220px] lg:max-w-[240px]">
                      <CompactFieldLabel>purchase status</CompactFieldLabel>
                      <CompactSelect
                        value={purchaseStatusFilter}
                        onChange={(event) => setPurchaseStatusFilter(event.target.value)}
                      >
                        {PURCHASE_STATUS_OPTIONS.map((statusOption) => (
                          <option key={statusOption.value} value={statusOption.value}>
                            {statusOption.label}
                          </option>
                        ))}
                      </CompactSelect>
                    </div>
                  }
                  onRowClick={(row) => setSelectedPurchaseId(row.id)}
                  selectedRowKey={selectedPurchaseId}
                />
                <PaginationSummary
                  currentPage={purchasePage}
                  totalItems={selectedClientPurchases.length}
                  pageSize={PAGE_SIZE}
                  label="bulk fuel purchases"
                />
                <PaginationControls
                  currentPage={purchasePage}
                  totalItems={selectedClientPurchases.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPurchasePage}
                />
              </div>
            }
            right={
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Client Overview</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Review funded fuel purchases for {selectedClient.name}.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <InfoCard title="Phone" value={selectedClient.phone} />
                  <InfoCard title="Address" value={selectedClient.address || "—"} />
                  <InfoCard title="Date Joined" value={selectedClient.dateJoinedLabel} />
                  <InfoCard
                    title="Status"
                    value={formatBulkFuelClientStatusLabel(selectedClient.status)}
                  />
                </div>
              </div>
            }
          />
        </>
      ) : (
        <>
          <CompactSummaryCards items={purchaseSummaryCards} fullRow />
          <div className="flex flex-wrap gap-2">
            <CompactActionButton onClick={() => setSelectedPurchaseId("")}>
              ← Back to purchases
            </CompactActionButton>
            <CompactActionButton onClick={() => setSelectedClientKey("")}>
              ← Back to clients
            </CompactActionButton>
          </div>
          <CompactSplitPanel
            className="gap-6"
            left={
              <div className="space-y-4">
                <DataTable
                  columns={redeemColumns}
                  data={paginatedRedeems}
                  title={`${selectedPurchase.referenceCode} Redeem Log`}
                  subtitle="Latest redeems appear first. Each row shows how much was redeemed and the remaining balance after that sale."
                />
                <PaginationSummary
                  currentPage={redeemPage}
                  totalItems={redeemRows.length}
                  pageSize={PAGE_SIZE}
                  label="redeem records"
                />
                <PaginationControls
                  currentPage={redeemPage}
                  totalItems={redeemRows.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setRedeemPage}
                />
              </div>
            }
            right={
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Purchase Overview</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedPurchase.clientName} bought {selectedPurchase.productName} worth{" "}
                    {formatCurrency(selectedPurchase.purchaseAmount)} on{" "}
                    {selectedPurchase.purchaseDateLabel}.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <InfoCard title="Client" value={selectedPurchase.clientName} />
                  <InfoCard title="Phone" value={selectedPurchase.clientPhone} />
                  <InfoCard title="Reference" value={selectedPurchase.referenceCode} />
                  <InfoCard title="Fuel Type" value={selectedPurchase.productName} />
                  <InfoCard
                    title="Current Status"
                    value={selectedPurchase.statusLabel}
                  />
                  <InfoCard
                    title="Last Updated"
                    value={selectedPurchase.updatedAtLabel}
                  />
                </div>
              </div>
            }
          />
        </>
      )}
    </DashboardPageShell>
  );
}
