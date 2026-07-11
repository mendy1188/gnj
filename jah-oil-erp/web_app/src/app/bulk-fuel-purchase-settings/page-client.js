"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  PRIMARY_ACTION_BUTTON_CLASS,
} from "@/features/operations/ui";

import {
  createBulkFuelClientAction,
  createBulkFuelPurchaseAction,
  updateBulkFuelClientAction,
} from "./actions";

const DEFAULT_CLIENT_FORM = {
  name: "",
  phone: "",
  address: "",
  dateJoined: "",
  status: "active",
  notes: "",
};

const DEFAULT_PURCHASE_FORM = {
  purchaseDate: "",
  productId: "",
  referenceCode: "",
  purchaseAmount: "",
  status: "active",
  notes: "",
};

const CLIENT_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const PURCHASE_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "redeemed", label: "Redeemed" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
];

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
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => (
      <StatusBadge tone={row.status === "active" ? "active" : "inactive"} label={row.statusLabel} />
    ),
  },
];

const purchaseColumns = [
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
  { key: "updatedAtLabel", label: "Updated" },
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

function buildSummaryCards(clientRows, purchaseRows) {
  const activePurchases = purchaseRows.filter((purchase) => purchase.isActive);

  return [
    {
      title: "Clients",
      value: clientRows.length.toLocaleString(),
      icon: "👥",
    },
    {
      title: "Active Purchases",
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

function buildClientSummaryCards(client, purchases) {
  const clientPurchases = purchases.filter(
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

function buildClientForm(client) {
  if (!client) {
    return DEFAULT_CLIENT_FORM;
  }

  return {
    name: client.name || "",
    phone: client.phone || "",
    address: client.address || "",
    dateJoined: client.dateJoined || "",
    status: client.status || "active",
    notes: client.notes || "",
  };
}

export default function BulkFuelPurchaseSettingsPageClient({
  clients,
  balanceAccounts,
  movementRecords,
  products,
  shellProps,
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientStatusFilter, setClientStatusFilter] = useState("all");
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState("all");
  const [clientPage, setClientPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [feedback, setFeedback] = useState(null);
  const [clientForm, setClientForm] = useState(DEFAULT_CLIENT_FORM);
  const [purchaseForm, setPurchaseForm] = useState(DEFAULT_PURCHASE_FORM);

  const fuelProducts = useMemo(
    () =>
      products
        .filter((product) => `${product.category || ""}`.trim().toLowerCase() === "fuel")
        .sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );

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
      buildBulkFuelClientRows(clients, purchaseRows).map((client) => ({
        ...client,
        dateJoinedLabel: client.dateJoined ? formatDisplayDate(client.dateJoined) : "—",
        statusLabel: formatBulkFuelClientStatusLabel(client.status),
      })),
    [clients, purchaseRows],
  );

  const filteredClientRows = useMemo(() => {
    const normalizedSearch = clientSearch.trim().toLowerCase();

    return clientRows.filter((client) => {
      if (clientStatusFilter !== "all" && client.status !== clientStatusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [client.name, client.phone, client.address]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [clientRows, clientSearch, clientStatusFilter]);

  const selectedClient = useMemo(
    () => clientRows.find((client) => client.id === selectedClientId) || null,
    [clientRows, selectedClientId],
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

  const paginatedClients = useMemo(
    () => paginateItems(filteredClientRows, clientPage, PAGE_SIZE),
    [clientPage, filteredClientRows],
  );

  const paginatedPurchases = useMemo(
    () => paginateItems(selectedClientPurchases, purchasePage, PAGE_SIZE),
    [purchasePage, selectedClientPurchases],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(clientRows, purchaseRows),
    [clientRows, purchaseRows],
  );

  const clientSummaryCards = useMemo(
    () => (selectedClient ? buildClientSummaryCards(selectedClient, purchaseRows) : []),
    [purchaseRows, selectedClient],
  );

  useEffect(() => {
    setClientForm(buildClientForm(selectedClient));
    setPurchaseForm(DEFAULT_PURCHASE_FORM);
    setPurchasePage(1);
    setFeedback(null);
  }, [selectedClientId]);

  useEffect(() => {
    setClientPage(1);
  }, [clientSearch, clientStatusFilter]);

  useEffect(() => {
    setPurchasePage(1);
  }, [purchaseStatusFilter]);

  const isBusy = Boolean(pendingAction);
  const isCreatingClient = pendingAction === "create-client";
  const isUpdatingClient = pendingAction === "update-client";
  const isCreatingPurchase = pendingAction === "create-purchase";

  async function handleCreateClient() {
    setFeedback(null);
    setPendingAction("create-client");

    try {
      const result = await createBulkFuelClientAction(clientForm);
      setFeedback(result);

      if (result?.success) {
        setSelectedClientId(result.clientId || "");
        setClientPage(1);
        router.refresh();
      }
    } finally {
      setPendingAction("");
    }
  }

  async function handleUpdateClient() {
    if (!selectedClient) {
      return;
    }

    setFeedback(null);
    setPendingAction("update-client");

    try {
      const result = await updateBulkFuelClientAction({
        clientId: selectedClient.id,
        ...clientForm,
      });
      setFeedback(result);

      if (result?.success) {
        router.refresh();
      }
    } finally {
      setPendingAction("");
    }
  }

  async function handleCreatePurchase() {
    if (!selectedClient) {
      return;
    }

    const selectedProduct =
      fuelProducts.find((product) => product.id === purchaseForm.productId) || null;

    setFeedback(null);
    setPendingAction("create-purchase");

    try {
      const result = await createBulkFuelPurchaseAction({
        clientId: selectedClient.id,
        purchaseDate: purchaseForm.purchaseDate,
        productId: selectedProduct?.id || "",
        productName: selectedProduct?.name || "",
        productCategory: selectedProduct?.category || "",
        referenceCode: purchaseForm.referenceCode,
        purchaseAmount: purchaseForm.purchaseAmount,
        status: purchaseForm.status,
        notes: purchaseForm.notes,
      });
      setFeedback(result);

      if (result?.success) {
        setPurchaseForm(DEFAULT_PURCHASE_FORM);
        setPurchasePage(1);
        router.refresh();
      }
    } finally {
      setPendingAction("");
    }
  }

  return (
    <DashboardPageShell
      title="Bulk Fuel Purchase Settings"
      description="Add bulk fuel clients, keep their contact details updated, and create new funded fuel purchases for later redemption."
      {...shellProps}
    >
      {feedback?.message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            feedback.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

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
                  title="Bulk Fuel Clients"
                  subtitle="Select a client to review their purchases and record a new funded bulk fuel purchase."
                  headerContent={
                    <div className="ml-auto grid min-w-[260px] gap-3 lg:max-w-[320px] lg:grid-cols-2">
                      <div className="lg:col-span-2">
                        <CompactFieldLabel>client search</CompactFieldLabel>
                        <CompactInput
                          value={clientSearch}
                          onChange={(event) => setClientSearch(event.target.value)}
                          placeholder="Search name, phone, address"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <CompactFieldLabel>status</CompactFieldLabel>
                        <CompactSelect
                          value={clientStatusFilter}
                          onChange={(event) => setClientStatusFilter(event.target.value)}
                        >
                          {CLIENT_STATUS_OPTIONS.map((statusOption) => (
                            <option key={statusOption.value} value={statusOption.value}>
                              {statusOption.label}
                            </option>
                          ))}
                        </CompactSelect>
                      </div>
                    </div>
                  }
                  onRowClick={(row) => setSelectedClientId(row.id)}
                  selectedRowKey={selectedClientId}
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
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Add Bulk Fuel Client</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Register a client first, then add one or more funded fuel purchases under that client.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <CompactFieldLabel>client name</CompactFieldLabel>
                    <CompactInput
                      value={clientForm.name}
                      onChange={(event) =>
                        setClientForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Client or company name"
                    />
                  </div>
                  <div>
                    <CompactFieldLabel>phone number</CompactFieldLabel>
                    <CompactInput
                      value={clientForm.phone}
                      onChange={(event) =>
                        setClientForm((current) => ({ ...current, phone: event.target.value }))
                      }
                      placeholder="Phone number"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <CompactFieldLabel>address</CompactFieldLabel>
                    <CompactInput
                      value={clientForm.address}
                      onChange={(event) =>
                        setClientForm((current) => ({ ...current, address: event.target.value }))
                      }
                      placeholder="Client address"
                    />
                  </div>
                  <div>
                    <CompactFieldLabel>date joined</CompactFieldLabel>
                    <CompactInput
                      type="date"
                      value={clientForm.dateJoined}
                      onChange={(event) =>
                        setClientForm((current) => ({
                          ...current,
                          dateJoined: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <CompactFieldLabel>status</CompactFieldLabel>
                    <CompactSelect
                      value={clientForm.status}
                      onChange={(event) =>
                        setClientForm((current) => ({ ...current, status: event.target.value }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </CompactSelect>
                  </div>
                  <div className="sm:col-span-2">
                    <CompactFieldLabel>notes</CompactFieldLabel>
                    <CompactInput
                      value={clientForm.notes}
                      onChange={(event) =>
                        setClientForm((current) => ({ ...current, notes: event.target.value }))
                      }
                      placeholder="Optional note"
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <CompactActionButton
                    onClick={handleCreateClient}
                    disabled={isBusy}
                    className={`px-4 py-2 text-sm shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/30 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                  >
                    {isCreatingClient ? "Saving..." : "Create client"}
                  </CompactActionButton>
                </div>
              </div>
            }
          />
        </>
      ) : (
        <>
          <CompactSummaryCards items={clientSummaryCards} fullRow />
          <div className="flex flex-wrap gap-2">
            <CompactActionButton onClick={() => setSelectedClientId("")}>
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
                  subtitle="Active purchases stay on top. Each purchase carries its own redeemable balance and reference code."
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
              <div className="space-y-4">
                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Client Details</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Keep client contact information current before recording a new purchase.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      Joined {selectedClient.dateJoinedLabel}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <CompactFieldLabel>client name</CompactFieldLabel>
                      <CompactInput
                        value={clientForm.name}
                        onChange={(event) =>
                          setClientForm((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <CompactFieldLabel>phone number</CompactFieldLabel>
                      <CompactInput
                        value={clientForm.phone}
                        onChange={(event) =>
                          setClientForm((current) => ({ ...current, phone: event.target.value }))
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <CompactFieldLabel>address</CompactFieldLabel>
                      <CompactInput
                        value={clientForm.address}
                        onChange={(event) =>
                          setClientForm((current) => ({ ...current, address: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <CompactFieldLabel>date joined</CompactFieldLabel>
                      <CompactInput
                        type="date"
                        value={clientForm.dateJoined}
                        onChange={(event) =>
                          setClientForm((current) => ({
                            ...current,
                            dateJoined: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <CompactFieldLabel>status</CompactFieldLabel>
                      <CompactSelect
                        value={clientForm.status}
                        onChange={(event) =>
                          setClientForm((current) => ({ ...current, status: event.target.value }))
                        }
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </CompactSelect>
                    </div>
                    <div className="sm:col-span-2">
                      <CompactFieldLabel>notes</CompactFieldLabel>
                      <CompactInput
                        value={clientForm.notes}
                        onChange={(event) =>
                          setClientForm((current) => ({ ...current, notes: event.target.value }))
                        }
                        placeholder="Optional note"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <CompactActionButton
                      onClick={handleUpdateClient}
                      disabled={isBusy}
                      className={`px-4 py-2 text-sm shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/30 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                    >
                      {isUpdatingClient ? "Saving..." : "Save client changes"}
                    </CompactActionButton>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Record Bulk Fuel Purchase
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Record a funded fuel purchase. Cashiers will redeem against its reference code later.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <CompactFieldLabel>purchase date</CompactFieldLabel>
                      <CompactInput
                        type="date"
                        value={purchaseForm.purchaseDate}
                        onChange={(event) =>
                          setPurchaseForm((current) => ({
                            ...current,
                            purchaseDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <CompactFieldLabel>fuel product</CompactFieldLabel>
                      <CompactSelect
                        value={purchaseForm.productId}
                        onChange={(event) =>
                          setPurchaseForm((current) => ({
                            ...current,
                            productId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select fuel product</option>
                        {fuelProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </CompactSelect>
                    </div>
                    <div>
                      <CompactFieldLabel>reference code</CompactFieldLabel>
                      <CompactInput
                        value={purchaseForm.referenceCode}
                        onChange={(event) =>
                          setPurchaseForm((current) => ({
                            ...current,
                            referenceCode: event.target.value,
                          }))
                        }
                        placeholder="Optional · auto-generated if blank"
                      />
                    </div>
                    <div>
                      <CompactFieldLabel>purchase amount</CompactFieldLabel>
                      <CompactInput
                        type="number"
                        min="0"
                        step="0.01"
                        value={purchaseForm.purchaseAmount}
                        onChange={(event) =>
                          setPurchaseForm((current) => ({
                            ...current,
                            purchaseAmount: event.target.value,
                          }))
                        }
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <CompactFieldLabel>status</CompactFieldLabel>
                      <CompactSelect
                        value={purchaseForm.status}
                        onChange={(event) =>
                          setPurchaseForm((current) => ({
                            ...current,
                            status: event.target.value,
                          }))
                        }
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="inactive">Inactive</option>
                      </CompactSelect>
                    </div>
                    <div className="sm:col-span-2">
                      <CompactFieldLabel>notes</CompactFieldLabel>
                      <CompactInput
                        value={purchaseForm.notes}
                        onChange={(event) =>
                          setPurchaseForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        placeholder="Optional purchase note"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <CompactActionButton
                      onClick={handleCreatePurchase}
                      disabled={isBusy}
                      className={`px-4 py-2 text-sm shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/30 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                    >
                      {isCreatingPurchase ? "Saving..." : "Create purchase"}
                    </CompactActionButton>
                  </div>
                </div>
              </div>
            }
          />
        </>
      )}
    </DashboardPageShell>
  );
}
