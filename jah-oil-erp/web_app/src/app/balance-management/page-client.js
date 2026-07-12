"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/dashboard/DataTable";
import ToastMessage from "@/components/ui/ToastMessage";
import DashboardPageShell from "@/features/dashboard/page-shell";
import {
  PAGE_SIZE,
  formatCurrency,
  formatDisplayDate,
  formatNumber,
  formatDisplayDateTime,
  paginateItems,
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
  PRIMARY_ACTION_BUTTON_CLASS,
} from "@/features/operations/ui";

import {
  saveManagedBalanceAction,
  settleCreditBalanceAction,
} from "./actions";

const DEFAULT_ACCOUNT_FORM = {
  customerName: "",
  customerPhone: "",
  referenceCode: "",
  stationId: "",
  stationName: "",
  productId: "",
  productName: "",
  productCategory: "all",
  status: "active",
  amount: "",
  adjustmentType: "credit",
  notes: "",
};

const DEFAULT_SETTLEMENT_FORM = {
  amount: "",
  nextPaymentDate: "",
  notes: "",
};

const balanceAccountColumns = [
  {
    key: "customerName",
    label: "Customer",
    render: (row) => (
      <div>
        <p className="font-medium text-slate-900">{row.customerName}</p>
        <p className="text-xs text-slate-500">{row.customerPhone}</p>
      </div>
    ),
  },
  { key: "referenceCode", label: "Reference" },
  { key: "stationNameLabel", label: "Station" },
  {
    key: "productDisplayLabel",
    label: "Product / Category",
  },
  { key: "balanceAmount", label: "Balance", format: "currency" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          row.status === "active"
            ? "bg-emerald-50 text-emerald-700"
            : row.status === "suspended"
              ? "bg-amber-50 text-amber-700"
              : "bg-slate-200 text-slate-700"
        }`}
      >
        {row.statusLabel}
      </span>
    ),
  },
  { key: "updatedAtLabel", label: "Updated" },
];

const creditAccountColumns = [
  {
    key: "customerName",
    label: "Customer",
    render: (row) => (
      <div>
        <p className="font-medium text-slate-900">{row.customerName}</p>
        <p className="text-xs text-slate-500">{row.customerPhone}</p>
      </div>
    ),
  },
  { key: "stationNameLabel", label: "Station" },
  {
    key: "productDisplayLabel",
    label: "Product",
  },
  { key: "balanceAmount", label: "Outstanding", format: "currency" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          row.isOverdue
            ? "bg-rose-50 text-rose-700"
            : row.status === "active"
              ? "bg-emerald-50 text-emerald-700"
              : row.status === "suspended"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-200 text-slate-700"
        }`}
      >
        {row.statusLabel}
      </span>
    ),
  },
  { key: "updatedAtLabel", label: "Date Recorded" },
];

const movementColumns = [
  { key: "movementDateLabel", label: "Date" },
  {
    key: "directionLabel",
    label: "Direction",
    render: (row) => (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          row.direction === "credit"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-rose-50 text-rose-700"
        }`}
      >
        {row.directionLabel}
      </span>
    ),
  },
  {
    key: "amountDeltaLabel",
    label: "Amount",
    render: (row) => row.amountDeltaLabel,
  },
  { key: "balanceAmount", label: "Balance After", format: "currency" },
  { key: "dueDateLabel", label: "Next Payment Date" },
  { key: "actorNameLabel", label: "Recorded By" },
  { key: "notesLabel", label: "Notes" },
];

function formatAccountTypeLabel(value) {
  if (value === "bulk_redeem") {
    return "Bulk Balance";
  }

  if (value === "credit") {
    return "Credit";
  }

  return "Coupon";
}

function formatProductCategoryLabel(value) {
  if (value === "fuel") {
    return "Fuel";
  }

  if (value === "cement") {
    return "Cement";
  }

  if (value === "shop") {
    return "Shop";
  }

  return "All";
}

function formatStatusLabel(value) {
  if (value === "suspended") {
    return "Suspended";
  }

  if (value === "inactive") {
    return "Inactive";
  }

  return "Active";
}

function getTodayDateStringInAccra() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${lookup.year || "0000"}-${lookup.month || "00"}-${lookup.day || "00"}`;
}

function isCreditAccountOverdue(account, todayDateString) {
  const dueDate = `${account?.dueDate || ""}`.trim().slice(0, 10);

  if (
    !dueDate ||
    account?.accountType !== "credit" ||
    Number(account?.balanceAmount || 0) <= 0
  ) {
    return false;
  }

  return dueDate < todayDateString;
}

function buildSummaryCards(accounts, activeView) {
  const activeAccounts = accounts.filter((account) => account.status === "active");
  const overdueAccounts = accounts.filter((account) => account.isOverdue).length;
  const totalBalance = accounts.reduce(
    (sum, account) => sum + Number(account.balanceAmount || 0),
    0,
  );
  const suspendedAccounts = accounts.filter(
    (account) => account.status === "suspended",
  ).length;

  return [
    {
      title: activeView === "credit" ? "Credit Accounts" : "Balance Accounts",
      value: formatNumber(accounts.length),
      icon: activeView === "credit" ? "🧾" : "👥",
    },
    {
      title: activeView === "credit" ? "Outstanding Total" : "Available Total",
      value: formatCurrency(totalBalance),
      icon: activeView === "credit" ? "💰" : "🏦",
    },
    {
      title: activeView === "credit" ? "Active / Overdue" : "Active / Suspended",
      value:
        activeView === "credit"
          ? `${formatNumber(activeAccounts.length)} / ${formatNumber(overdueAccounts)}`
          : `${formatNumber(activeAccounts.length)} / ${formatNumber(suspendedAccounts)}`,
      icon: "📌",
    },
  ];
}

function buildDetailCards(
  account,
  nextPaymentDate = "",
  creditSaleAmount = 0,
) {
  if (!account) {
    return [];
  }

  return [
    {
      title: "Current Balance",
      value: formatCurrency(account.balanceAmount),
      //icon: "💵",
    },
    {
      title: "Sale Amount",
      value: formatCurrency(
        Number.isFinite(Number(creditSaleAmount))
          ? Number(creditSaleAmount || 0)
          : Number(account.balanceAmount || 0),
      ),
    },
    {
      title: "Next Due Date",
      value:
        Number(account.balanceAmount || 0) <= 0
          ? "Paid"
          : nextPaymentDate
            ? formatDisplayDate(nextPaymentDate)
            : account.dueDate
              ? formatDisplayDate(account.dueDate)
              : "Not set",
      //icon: "🧮",
    },
  ];
}

function buildDefaultAccountForm(activeView) {
  return {
    ...DEFAULT_ACCOUNT_FORM,
    adjustmentType: "credit",
    productCategory: activeView === "bulk_redeem" ? "fuel" : "all",
  };
}

function buildAccountFormFromRecord(account) {
  return {
    customerName: account.customerName || "",
    customerPhone: account.customerPhone || "",
    referenceCode: account.referenceCode || "",
    stationId: account.stationId || "",
    stationName: account.stationName || "",
    productId: account.productId || "",
    productName: account.productName || "",
    productCategory: account.productCategory || "all",
    status: account.status || "active",
    amount: "",
    adjustmentType: "credit",
    notes: account.notes || "",
  };
}

export default function BalanceManagementPageClient({
  balanceAccounts,
  movementRecords,
  stations,
  products,
  shellProps,
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const activeView = "credit";
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isCreatingNewAccount, setIsCreatingNewAccount] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [stationFilter, setStationFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [accountsPage, setAccountsPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [feedback, setFeedback] = useState(null);
  const [accountForm, setAccountForm] = useState(DEFAULT_ACCOUNT_FORM);
  const [settlementForm, setSettlementForm] = useState(DEFAULT_SETTLEMENT_FORM);
  const [todayDateString, setTodayDateString] = useState("");

  useEffect(() => {
    setTodayDateString(getTodayDateStringInAccra());
  }, []);

  const movementProductNamesByAccountId = useMemo(() => {
    const lookup = new Map();

    for (const record of movementRecords) {
      const accountId = `${record?.accountId || ""}`.trim();
      const productName = `${record?.productName || ""}`.trim();

      if (!accountId || !productName || lookup.has(accountId)) {
        continue;
      }

      lookup.set(accountId, productName);
    }

    return lookup;
  }, [movementRecords]);

  const accountRows = useMemo(
    () =>
      balanceAccounts.map((account) => {
        const isOverdue = isCreditAccountOverdue(account, todayDateString);
        const derivedProductName =
          account.productName || movementProductNamesByAccountId.get(account.id) || "";

        return {
          ...account,
          isOverdue,
          accountTypeLabel: formatAccountTypeLabel(account.accountType),
          productCategoryLabel: formatProductCategoryLabel(account.productCategory),
          productDisplayLabel: derivedProductName || "—",
          statusLabel: isOverdue ? "Overdue" : formatStatusLabel(account.status),
          updatedAtLabel: formatDisplayDateTime(account.updatedAt || account.createdAt),
          stationNameLabel: account.stationName || "All stations",
        };
      }),
    [balanceAccounts, movementProductNamesByAccountId, todayDateString],
  );

  const scopedAccounts = useMemo(
    () => accountRows.filter((account) => account.accountType === activeView),
    [accountRows, activeView],
  );

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return scopedAccounts.filter((account) => {
      if (stationFilter !== "All" && account.stationId !== stationFilter) {
        return false;
      }

      if (statusFilter === "overdue" && !account.isOverdue) {
        return false;
      }

      if (
        statusFilter !== "All" &&
        statusFilter !== "overdue" &&
        account.status !== statusFilter
      ) {
        return false;
      }

      if (categoryFilter !== "All" && account.productCategory !== categoryFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        account.customerName,
        account.customerPhone,
        account.referenceCode,
        account.stationName,
        account.productName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [categoryFilter, scopedAccounts, searchTerm, stationFilter, statusFilter]);

  const selectedAccount = useMemo(
    () =>
      filteredAccounts.find((account) => account.id === selectedAccountId) ||
      scopedAccounts.find((account) => account.id === selectedAccountId) ||
      null,
    [filteredAccounts, scopedAccounts, selectedAccountId],
  );

  const selectedAccountMovements = useMemo(
    () =>
      movementRecords
        .filter((record) => record.accountId === selectedAccountId)
        .map((record) => ({
          ...record,
          movementDateLabel: formatDisplayDateTime(record.movementDate),
          directionLabel: record.direction === "credit" ? "Credit" : "Debit",
          amountDeltaLabel: `${record.amountDelta >= 0 ? "+" : "-"}${formatCurrency(
            Math.abs(Number(record.amountDelta || 0)),
          )}`,
          dueDateLabel: record.dueDate
            ? formatDisplayDate(record.dueDate)
            : "—",
          actorNameLabel: record.actorName || "System",
          notesLabel:
            record.notes ||
            record.receiptNumber ||
            record.referenceCode ||
            "—",
        })),
    [movementRecords, selectedAccountId],
  );

  const latestMovementDueDate = useMemo(
    () =>
      selectedAccountMovements.find((record) => `${record.dueDate || ""}`.trim())
        ?.dueDate || "",
    [selectedAccountMovements],
  );

  const selectedAccountCreditSaleAmount = useMemo(
    () =>
      selectedAccountMovements
        .filter((record) => record.direction === "credit")
        .reduce((sum, record) => sum + Math.abs(Number(record.amountDelta || 0)), 0),
    [selectedAccountMovements],
  );

  const paginatedAccounts = useMemo(
    () => paginateItems(filteredAccounts, accountsPage, PAGE_SIZE),
    [accountsPage, filteredAccounts],
  );

  const paginatedMovements = useMemo(
    () => paginateItems(selectedAccountMovements, movementPage, PAGE_SIZE),
    [movementPage, selectedAccountMovements],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(scopedAccounts, activeView),
    [activeView, scopedAccounts],
  );

  const detailCards = useMemo(
    () =>
      buildDetailCards(
        selectedAccount,
        latestMovementDueDate,
        selectedAccountCreditSaleAmount,
      ),
    [latestMovementDueDate, selectedAccount, selectedAccountCreditSaleAmount],
  );

  useEffect(() => {
    setSelectedAccountId("");
    setIsCreatingNewAccount(false);
    setAccountsPage(1);
    setMovementPage(1);
    setFeedback(null);
    setAccountForm(buildDefaultAccountForm(activeView));
    setSettlementForm(DEFAULT_SETTLEMENT_FORM);
  }, [activeView]);

  useEffect(() => {
    if (isCreatingNewAccount || activeView === "credit") {
      return;
    }

    if (!selectedAccount) {
      setAccountForm(buildDefaultAccountForm(activeView));
      return;
    }

    setAccountForm(buildAccountFormFromRecord(selectedAccount));
  }, [activeView, isCreatingNewAccount, selectedAccount]);

  useEffect(() => {
    setMovementPage(1);
  }, [selectedAccountId]);

  function updateAccountForm(key, value) {
    setAccountForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetFilters() {
    setSearchTerm("");
    setStationFilter("All");
    setStatusFilter("All");
    setCategoryFilter("All");
    setAccountsPage(1);
    setFeedback(null);
  }

  function startNewAccount() {
    setIsCreatingNewAccount(true);
    setSelectedAccountId("");
    setFeedback(null);
    setAccountForm(buildDefaultAccountForm(activeView));
  }

  function resetEditor() {
    setFeedback(null);

    if (selectedAccount && !isCreatingNewAccount) {
      setAccountForm(buildAccountFormFromRecord(selectedAccount));
      return;
    }

    setAccountForm(buildDefaultAccountForm(activeView));
    setSettlementForm(DEFAULT_SETTLEMENT_FORM);
  }

  function handleSaveManagedBalance() {
    setFeedback(null);

    startTransition(async () => {
      const stationRecord =
        stations.find((station) => station.id === accountForm.stationId) || null;
      const productRecord =
        products.find((product) => product.id === accountForm.productId) || null;
      const result = await saveManagedBalanceAction({
        accountId: isCreatingNewAccount ? "" : selectedAccount?.id || "",
        accountType: activeView,
        customerName: accountForm.customerName,
        customerPhone: accountForm.customerPhone,
        referenceCode: accountForm.referenceCode,
        stationId: accountForm.stationId,
        stationName: stationRecord?.name || accountForm.stationName || "",
        productId: accountForm.productId,
        productName: productRecord?.name || accountForm.productName || "",
        productCategory: accountForm.productCategory,
        status: accountForm.status,
        amount: accountForm.amount,
        adjustmentType: accountForm.adjustmentType,
        notes: accountForm.notes,
      });

      setFeedback(result);

      if (result?.success) {
        setIsCreatingNewAccount(false);
        setSelectedAccountId(result.accountId || "");
        setAccountForm(buildDefaultAccountForm(activeView));
        router.refresh();
      }
    });
  }

  function handleSettleCredit() {
    if (!selectedAccount) {
      return;
    }

    setFeedback(null);

    startTransition(async () => {
      const result = await settleCreditBalanceAction({
        accountId: selectedAccount.id,
        amount: settlementForm.amount,
        nextPaymentDate: settlementForm.nextPaymentDate,
        notes: settlementForm.notes,
      });

      setFeedback(result);

      if (result?.success) {
        setSelectedAccountId(result.accountId || selectedAccount.id);
        setSettlementForm(DEFAULT_SETTLEMENT_FORM);
        router.refresh();
      }
    });
  }

  const canManageBalances = activeView !== "credit";
  const currentColumns =
    activeView === "credit" ? creditAccountColumns : balanceAccountColumns;
  const pageTitle =
    activeView === "bulk_redeem" ? "Bulk Balances" : "Credit Accounts";
  const settlementAmountValue = Number(settlementForm.amount || 0);
  const selectedOutstandingBalance = Number(selectedAccount?.balanceAmount || 0);
  const requiresNextPaymentDate =
    selectedAccount &&
    Number.isFinite(settlementAmountValue) &&
    settlementAmountValue > 0 &&
    settlementAmountValue < selectedOutstandingBalance;

  return (
    <DashboardPageShell
      title="Credit Settlements"
      description="Review customer credit accounts, track outstanding balances, and record settlements."
      {...shellProps}
    >
      <CompactFilterCard
        //helperText="Filter credit accounts by customer, branch, status, or category."
        actions={
          <>
            {canManageBalances ? (
              <CompactActionButton
                onClick={startNewAccount}
                className={`px-4 py-2 text-sm shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/30 ${PRIMARY_ACTION_BUTTON_CLASS}`}
              >
                New bulk balance
              </CompactActionButton>
            ) : null}
            <CompactActionButton onClick={resetFilters}>
              Reset filters
            </CompactActionButton>
          </>
        }
        columnsClass="lg:grid-cols-4"
      >
        <div>
          <CompactFieldLabel htmlFor="balanceSearch">search</CompactFieldLabel>
          <CompactInput
            id="balanceSearch"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setAccountsPage(1);
            }}
            placeholder="Customer, phone, reference, station"
          />
        </div>
        <div>
          <CompactFieldLabel htmlFor="balanceStationFilter">station</CompactFieldLabel>
          <CompactSelect
            id="balanceStationFilter"
            value={stationFilter}
            onChange={(event) => {
              setStationFilter(event.target.value);
              setAccountsPage(1);
            }}
          >
            <option value="All">All</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </CompactSelect>
        </div>
        <div>
          <CompactFieldLabel htmlFor="balanceStatusFilter">status</CompactFieldLabel>
          <CompactSelect
            id="balanceStatusFilter"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setAccountsPage(1);
            }}
          >
            <option value="All">All</option>
            <option value="active">Active</option>
            <option value="overdue">Overdue</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </CompactSelect>
        </div>
        <div>
          <CompactFieldLabel htmlFor="balanceCategoryFilter">category</CompactFieldLabel>
          <CompactSelect
            id="balanceCategoryFilter"
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              setAccountsPage(1);
            }}
          >
            <option value="All">All</option>
            <option value="fuel">Fuel</option>
            <option value="shop">Shop</option>
            <option value="cement">Cement</option>
            <option value="all">All Products</option>
          </CompactSelect>
        </div>
      </CompactFilterCard>

      <ToastMessage
        message={feedback?.message || ""}
        tone={feedback?.success ? "success" : feedback ? "error" : "info"}
        onClose={() => setFeedback(null)}
      />

      <CompactSummaryCards items={summaryCards} fullRow />

      <CompactSplitPanel
        className="gap-6"
        left={
          <div className="space-y-4">
            <DataTable
              columns={currentColumns}
              data={paginatedAccounts}
              title={pageTitle}
              subtitle={
                activeView === "credit"
                  ? "Select a credit account to review its movement history and record settlements."
                  : "Select an account to review balance movements or adjust metadata and available balance."
              }
              onRowClick={(row) => {
                setSelectedAccountId(row.id);
                setIsCreatingNewAccount(false);
                setFeedback(null);
              }}
              selectedRowKey={selectedAccountId}
              getRowClassName={(row) =>
                row.isOverdue ? "border-l-4 border-l-rose-300" : ""
              }
            />

            <PaginationSummary
              currentPage={accountsPage}
              totalItems={filteredAccounts.length}
              pageSize={PAGE_SIZE}
              label={activeView === "credit" ? "credit accounts" : "balance accounts"}
            />
            <PaginationControls
              currentPage={accountsPage}
              totalItems={filteredAccounts.length}
              pageSize={PAGE_SIZE}
              onPageChange={setAccountsPage}
            />
          </div>
        }
        right={
          <div className="space-y-4">
            {selectedAccount ? (
              <CompactSummaryCards items={detailCards} fullRow />
            ) : null}

            {canManageBalances ? (
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {isCreatingNewAccount || !selectedAccount
                        ? "Create Bulk Balance"
                        : "Adjust Bulk Balance"}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Use amount 0 to update details or status only.
                    </p>
                  </div>
                  {selectedAccount && !isCreatingNewAccount ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {selectedAccount.referenceCode}
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <CompactFieldLabel>customer name</CompactFieldLabel>
                    <CompactInput
                      value={accountForm.customerName}
                      onChange={(event) =>
                        updateAccountForm("customerName", event.target.value)
                      }
                      placeholder="Customer name"
                    />
                  </div>
                  <div>
                    <CompactFieldLabel>customer phone</CompactFieldLabel>
                    <CompactInput
                      value={accountForm.customerPhone}
                      onChange={(event) =>
                        updateAccountForm("customerPhone", event.target.value)
                      }
                      placeholder="Customer phone"
                    />
                  </div>
                  <div>
                    <CompactFieldLabel>reference code</CompactFieldLabel>
                    <CompactInput
                      value={accountForm.referenceCode}
                      onChange={(event) =>
                        updateAccountForm("referenceCode", event.target.value)
                      }
                      placeholder={
                        activeView === "bulk_redeem"
                          ? "Bulk balance code"
                          : "Reference code"
                      }
                    />
                  </div>
                  <div>
                    <CompactFieldLabel>station</CompactFieldLabel>
                    <CompactSelect
                      value={accountForm.stationId}
                      onChange={(event) => {
                        const stationRecord =
                          stations.find((station) => station.id === event.target.value) ||
                          null;
                        setAccountForm((current) => ({
                          ...current,
                          stationId: event.target.value,
                          stationName: stationRecord?.name || "",
                        }));
                      }}
                    >
                      <option value="">All stations</option>
                      {stations.map((station) => (
                        <option key={station.id} value={station.id}>
                          {station.name}
                        </option>
                      ))}
                    </CompactSelect>
                  </div>
                  {activeView === "bulk_redeem" ? (
                    <div>
                      <CompactFieldLabel>product</CompactFieldLabel>
                      <CompactSelect
                        value={accountForm.productId}
                        onChange={(event) => {
                          const productRecord =
                            products.find(
                              (product) => product.id === event.target.value,
                            ) || null;
                          setAccountForm((current) => ({
                            ...current,
                            productId: event.target.value,
                            productName: productRecord?.name || "",
                            productCategory: productRecord?.category || current.productCategory,
                          }));
                        }}
                      >
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </CompactSelect>
                    </div>
                  ) : (
                    <div>
                      <CompactFieldLabel>category</CompactFieldLabel>
                      <CompactSelect
                        value={accountForm.productCategory}
                        onChange={(event) =>
                          updateAccountForm("productCategory", event.target.value)
                        }
                      >
                        <option value="all">All Products</option>
                        <option value="fuel">Fuel</option>
                        <option value="shop">Shop</option>
                        <option value="cement">Cement</option>
                      </CompactSelect>
                    </div>
                  )}
                  <div>
                    <CompactFieldLabel>status</CompactFieldLabel>
                    <CompactSelect
                      value={accountForm.status}
                      onChange={(event) =>
                        updateAccountForm("status", event.target.value)
                      }
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="inactive">Inactive</option>
                    </CompactSelect>
                  </div>
                  <div>
                    <CompactFieldLabel>adjustment type</CompactFieldLabel>
                    <CompactSelect
                      value={accountForm.adjustmentType}
                      onChange={(event) =>
                        updateAccountForm("adjustmentType", event.target.value)
                      }
                    >
                      <option value="credit">Add balance</option>
                      <option value="debit">Deduct balance</option>
                    </CompactSelect>
                  </div>
                  <div>
                    <CompactFieldLabel>amount</CompactFieldLabel>
                    <CompactInput
                      type="number"
                      min="0"
                      step="0.01"
                      value={accountForm.amount}
                      onChange={(event) =>
                        updateAccountForm("amount", event.target.value)
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <CompactFieldLabel>notes</CompactFieldLabel>
                    <CompactInput
                      value={accountForm.notes}
                      onChange={(event) => updateAccountForm("notes", event.target.value)}
                      placeholder="Internal notes for this balance"
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <CompactActionButton
                    onClick={handleSaveManagedBalance}
                    disabled={isPending}
                    className={`px-4 py-2 text-sm shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/30 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                  >
                    {isPending
                      ? "Saving..."
                      : isCreatingNewAccount || !selectedAccount
                        ? "Create balance"
                        : "Save changes"}
                  </CompactActionButton>
                  <CompactActionButton onClick={resetEditor}>
                    Reset editor
                  </CompactActionButton>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Record Credit Settlement
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Select a credit account, then record the amount paid down.
                  </p>
                </div>

                {selectedAccount ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {selectedAccount.customerName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedAccount.customerPhone}
                        {selectedAccount.stationName
                          ? ` · ${selectedAccount.stationName}`
                          : ""}
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <CompactFieldLabel>settlement amount</CompactFieldLabel>
                        <CompactInput
                          type="number"
                          min="0"
                          step="0.01"
                          value={settlementForm.amount}
                          onChange={(event) =>
                            setSettlementForm((current) => ({
                              ...current,
                              amount: event.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <CompactFieldLabel>current outstanding</CompactFieldLabel>
                        <CompactInput
                          value={formatCurrency(selectedAccount.balanceAmount)}
                          disabled
                        />
                      </div>
                      {requiresNextPaymentDate ? (
                        <div>
                          <CompactFieldLabel>next payment date</CompactFieldLabel>
                          <CompactInput
                            type="date"
                            value={settlementForm.nextPaymentDate}
                            onChange={(event) =>
                              setSettlementForm((current) => ({
                                ...current,
                                nextPaymentDate: event.target.value,
                              }))
                            }
                          />
                        </div>
                      ) : null}
                      <div className="sm:col-span-2">
                        <CompactFieldLabel>notes</CompactFieldLabel>
                        <CompactInput
                          value={settlementForm.notes}
                          onChange={(event) =>
                            setSettlementForm((current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                          placeholder="Settlement note or receipt reference"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <CompactActionButton
                        onClick={handleSettleCredit}
                        disabled={isPending}
                        className={`px-4 py-2 text-sm shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/30 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                      >
                        {isPending ? "Saving..." : "Record settlement"}
                      </CompactActionButton>
                      <CompactActionButton onClick={resetEditor}>
                        Reset editor
                      </CompactActionButton>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Select a credit account from the table to record a settlement.
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <DataTable
                columns={movementColumns}
                data={paginatedMovements}
                title={
                  selectedAccount
                    ? `${selectedAccount.customerName} Movement History`
                    : "Movement History"
                }
                subtitle={
                  selectedAccount
                    ? "Latest settlements appear first"
                    : "Select an account to view its balance movement history."
                }
              />

              {selectedAccount ? (
                <>
                  <PaginationSummary
                    currentPage={movementPage}
                    totalItems={selectedAccountMovements.length}
                    pageSize={PAGE_SIZE}
                    label="movement records"
                  />
                  <PaginationControls
                    currentPage={movementPage}
                    totalItems={selectedAccountMovements.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setMovementPage}
                  />
                </>
              ) : null}
            </div>
          </div>
        }
      />
    </DashboardPageShell>
  );
}
