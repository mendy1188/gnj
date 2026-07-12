"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/dashboard/DataTable";
import ToastMessage from "@/components/ui/ToastMessage";
import DashboardPageShell from "@/features/dashboard/page-shell";
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
  createCouponCompanyAction,
  createCouponPurchaseAction,
  generateCouponsForPurchaseAction,
  updateCouponCompanyAction,
} from "./actions";

const DEFAULT_COMPANY_FORM = {
  name: "",
  dateJoined: "",
  status: "active",
  notes: "",
};

const DEFAULT_PURCHASE_FORM = {
  purchaseDate: "",
  totalAmount: "",
  notes: "",
};

const DEFAULT_COUPON_FORM = {
  couponCount: "",
  couponValue: "",
  notes: "",
};

const PURCHASE_STATUS_OPTIONS = [
  "all",
  "draft",
  "active",
  "partially_redeemed",
  "redeemed",
  "cancelled",
];

const COUPON_STATUS_OPTIONS = [
  "all",
  "active",
  "partially_redeemed",
  "redeemed",
  "cancelled",
  "expired",
];

const companyColumns = [
  { key: "name", label: "Company / Organization" },
  { key: "dateJoinedLabel", label: "Date Joined" },
  { key: "purchaseCount", label: "Purchases", format: "number" },
  { key: "activeCouponCount", label: "Active Coupons", format: "number" },
  { key: "availableBalance", label: "Available", format: "currency" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => (
      <StatusBadge
        tone={row.status === "active" ? "active" : "inactive"}
        label={row.statusLabel}
      />
    ),
  },
];

const purchaseColumns = [
  { key: "purchaseDateLabel", label: "Purchase Date" },
  { key: "purchaseReference", label: "Reference" },
  { key: "totalAmount", label: "Purchase Amount", format: "currency" },
  { key: "generatedTotalValue", label: "Generated", format: "currency" },
  { key: "availableToGenerate", label: "Unallocated", format: "currency" },
  { key: "couponCount", label: "Coupons", format: "number" },
  { key: "remainingTotalValue", label: "Coupon Balance", format: "currency" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => (
      <StatusBadge
        tone={getCouponStatusTone(row.status)}
        label={row.statusLabel}
      />
    ),
  },
];

const couponColumns = [
  { key: "code", label: "Coupon Code" },
  { key: "faceValue", label: "Value", format: "currency" },
  { key: "remainingValue", label: "Remaining", format: "currency" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => (
      <StatusBadge
        tone={getCouponStatusTone(row.status)}
        label={row.statusLabel}
      />
    ),
  },
  { key: "createdAtLabel", label: "Created" },
  { key: "lastUsedAtLabel", label: "Last Used" },
];

function StatusBadge({ tone, label }) {
  const className =
    tone === "active"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "bg-rose-50 text-rose-700"
          : "bg-slate-200 text-slate-700";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function formatStatusLabel(value) {
  if (value === "partially_redeemed") {
    return "Partially Redeemed";
  }

  if (value === "redeemed") {
    return "Redeemed";
  }

  if (value === "cancelled") {
    return "Cancelled";
  }

  if (value === "expired") {
    return "Expired";
  }

  if (value === "inactive") {
    return "Inactive";
  }

  return value === "draft" ? "Draft" : "Active";
}

function getCouponStatusTone(status) {
  if (status === "active") {
    return "active";
  }

  if (status === "partially_redeemed" || status === "draft") {
    return "warning";
  }

  if (status === "redeemed" || status === "cancelled" || status === "expired") {
    return "inactive";
  }

  return "inactive";
}

function getCouponStatusRank(status) {
  if (status === "active") {
    return 0;
  }

  if (status === "partially_redeemed") {
    return 1;
  }

  if (status === "draft") {
    return 2;
  }

  if (status === "redeemed") {
    return 3;
  }

  return 4;
}

function buildGlobalSummaryCards(companies, purchases, coupons) {
  const activeCoupons = coupons.filter((coupon) =>
    ["active", "partially_redeemed"].includes(coupon.status),
  );
  const totalAvailable = activeCoupons.reduce(
    (sum, coupon) => sum + Number(coupon.remainingValue || 0),
    0,
  );

  return [
    {
      title: "Companies",
      value: companies.length.toLocaleString(),
      icon: "🏢",
    },
    {
      title: "Coupon Purchases",
      value: purchases.length.toLocaleString(),
      icon: "🧾",
    },
    {
      title: "Active Coupon Value",
      value: formatCurrency(totalAvailable),
      icon: "🎟️",
    },
  ];
}

function buildCompanySummaryCards(company, purchases, coupons) {
  const companyPurchases = purchases.filter(
    (purchase) => purchase.companyId === company.id,
  );
  const companyCoupons = coupons.filter((coupon) => coupon.companyId === company.id);
  const activeCoupons = companyCoupons.filter((coupon) =>
    ["active", "partially_redeemed"].includes(coupon.status),
  );
  const availableBalance = activeCoupons.reduce(
    (sum, coupon) => sum + Number(coupon.remainingValue || 0),
    0,
  );

  return [
    {
      title: "Purchases",
      value: companyPurchases.length.toLocaleString(),
      icon: "🧾",
    },
    {
      title: "Active Coupons",
      value: activeCoupons.length.toLocaleString(),
      icon: "🎟️",
    },
    {
      title: "Available Value",
      value: formatCurrency(availableBalance),
      icon: "💰",
    },
  ];
}

function buildPurchaseSummaryCards(purchase, coupons) {
  const purchaseCoupons = coupons.filter((coupon) => coupon.purchaseId === purchase.id);
  const availableCoupons = purchaseCoupons.filter((coupon) =>
    ["active", "partially_redeemed"].includes(coupon.status),
  );
  const couponBalance = availableCoupons.reduce(
    (sum, coupon) => sum + Number(coupon.remainingValue || 0),
    0,
  );
  const generatedTotalValue = Number(purchase.generatedTotalValue || 0);
  const availableToGenerate = Number(
    Math.max(0, Number(purchase.totalAmount || 0) - generatedTotalValue).toFixed(2),
  );

  return [
    {
      title: "Purchase Amount",
      value: formatCurrency(purchase.totalAmount),
      icon: "💵",
    },
    {
      title: "Coupons Created",
      value: purchaseCoupons.length.toLocaleString(),
      icon: "🔢",
    },
    {
      title: "Generated So Far",
      value: formatCurrency(generatedTotalValue),
      icon: "🧾",
    },
    {
      title: "Available to Generate",
      value: formatCurrency(availableToGenerate),
      icon: "➕",
    },
    {
      title: "Coupon Balance",
      value: formatCurrency(couponBalance),
      icon: "🏦",
    },
  ];
}

function buildCompanyForm(company) {
  if (!company) {
    return DEFAULT_COMPANY_FORM;
  }

  return {
    name: company.name || "",
    dateJoined: company.dateJoined || "",
    status: company.status || "active",
    notes: company.notes || "",
  };
}

function getAvailableCouponGenerationAmount(purchase) {
  if (!purchase) {
    return 0;
  }

  return Number(
    Math.max(
      0,
      Number(purchase.totalAmount || 0) - Number(purchase.generatedTotalValue || 0),
    ).toFixed(2),
  );
}

function matchesStatusFilter(status, filterValue) {
  return filterValue === "all" || `${status || ""}` === filterValue;
}

export default function CouponPurchasesPageClient({
  companies,
  purchases,
  coupons,
  shellProps,
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState("all");
  const [couponStatusFilter, setCouponStatusFilter] = useState("all");
  const [companyPage, setCompanyPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [couponPage, setCouponPage] = useState(1);
  const [feedback, setFeedback] = useState(null);
  const [companyForm, setCompanyForm] = useState(DEFAULT_COMPANY_FORM);
  const [purchaseForm, setPurchaseForm] = useState(DEFAULT_PURCHASE_FORM);
  const [couponForm, setCouponForm] = useState(DEFAULT_COUPON_FORM);
  const normalizedCompanySearch = companySearch.trim().toLowerCase();

  const companyRows = useMemo(
    () =>
      companies
        .map((company) => {
          const companyPurchases = purchases.filter(
            (purchase) => purchase.companyId === company.id,
          );
          const companyCoupons = coupons.filter(
            (coupon) => coupon.companyId === company.id,
          );
          const activeCoupons = companyCoupons.filter((coupon) =>
            ["active", "partially_redeemed"].includes(coupon.status),
          );

          return {
            ...company,
            dateJoinedLabel: formatDisplayDate(company.dateJoined),
            statusLabel: formatStatusLabel(company.status),
            purchaseCount: companyPurchases.length,
            activeCouponCount: activeCoupons.length,
            availableBalance: activeCoupons.reduce(
              (sum, coupon) => sum + Number(coupon.remainingValue || 0),
              0,
            ),
          };
        })
        .filter((company) =>
          normalizedCompanySearch
            ? `${company.name || ""}`.toLowerCase().includes(normalizedCompanySearch)
            : true,
        )
        .sort(
          (left, right) =>
            right.activeCouponCount - left.activeCouponCount ||
            `${right.dateJoined || ""}`.localeCompare(`${left.dateJoined || ""}`) ||
            left.name.localeCompare(right.name),
        ),
    [companies, coupons, normalizedCompanySearch, purchases],
  );

  const selectedCompany = useMemo(
    () => companyRows.find((company) => company.id === selectedCompanyId) || null,
    [companyRows, selectedCompanyId],
  );

  const purchaseRows = useMemo(() => {
    if (!selectedCompany) {
      return [];
    }

    return purchases
      .filter((purchase) => purchase.companyId === selectedCompany.id)
      .filter((purchase) => matchesStatusFilter(purchase.status, purchaseStatusFilter))
      .map((purchase) => {
        const availableToGenerate = getAvailableCouponGenerationAmount(purchase);

        return {
          ...purchase,
          availableToGenerate,
          purchaseDateLabel: formatDisplayDate(purchase.purchaseDate),
          statusLabel: formatStatusLabel(purchase.status),
        };
      })
      .sort(
        (left, right) =>
          getCouponStatusRank(left.status) - getCouponStatusRank(right.status) ||
          `${right.purchaseDate || ""}`.localeCompare(`${left.purchaseDate || ""}`) ||
          `${right.createdAt || ""}`.localeCompare(`${left.createdAt || ""}`),
      );
  }, [purchaseStatusFilter, purchases, selectedCompany]);

  const selectedPurchase = useMemo(
    () => purchaseRows.find((purchase) => purchase.id === selectedPurchaseId) || null,
    [purchaseRows, selectedPurchaseId],
  );

  const couponRows = useMemo(() => {
    if (!selectedPurchase) {
      return [];
    }

    return coupons
      .filter((coupon) => coupon.purchaseId === selectedPurchase.id)
      .filter((coupon) => matchesStatusFilter(coupon.status, couponStatusFilter))
      .map((coupon) => ({
        ...coupon,
        statusLabel: formatStatusLabel(coupon.status),
        createdAtLabel: formatDisplayDateTime(coupon.createdAt),
        lastUsedAtLabel: coupon.lastUsedAt
          ? formatDisplayDateTime(coupon.lastUsedAt)
          : "Never",
      }))
      .sort(
        (left, right) =>
          getCouponStatusRank(left.status) - getCouponStatusRank(right.status) ||
          `${right.createdAt || ""}`.localeCompare(`${left.createdAt || ""}`) ||
          left.code.localeCompare(right.code),
      );
  }, [couponStatusFilter, coupons, selectedPurchase]);

  const paginatedCompanies = useMemo(
    () => paginateItems(companyRows, companyPage, PAGE_SIZE),
    [companyPage, companyRows],
  );
  const paginatedPurchases = useMemo(
    () => paginateItems(purchaseRows, purchasePage, PAGE_SIZE),
    [purchasePage, purchaseRows],
  );
  const paginatedCoupons = useMemo(
    () => paginateItems(couponRows, couponPage, PAGE_SIZE),
    [couponPage, couponRows],
  );

  const globalSummaryCards = useMemo(
    () => buildGlobalSummaryCards(companies, purchases, coupons),
    [companies, coupons, purchases],
  );
  const companySummaryCards = useMemo(
    () =>
      selectedCompany
        ? buildCompanySummaryCards(selectedCompany, purchases, coupons)
        : [],
    [coupons, purchases, selectedCompany],
  );
  const purchaseSummaryCards = useMemo(
    () =>
      selectedPurchase ? buildPurchaseSummaryCards(selectedPurchase, coupons) : [],
    [coupons, selectedPurchase],
  );
  const selectedPurchaseAvailableToGenerate = useMemo(
    () => getAvailableCouponGenerationAmount(selectedPurchase),
    [selectedPurchase],
  );
  const couponBatchTotal = useMemo(
    () =>
      Number(
        (
          Number(couponForm.couponCount || 0) * Number(couponForm.couponValue || 0)
        ).toFixed(2),
      ),
    [couponForm.couponCount, couponForm.couponValue],
  );

  useEffect(() => {
    setCompanyForm(buildCompanyForm(selectedCompany));
  }, [selectedCompany]);

  useEffect(() => {
    setSelectedPurchaseId("");
    setPurchasePage(1);
    setCouponPage(1);
    setPurchaseForm(DEFAULT_PURCHASE_FORM);
    setCouponForm(DEFAULT_COUPON_FORM);
    setFeedback(null);
  }, [selectedCompanyId]);

  useEffect(() => {
    setCompanyPage(1);
  }, [companySearch]);

  useEffect(() => {
    setPurchasePage(1);
  }, [purchaseStatusFilter, selectedCompanyId]);

  useEffect(() => {
    setCouponPage(1);
  }, [couponStatusFilter, selectedPurchaseId]);

  const isBusy = Boolean(pendingAction);
  const isCreatingCompany = pendingAction === "create-company";
  const isUpdatingCompany = pendingAction === "update-company";
  const isCreatingPurchase = pendingAction === "create-purchase";
  const isCreatingCoupons = pendingAction === "create-coupons";

  async function handleCreateCompany() {
    setFeedback(null);
    setPendingAction("create-company");

    try {
      const result = await createCouponCompanyAction(companyForm);
      setFeedback(result);

      if (result?.success) {
        setCompanyForm(DEFAULT_COMPANY_FORM);
        setCompanyPage(1);
        router.refresh();
      }
    } finally {
      setPendingAction("");
    }
  }

  async function handleUpdateCompany() {
    if (!selectedCompany) {
      return;
    }

    setFeedback(null);
    setPendingAction("update-company");

    try {
      const result = await updateCouponCompanyAction({
        companyId: selectedCompany.id,
        ...companyForm,
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
    if (!selectedCompany) {
      return;
    }

    setFeedback(null);
    setPendingAction("create-purchase");

    try {
      const result = await createCouponPurchaseAction({
        companyId: selectedCompany.id,
        ...purchaseForm,
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

  async function handleGenerateCoupons() {
    if (!selectedPurchase) {
      return;
    }

    setFeedback(null);
    setPendingAction("create-coupons");

    try {
      const result = await generateCouponsForPurchaseAction({
        purchaseId: selectedPurchase.id,
        ...couponForm,
      });
      setFeedback(result);

      if (result?.success) {
        setCouponForm(DEFAULT_COUPON_FORM);
        router.refresh();
      }
    } finally {
      setPendingAction("");
    }
  }

  return (
    <DashboardPageShell
      title="Purchase Coupons"
      description="Create coupon companies, record coupon purchases, and generate individual coupon codes for redemption in POS."
      {...shellProps}
    >
      <ToastMessage
        message={feedback?.message || ""}
        tone={feedback?.success ? "success" : feedback ? "error" : "info"}
        onClose={() => setFeedback(null)}
      />

      {!selectedCompany ? (
        <>
          <CompactSummaryCards items={globalSummaryCards} fullRow />

          <CompactSplitPanel
            className="gap-6"
            left={
              <div className="space-y-4">
                <DataTable
                  columns={companyColumns}
                  data={paginatedCompanies}
                  title="Companies / Organizations"
                  subtitle="Select a company to manage coupon purchases and generate coupon codes."
                  headerContent={
                    <div className="ml-auto min-w-[220px] lg:max-w-[280px]">
                      <CompactFieldLabel>company search</CompactFieldLabel>
                      <CompactInput
                        value={companySearch}
                        onChange={(event) => setCompanySearch(event.target.value)}
                        placeholder="Search company name"
                      />
                    </div>
                  }
                  onRowClick={(row) => {
                    setSelectedCompanyId(row.id);
                    setFeedback(null);
                  }}
                  selectedRowKey={selectedCompanyId}
                />
                <PaginationSummary
                  currentPage={companyPage}
                  totalItems={companyRows.length}
                  pageSize={PAGE_SIZE}
                  label="companies"
                />
                <PaginationControls
                  currentPage={companyPage}
                  totalItems={companyRows.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setCompanyPage}
                />
              </div>
            }
            right={
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Add Company / Organization
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Add a company first, then record its coupon purchases and generate coupon codes.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <CompactFieldLabel>company / organization</CompactFieldLabel>
                    <CompactInput
                      value={companyForm.name}
                      onChange={(event) =>
                        setCompanyForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Company or organization name"
                    />
                  </div>
                  <div>
                    <CompactFieldLabel>date joined</CompactFieldLabel>
                    <CompactInput
                      type="date"
                      value={companyForm.dateJoined}
                      onChange={(event) =>
                        setCompanyForm((current) => ({
                          ...current,
                          dateJoined: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <CompactFieldLabel>status</CompactFieldLabel>
                    <CompactSelect
                      value={companyForm.status}
                      onChange={(event) =>
                        setCompanyForm((current) => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </CompactSelect>
                  </div>
                  <div className="sm:col-span-2">
                    <CompactFieldLabel>notes</CompactFieldLabel>
                    <CompactInput
                      value={companyForm.notes}
                      onChange={(event) =>
                        setCompanyForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Optional internal note"
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <CompactActionButton
                    onClick={handleCreateCompany}
                    disabled={isBusy}
                    className={`px-4 py-2 text-sm shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/30 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                  >
                    {isCreatingCompany ? "Saving..." : "Create company"}
                  </CompactActionButton>
                </div>
              </div>
            }
          />
        </>
      ) : !selectedPurchase ? (
        <>
          <CompactSummaryCards items={companySummaryCards} fullRow />
          <div className="flex flex-wrap gap-2">
            <CompactActionButton onClick={() => setSelectedCompanyId("")}>
              ← Back to companies
            </CompactActionButton>
          </div>
          <CompactSplitPanel
            className="gap-6"
            left={
              <div className="space-y-4">
                <DataTable
                  columns={purchaseColumns}
                  data={paginatedPurchases}
                  title={`${selectedCompany.name} Coupon Purchases`}
                  subtitle="Select a purchase to generate or review the coupon codes created under it."
                  headerContent={
                    <div className="ml-auto min-w-[200px] lg:max-w-[240px]">
                      <CompactFieldLabel>purchase status</CompactFieldLabel>
                      <CompactSelect
                        value={purchaseStatusFilter}
                        onChange={(event) => setPurchaseStatusFilter(event.target.value)}
                      >
                        {PURCHASE_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status === "all" ? "All statuses" : formatStatusLabel(status)}
                          </option>
                        ))}
                      </CompactSelect>
                    </div>
                  }
                  onRowClick={(row) => {
                    setSelectedPurchaseId(row.id);
                    setFeedback(null);
                  }}
                  selectedRowKey={selectedPurchaseId}
                />
                <PaginationSummary
                  currentPage={purchasePage}
                  totalItems={purchaseRows.length}
                  pageSize={PAGE_SIZE}
                  label="coupon purchases"
                />
                <PaginationControls
                  currentPage={purchasePage}
                  totalItems={purchaseRows.length}
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
                      <h3 className="text-sm font-semibold text-slate-900">
                        Company Details
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Keep company details current before recording new coupon purchases.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      Joined {formatDisplayDate(selectedCompany.dateJoined)}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <CompactFieldLabel>company / organization</CompactFieldLabel>
                      <CompactInput
                        value={companyForm.name}
                        onChange={(event) =>
                          setCompanyForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <CompactFieldLabel>date joined</CompactFieldLabel>
                      <CompactInput
                        type="date"
                        value={companyForm.dateJoined}
                        onChange={(event) =>
                          setCompanyForm((current) => ({
                            ...current,
                            dateJoined: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <CompactFieldLabel>status</CompactFieldLabel>
                      <CompactSelect
                        value={companyForm.status}
                        onChange={(event) =>
                          setCompanyForm((current) => ({
                            ...current,
                            status: event.target.value,
                          }))
                        }
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </CompactSelect>
                    </div>
                    <div className="sm:col-span-2">
                      <CompactFieldLabel>notes</CompactFieldLabel>
                      <CompactInput
                        value={companyForm.notes}
                        onChange={(event) =>
                          setCompanyForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        placeholder="Optional internal note"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <CompactActionButton
                      onClick={handleUpdateCompany}
                      disabled={isBusy}
                      className={`px-4 py-2 text-sm shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/30 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                    >
                      {isUpdatingCompany ? "Saving..." : "Save company changes"}
                    </CompactActionButton>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Record Coupon Purchase
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Create a purchase record first. Then open it to generate the individual coupons.
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
                      <CompactFieldLabel>purchase amount</CompactFieldLabel>
                      <CompactInput
                        type="number"
                        min="0"
                        step="0.01"
                        value={purchaseForm.totalAmount}
                        onChange={(event) =>
                          setPurchaseForm((current) => ({
                            ...current,
                            totalAmount: event.target.value,
                          }))
                        }
                        placeholder="0.00"
                      />
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
      ) : (
        <>
          <CompactSummaryCards items={purchaseSummaryCards} fullRow />
          <div className="flex flex-wrap gap-2">
            <CompactActionButton onClick={() => setSelectedPurchaseId("")}>
              ← Back to purchases
            </CompactActionButton>
            <CompactActionButton onClick={() => setSelectedCompanyId("")}>
              ← Back to companies
            </CompactActionButton>
          </div>
          <CompactSplitPanel
            className="gap-6"
            left={
              <div className="space-y-4">
                <DataTable
                  columns={couponColumns}
                  data={paginatedCoupons}
                  title={`${selectedPurchase.purchaseReference} Coupons`}
                  subtitle="These are the individual coupon values created under the selected purchase."
                  headerContent={
                    <div className="ml-auto min-w-[200px] lg:max-w-[240px]">
                      <CompactFieldLabel>coupon status</CompactFieldLabel>
                      <CompactSelect
                        value={couponStatusFilter}
                        onChange={(event) => setCouponStatusFilter(event.target.value)}
                      >
                        {COUPON_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status === "all" ? "All statuses" : formatStatusLabel(status)}
                          </option>
                        ))}
                      </CompactSelect>
                    </div>
                  }
                />
                <PaginationSummary
                  currentPage={couponPage}
                  totalItems={couponRows.length}
                  pageSize={PAGE_SIZE}
                  label="coupons"
                />
                <PaginationControls
                  currentPage={couponPage}
                  totalItems={couponRows.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setCouponPage}
                />
              </div>
            }
            right={
              <div className="space-y-4">
                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Purchase Details
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Purchase created on {formatDisplayDate(selectedPurchase.purchaseDate)} for{" "}
                      {selectedPurchase.companyName}.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <MetricStat label="Reference" value={selectedPurchase.purchaseReference} />
                    <MetricStat
                      label="Purchase Amount"
                      value={formatCurrency(selectedPurchase.totalAmount)}
                    />
                    <MetricStat
                      label="Generated So Far"
                      value={formatCurrency(selectedPurchase.generatedTotalValue)}
                    />
                    <MetricStat
                      label="Available to Generate"
                      value={formatCurrency(selectedPurchaseAvailableToGenerate)}
                    />
                    <MetricStat
                      label="Coupons Created"
                      value={selectedPurchase.couponCount.toLocaleString()}
                    />
                    <MetricStat
                      label="Coupon Balance"
                      value={formatCurrency(selectedPurchase.remainingTotalValue)}
                    />
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Create Coupons
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Generate coupons in one or more batches. Each batch total must be less than or equal to the unallocated purchase balance.
                    </p>
                  </div>

                  {selectedPurchaseAvailableToGenerate <= 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      This purchase has been fully allocated into coupons. Open the coupons table to review the generated codes.
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <div>
                          <CompactFieldLabel>number of coupons</CompactFieldLabel>
                          <CompactInput
                            type="number"
                            min="1"
                            step="1"
                            value={couponForm.couponCount}
                            onChange={(event) =>
                              setCouponForm((current) => ({
                                ...current,
                                couponCount: event.target.value,
                              }))
                            }
                            placeholder="100"
                          />
                        </div>
                        <div>
                          <CompactFieldLabel>value per coupon</CompactFieldLabel>
                          <CompactInput
                            type="number"
                            min="0"
                            step="0.01"
                            value={couponForm.couponValue}
                            onChange={(event) =>
                              setCouponForm((current) => ({
                                ...current,
                                couponValue: event.target.value,
                              }))
                            }
                            placeholder="1000"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <CompactFieldLabel>notes</CompactFieldLabel>
                          <CompactInput
                            value={couponForm.notes}
                            onChange={(event) =>
                              setCouponForm((current) => ({
                                ...current,
                                notes: event.target.value,
                              }))
                            }
                            placeholder="Optional coupon note"
                          />
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Expected total:{" "}
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(couponBatchTotal)}
                        </span>
                        <span className="mx-2 text-slate-400">·</span>
                        Available to generate:{" "}
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(selectedPurchaseAvailableToGenerate)}
                        </span>
                        <span className="mx-2 text-slate-400">·</span>
                        Purchase amount:{" "}
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(selectedPurchase.totalAmount)}
                        </span>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <CompactActionButton
                          onClick={handleGenerateCoupons}
                          disabled={
                            isBusy ||
                            couponBatchTotal <= 0 ||
                            couponBatchTotal > selectedPurchaseAvailableToGenerate
                          }
                          className={`px-4 py-2 text-sm shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/30 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                        >
                          {isCreatingCoupons ? "Creating..." : "Create coupons"}
                        </CompactActionButton>
                      </div>
                    </>
                  )}
                </div>
              </div>
            }
          />
        </>
      )}
    </DashboardPageShell>
  );
}

function MetricStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
