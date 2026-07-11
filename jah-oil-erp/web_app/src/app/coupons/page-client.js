"use client";

import { useEffect, useMemo, useState } from "react";

import DataTable from "@/components/dashboard/DataTable";
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
} from "@/features/operations/ui";

const companyColumns = [
  { key: "name", label: "Company / Organization" },
  { key: "dateJoinedLabel", label: "Date Joined" },
  { key: "activeCouponCount", label: "Active Coupons", format: "number" },
  { key: "availableBalance", label: "Available", format: "currency" },
];

const purchaseColumns = [
  { key: "purchaseDateLabel", label: "Purchase Date" },
  { key: "purchaseReference", label: "Reference" },
  { key: "totalAmount", label: "Purchase Amount", format: "currency" },
  { key: "couponCount", label: "Coupons", format: "number" },
  { key: "remainingTotalValue", label: "Remaining", format: "currency" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => <StatusBadge status={row.status} label={row.statusLabel} />,
  },
];

const couponColumns = [
  { key: "code", label: "Coupon Code" },
  { key: "faceValue", label: "Value", format: "currency" },
  { key: "remainingValue", label: "Remaining", format: "currency" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => <StatusBadge status={row.status} label={row.statusLabel} />,
  },
  { key: "createdAtLabel", label: "Created" },
  { key: "lastUsedAtLabel", label: "Last Used" },
];

const activeCouponColumns = [
  { key: "companyName", label: "Company / Organization" },
  { key: "purchaseReference", label: "Purchase Ref" },
  { key: "code", label: "Coupon Code" },
  { key: "remainingValue", label: "Available", format: "currency" },
  {
    key: "statusLabel",
    label: "Status",
    render: (row) => <StatusBadge status={row.status} label={row.statusLabel} />,
  },
  { key: "createdAtLabel", label: "Created" },
];

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

  return value === "draft" ? "Draft" : "Active";
}

function getStatusClassName(status) {
  if (status === "active") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "partially_redeemed" || status === "draft") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-slate-200 text-slate-700";
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

function StatusBadge({ status, label }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClassName(
        status,
      )}`}
    >
      {label}
    </span>
  );
}

function buildSummaryCards(activeCoupons) {
  const totalAvailableValue = activeCoupons.reduce(
    (sum, coupon) => sum + Number(coupon.remainingValue || 0),
    0,
  );
  const activeCompanies = new Set(activeCoupons.map((coupon) => coupon.companyId)).size;

  return [
    {
      title: "Active Coupons",
      value: activeCoupons.length.toLocaleString(),
      icon: "🎟️",
    },
    {
      title: "Available Value",
      value: formatCurrency(totalAvailableValue),
      icon: "💰",
    },
    {
      title: "Companies Covered",
      value: activeCompanies.toLocaleString(),
      icon: "🏢",
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

  return [
    {
      title: "Coupon Purchases",
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
      value: formatCurrency(
        activeCoupons.reduce(
          (sum, coupon) => sum + Number(coupon.remainingValue || 0),
          0,
        ),
      ),
      icon: "🏦",
    },
  ];
}

function buildPurchaseSummaryCards(purchase, coupons) {
  const purchaseCoupons = coupons.filter((coupon) => coupon.purchaseId === purchase.id);
  const activeCoupons = purchaseCoupons.filter((coupon) =>
    ["active", "partially_redeemed"].includes(coupon.status),
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
      title: "Active Coupons",
      value: activeCoupons.length.toLocaleString(),
      icon: "✅",
    },
  ];
}

function InfoCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function matchesStatusFilter(status, filterValue) {
  return filterValue === "all" || `${status || ""}` === filterValue;
}

export default function CouponsPageClient({
  companies,
  purchases,
  coupons,
  shellProps,
}) {
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState("all");
  const [couponStatusFilter, setCouponStatusFilter] = useState("all");
  const [companyPage, setCompanyPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [couponPage, setCouponPage] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const normalizedCompanySearch = companySearch.trim().toLowerCase();

  const activeCouponRows = useMemo(
    () =>
      coupons
        .filter((coupon) => ["active", "partially_redeemed"].includes(coupon.status))
        .map((coupon) => ({
          ...coupon,
          statusLabel: formatStatusLabel(coupon.status),
          createdAtLabel: formatDisplayDateTime(coupon.createdAt),
        }))
        .sort(
          (left, right) =>
            getCouponStatusRank(left.status) - getCouponStatusRank(right.status) ||
            `${right.createdAt || ""}`.localeCompare(`${left.createdAt || ""}`) ||
            left.code.localeCompare(right.code),
        ),
    [coupons],
  );

  const companyRows = useMemo(
    () =>
      companies
        .map((company) => {
          const companyCoupons = activeCouponRows.filter(
            (coupon) => coupon.companyId === company.id,
          );

          return {
            ...company,
            dateJoinedLabel: formatDisplayDate(company.dateJoined),
            activeCouponCount: companyCoupons.length,
            availableBalance: companyCoupons.reduce(
              (sum, coupon) => sum + Number(coupon.remainingValue || 0),
              0,
            ),
          };
        })
        .filter((company) => company.activeCouponCount > 0)
        .filter((company) =>
          normalizedCompanySearch
            ? `${company.name || ""}`.toLowerCase().includes(normalizedCompanySearch)
            : true,
        )
        .sort(
          (left, right) =>
            right.activeCouponCount - left.activeCouponCount ||
            right.availableBalance - left.availableBalance ||
            left.name.localeCompare(right.name),
        ),
    [activeCouponRows, companies, normalizedCompanySearch],
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
      .map((purchase) => ({
        ...purchase,
        purchaseDateLabel: formatDisplayDate(purchase.purchaseDate),
        statusLabel: formatStatusLabel(purchase.status),
      }))
      .sort(
        (left, right) =>
          getCouponStatusRank(left.status) - getCouponStatusRank(right.status) ||
          `${right.purchaseDate || ""}`.localeCompare(`${left.purchaseDate || ""}`),
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

  const filteredActiveCouponRows = useMemo(
    () =>
      activeCouponRows.filter((coupon) =>
        normalizedCompanySearch
          ? `${coupon.companyName || ""}`.toLowerCase().includes(normalizedCompanySearch)
          : true,
      ),
    [activeCouponRows, normalizedCompanySearch],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(activeCouponRows),
    [activeCouponRows],
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
  const paginatedActiveCoupons = useMemo(
    () => paginateItems(filteredActiveCouponRows, activePage, PAGE_SIZE),
    [activePage, filteredActiveCouponRows],
  );

  useEffect(() => {
    setCompanyPage(1);
    setActivePage(1);
  }, [companySearch]);

  useEffect(() => {
    setPurchasePage(1);
  }, [purchaseStatusFilter, selectedCompanyId]);

  useEffect(() => {
    setCouponPage(1);
  }, [couponStatusFilter, selectedPurchaseId]);

  return (
    <DashboardPageShell
      title="Coupons"
      description="View all active coupons, then drill into a company and purchase to see the coupon values created under it."
      {...shellProps}
    >
      {!selectedCompany ? (
        <>
          <CompactSummaryCards items={summaryCards} fullRow />
          <CompactSplitPanel
            className="gap-6"
            left={
              <div className="space-y-4">
                <DataTable
                  columns={companyColumns}
                  data={paginatedCompanies}
                  title="Companies with Active Coupons"
                  subtitle="Open a company to see its coupon purchases and the coupon values created under each purchase."
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
                    setSelectedPurchaseId("");
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
              <div className="space-y-4">
                <DataTable
                  columns={activeCouponColumns}
                  data={paginatedActiveCoupons}
                  title="All Active Coupons"
                  subtitle="Active and partially redeemed coupons stay on top so current value is easy to review."
                />
                <PaginationSummary
                  currentPage={activePage}
                  totalItems={filteredActiveCouponRows.length}
                  pageSize={PAGE_SIZE}
                  label="active coupons"
                />
                <PaginationControls
                  currentPage={activePage}
                  totalItems={filteredActiveCouponRows.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setActivePage}
                />
              </div>
            }
          />
        </>
      ) : !selectedPurchase ? (
        <>
          <div className="flex flex-wrap gap-2">
            <CompactActionButton onClick={() => setSelectedCompanyId("")}>
              ← Back to active companies
            </CompactActionButton>
          </div>

          <CompactSummaryCards items={companySummaryCards} fullRow />

          <CompactSplitPanel
            className="gap-6"
            left={
              <div className="space-y-4">
                <DataTable
                  columns={purchaseColumns}
                  data={paginatedPurchases}
                  title={`${selectedCompany.name} Coupon Purchases`}
                  subtitle="Select a purchase to see the coupon values created under it."
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
                  onRowClick={(row) => setSelectedPurchaseId(row.id)}
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
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Company Overview
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Review coupon purchase activity for {selectedCompany.name}.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <InfoCard title="Date Joined" value={selectedCompany.dateJoinedLabel} />
                  <InfoCard
                    title="Active Coupons"
                    value={selectedCompany.activeCouponCount.toLocaleString()}
                  />
                  <InfoCard
                    title="Available Value"
                    value={formatCurrency(selectedCompany.availableBalance)}
                  />
                  <InfoCard
                    title="Active Purchases"
                    value={purchaseRows
                      .filter((purchase) =>
                        ["active", "partially_redeemed"].includes(purchase.status),
                      )
                      .length.toLocaleString()}
                  />
                </div>
              </div>
            }
          />
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <CompactActionButton onClick={() => setSelectedPurchaseId("")}>
              ← Back to purchases
            </CompactActionButton>
            <CompactActionButton onClick={() => setSelectedCompanyId("")}>
              ← Back to active companies
            </CompactActionButton>
          </div>

          <CompactSummaryCards items={purchaseSummaryCards} fullRow />

          <CompactSplitPanel
            className="gap-6"
            left={
              <div className="space-y-4">
                <DataTable
                  columns={couponColumns}
                  data={paginatedCoupons}
                  title={`${selectedPurchase.purchaseReference} Coupons`}
                  subtitle="Active coupons stay on top. This is the full breakdown of coupon values created under the selected purchase."
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
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Purchase Overview
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedCompany.name} bought {formatCurrency(selectedPurchase.totalAmount)} on{" "}
                    {formatDisplayDate(selectedPurchase.purchaseDate)}.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <InfoCard title="Reference" value={selectedPurchase.purchaseReference} />
                  <InfoCard
                    title="Coupon Count"
                    value={selectedPurchase.couponCount.toLocaleString()}
                  />
                  <InfoCard
                    title="Remaining Value"
                    value={formatCurrency(selectedPurchase.remainingTotalValue)}
                  />
                  <InfoCard
                    title="Status"
                    value={formatStatusLabel(selectedPurchase.status)}
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
