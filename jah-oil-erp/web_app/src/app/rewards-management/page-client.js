"use client";

import { useMemo, useState } from "react";

import DataTable from "@/components/dashboard/DataTable";
import {
  PAGE_SIZE,
  formatCurrency,
  paginateItems,
} from "@/features/operations/helpers";
import {
  CompactFieldLabel,
  CompactInput,
  CompactSelect,
  PaginationControls,
  PaginationSummary,
} from "@/features/operations/ui";

const CLIENT_USER_COLUMNS = [
  {
    key: "clientDisplay",
    label: "Client",
    render: (row) => (
      <div>
        <p className="font-medium text-slate-900">{row.fullName}</p>
        <p className="text-xs text-slate-500">
          {row.phone}
          {row.email ? ` · ${row.email}` : ""}
        </p>
        {row.companyName ? (
          <p className="mt-1 text-xs font-medium text-slate-500">
            {row.companyName}
          </p>
        ) : null}
      </div>
    ),
  },
  { key: "userTypeLabel", label: "Type" },
  { key: "rewardBalance", label: "Cash Back", format: "currency" },
  { key: "bulkBalance", label: "Bulk Fuel", format: "currency" },
  { key: "couponBalance", label: "Coupons", format: "currency" },
  { key: "preferredProviderLabel", label: "Preferred Pay" },
];

function formatUserTypeLabel(value) {
  return value === "company" ? "Company / Organization" : "Individual";
}

function formatProviderLabel(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();

  if (!normalizedValue) {
    return "—";
  }

  if (normalizedValue === "qmoney") {
    return "QMoney";
  }

  if (normalizedValue === "afrimoney") {
    return "Afrimoney";
  }

  if (normalizedValue === "wave") {
    return "Wave";
  }

  return normalizedValue;
}

export default function RewardsManagementPageClient({ clientRows }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState("All");
  const [providerFilter, setProviderFilter] = useState("All");
  const [page, setPage] = useState(1);

  const normalizedRows = useMemo(
    () =>
      (Array.isArray(clientRows) ? clientRows : []).map((row) => ({
        ...row,
        userTypeLabel: formatUserTypeLabel(row.userType),
        preferredProviderLabel: formatProviderLabel(row.preferredProvider),
      })),
    [clientRows],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return normalizedRows.filter((row) => {
      if (userTypeFilter !== "All" && row.userType !== userTypeFilter) {
        return false;
      }

      if (
        providerFilter !== "All" &&
        `${row.preferredProvider || ""}`.trim().toLowerCase() !== providerFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        row.fullName,
        row.phone,
        row.email,
        row.companyName,
        row.preferredProvider,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [normalizedRows, providerFilter, searchTerm, userTypeFilter]);

  const paginatedRows = useMemo(
    () => paginateItems(filteredRows, page, PAGE_SIZE),
    [filteredRows, page],
  );

  const headerContent = (
    <>
      <div className="min-w-[220px]">
        <CompactFieldLabel htmlFor="reward-client-search">search</CompactFieldLabel>
        <CompactInput
          id="reward-client-search"
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setPage(1);
          }}
          placeholder="Name, phone, email"
        />
      </div>
      <div className="min-w-[160px]">
        <CompactFieldLabel htmlFor="reward-client-type">type</CompactFieldLabel>
        <CompactSelect
          id="reward-client-type"
          value={userTypeFilter}
          onChange={(event) => {
            setUserTypeFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="All">All</option>
          <option value="individual">Individual</option>
          <option value="company">Company / Organization</option>
        </CompactSelect>
      </div>
      {/* <div className="min-w-[160px]">
        <CompactFieldLabel htmlFor="reward-client-provider">provider</CompactFieldLabel>
        <CompactSelect
          id="reward-client-provider"
          value={providerFilter}
          onChange={(event) => {
            setProviderFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="All">All</option>
          <option value="wave">Wave</option>
          <option value="qmoney">QMoney</option>
          <option value="afrimoney">Afrimoney</option>
        </CompactSelect>
      </div> */}
    </>
  );

  return (
    <section className="mt-6 space-y-4">
      <DataTable
        columns={CLIENT_USER_COLUMNS}
        data={paginatedRows}
        title="Jah App Users"
        subtitle="Clients that have registered on the Jah App and are eligible for rewards."
        headerContent={headerContent}
      />

      <PaginationSummary
        currentPage={page}
        totalItems={filteredRows.length}
        pageSize={PAGE_SIZE}
        label="client users"
      />
      <PaginationControls
        currentPage={page}
        totalItems={filteredRows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </section>
  );
}
