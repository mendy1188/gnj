"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/dashboard/DataTable";
import ToastMessage from "@/components/ui/ToastMessage";
import DashboardPageShell from "@/features/dashboard/page-shell";
import {
  CompactActionButton,
  CompactFieldLabel,
  CompactFilterCard,
  CompactInput,
  CompactSelect,
  CompactSplitPanel,
  CompactSummaryCards,
  PRIMARY_ACTION_BUTTON_CLASS,
} from "@/features/operations/ui";

import { createStationAction, updateStationAction } from "./actions";

const stationColumns = [
  { key: "name", label: "Station" },
  { key: "code", label: "Code" },
  { key: "location", label: "Location" },
  { key: "manager", label: "Manager" },
  {
    key: "status",
    label: "Status",
    render: (row) => (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          row.status === "active"
            ? "bg-emerald-50 text-emerald-700"
            : row.status === "maintenance"
              ? "bg-amber-50 text-amber-700"
              : "bg-slate-200 text-slate-700"
        }`}
      >
        {row.statusLabel}
      </span>
    ),
  },
];

const DEFAULT_STATION_FORM = {
  name: "",
  code: "",
  location: "",
  status: "active",
  managerName: "",
  managerPhone: "",
  latitude: "",
  longitude: "",
};

function formatStatusLabel(value) {
  if (value === "maintenance") {
    return "Maintenance";
  }

  return value === "inactive" ? "Inactive" : "Active";
}

function buildSummaryCards(stations) {
  const activeStations = stations.filter((station) => station.status === "active").length;
  const maintenanceStations = stations.filter(
    (station) => station.status === "maintenance",
  ).length;

  return [
    {
      title: "Total Stations",
      value: stations.length.toLocaleString(),
      icon: "🏢",
    },
    {
      title: "Active Stations",
      value: activeStations.toLocaleString(),
      icon: "✅",
    },
    {
      title: "Maintenance",
      value: maintenanceStations.toLocaleString(),
      icon: "🛠️",
    },
  ];
}

export default function StationSettingsPageClient({ stations, shellProps }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedStationId, setSelectedStationId] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [stationForm, setStationForm] = useState(DEFAULT_STATION_FORM);

  const stationRows = useMemo(
    () =>
      stations.map((station) => ({
        ...station,
        statusLabel: formatStatusLabel(station.status),
      })),
    [stations],
  );

  const filteredStations = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return stationRows.filter((station) => {
      if (statusFilter !== "All" && station.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [station.name, station.code, station.location, station.manager]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [searchTerm, stationRows, statusFilter]);

  const selectedStation = useMemo(
    () => stationRows.find((station) => station.id === selectedStationId) || null,
    [selectedStationId, stationRows],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(stations),
    [stations],
  );

  useEffect(() => {
    if (!selectedStation) {
      setStationForm(DEFAULT_STATION_FORM);
      return;
    }

    setStationForm({
      name: selectedStation.name || "",
      code: selectedStation.code || "",
      location: selectedStation.location || "",
      status: selectedStation.status || "active",
      managerName: selectedStation.manager || "",
      managerPhone: selectedStation.managerPhone || "",
      latitude:
        selectedStation.latitude === null || selectedStation.latitude === undefined
          ? ""
          : `${selectedStation.latitude}`,
      longitude:
        selectedStation.longitude === null || selectedStation.longitude === undefined
          ? ""
          : `${selectedStation.longitude}`,
    });
  }, [selectedStation]);

  function updateStationForm(key, value) {
    setStationForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetFilters() {
    setStatusFilter("All");
    setSearchTerm("");
    setFeedback(null);
  }

  function resetSelection() {
    setSelectedStationId("");
    setFeedback(null);
    setStationForm(DEFAULT_STATION_FORM);
  }

  function handleSubmit() {
    setFeedback(null);

    startTransition(async () => {
      const action = selectedStation ? updateStationAction : createStationAction;
      const result = await action({
        stationId: selectedStation?.id || "",
        ...stationForm,
      });

      setFeedback(result);

      if (result?.success) {
        setSelectedStationId(result.stationId || selectedStation?.id || "");
        router.refresh();
      }
    });
  }

  return (
    <DashboardPageShell
      title="Station Settings"
      description="Add new stations, update station details, and keep branch configuration aligned across the system."
      {...shellProps}
    >
      <CompactFilterCard
        actions={
          <CompactActionButton onClick={resetFilters}>Reset filters</CompactActionButton>
        }
      >
        <div>
          <CompactFieldLabel htmlFor="stationSearch">search</CompactFieldLabel>
          <CompactInput
            id="stationSearch"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search station, code, location"
          />
        </div>
        <div>
          <CompactFieldLabel htmlFor="stationStatusFilter">status</CompactFieldLabel>
          <CompactSelect
            id="stationStatusFilter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="All">All</option>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
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
          <DataTable
            columns={stationColumns}
            data={filteredStations}
            title="Station Catalog"
            subtitle="Select a station to update its details, status, or assigned manager."
            onRowClick={(row) => {
              setSelectedStationId(row.id);
              setFeedback(null);
            }}
            selectedRowKey={selectedStationId}
          />
        }
        right={
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {selectedStation ? "Edit Station" : "Add Station"}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  {selectedStation
                    ? "Updating the station name also syncs linked branch and transaction records."
                    : "New stations are added to the station catalog and seeded into inventory for every product."}
                </p>
              </div>
              {selectedStation ? (
                <CompactActionButton onClick={resetSelection}>
                  + New station
                </CompactActionButton>
              ) : null}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <CompactFieldLabel htmlFor="stationName">name</CompactFieldLabel>
                <CompactInput
                  id="stationName"
                  value={stationForm.name}
                  onChange={(event) => updateStationForm("name", event.target.value)}
                  placeholder="Station name"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <CompactFieldLabel htmlFor="stationCode">code</CompactFieldLabel>
                  <CompactInput
                    id="stationCode"
                    value={stationForm.code}
                    onChange={(event) =>
                      updateStationForm("code", event.target.value.toUpperCase())
                    }
                    placeholder="Station code"
                  />
                </div>
                <div>
                  <CompactFieldLabel htmlFor="stationStatus">status</CompactFieldLabel>
                  <CompactSelect
                    id="stationStatus"
                    value={stationForm.status}
                    onChange={(event) => updateStationForm("status", event.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="inactive">Inactive</option>
                  </CompactSelect>
                </div>
              </div>
              <div>
                <CompactFieldLabel htmlFor="stationLocation">location</CompactFieldLabel>
                <CompactInput
                  id="stationLocation"
                  value={stationForm.location}
                  onChange={(event) => updateStationForm("location", event.target.value)}
                  placeholder="City or area"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <CompactFieldLabel htmlFor="stationManagerName">manager</CompactFieldLabel>
                  <CompactInput
                    id="stationManagerName"
                    value={stationForm.managerName}
                    onChange={(event) =>
                      updateStationForm("managerName", event.target.value)
                    }
                    placeholder="Branch manager name"
                  />
                </div>
                <div>
                  <CompactFieldLabel htmlFor="stationManagerPhone">manager phone</CompactFieldLabel>
                  <CompactInput
                    id="stationManagerPhone"
                    value={stationForm.managerPhone}
                    onChange={(event) =>
                      updateStationForm("managerPhone", event.target.value)
                    }
                    placeholder="Phone number"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <CompactFieldLabel htmlFor="stationLatitude">latitude</CompactFieldLabel>
                  <CompactInput
                    id="stationLatitude"
                    type="number"
                    step="0.000001"
                    value={stationForm.latitude}
                    onChange={(event) =>
                      updateStationForm("latitude", event.target.value)
                    }
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <CompactFieldLabel htmlFor="stationLongitude">longitude</CompactFieldLabel>
                  <CompactInput
                    id="stationLongitude"
                    type="number"
                    step="0.000001"
                    value={stationForm.longitude}
                    onChange={(event) =>
                      updateStationForm("longitude", event.target.value)
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
              <CompactActionButton
                onClick={handleSubmit}
                disabled={isPending}
                className={PRIMARY_ACTION_BUTTON_CLASS}
              >
                {isPending
                  ? "Saving..."
                  : selectedStation
                    ? "Save station changes"
                    : "Create station"}
              </CompactActionButton>
            </div>
          </div>
        }
        leftSpan="xl:col-span-6"
        rightSpan="xl:col-span-4"
      />
    </DashboardPageShell>
  );
}
