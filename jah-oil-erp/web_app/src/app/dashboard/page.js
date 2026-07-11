import AlertCard from "@/components/dashboard/AlertCard";
import DashboardCard from "@/components/dashboard/DashboardCard";
import DataTable from "@/components/dashboard/DataTable";
import SalesChart from "@/components/dashboard/SalesChart";
import StationMap from "@/components/dashboard/StationMap";
import { AppIcon } from "@/components/ui/AppIcon";
import { buildDashboardShellProps } from "@/features/auth/shell";
import {
  filterInventoryRecordsForSession,
  filterSalesRecordsForSession,
  getDashboardVariant,
  isBranchManager,
  isFuelSales,
  isGeneralSales,
} from "@/features/auth/scopes";
import { requireCurrentSession } from "@/features/auth/server";
import DashboardPageShell from "@/features/dashboard/page-shell";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import {
  buildDashboardDataFromRecords,
  buildDashboardDataFromSummaryRecords,
  getDashboardSalesData,
  getDashboardSummaryData,
  getInventoryData,
} from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

const recentSalesTableColumns = [
  { key: "rank", label: "Rank" },
  { key: "name", label: "Station Name" },
  { key: "sales", label: "Total Sales", format: "currency" },
  { key: "fuel", label: "Fuel Sales", format: "currency" },
  { key: "shop", label: "Shop Sales", format: "currency" },
];

export default async function DashboardPage() {
  const session = await requireCurrentSession();
  const shellProps = buildDashboardShellProps(session);
  const dashboardVariant = getDashboardVariant(session);
  let summaryRecords;
  let inventoryData;

  try {
    [summaryRecords, inventoryData] = await Promise.all([
      getDashboardSummaryData(buildDashboardSummaryQueryOptions(session)),
      getInventoryData(),
    ]);
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Dashboard"
        pageDescription="Monitor activity across all stations and business units."
        error={error}
      />
    );
  }
  const scopedInventoryData = filterInventoryRecordsForSession(
    inventoryData,
    session,
  );
  let dashboardData;

  try {
    dashboardData =
      summaryRecords.length > 0
        ? buildDashboardDataFromSummaryRecords(summaryRecords, scopedInventoryData)
        : buildDashboardDataFromRecords(
            filterSalesRecordsForSession(
              await getDashboardSalesData(buildDashboardSalesQueryOptions(session)),
              session,
            ),
            scopedInventoryData,
          );
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Dashboard"
        pageDescription="Monitor activity across all stations and business units."
        error={error}
      />
    );
  }
  const {
    lowStockAlerts,
    salesByDay,
    todaySales,
    topStations,
    salesByStation,
    fuelPetrolSales,
    fuelDieselSales,
    riceSales,
    cookingSales,
    otherShopSales,
    cementBagsSold,
    totalTodaySales,
    bestStation,
    alertCount,
    todayTransactionCount,
  } = dashboardData;

  const salesByDayChartData = salesByDay.map((day) => ({
    label: day.date,
    value: day.total,
  }));
  const generalSalesTitle = isGeneralSales(session.roleName)
    ? "General Sales Dashboard"
    : isFuelSales(session.roleName)
      ? "Fuel Sales Dashboard"
      : isBranchManager(session.roleName)
        ? `${session.branchName} Branch Dashboard`
        : "Operations Dashboard";
  const generalSalesDescription = isGeneralSales(session.roleName)
    ? "Track your daily commodity and cement sales with branch stock alerts."
    : isFuelSales(session.roleName)
      ? "Monitor your daily Petrol and Diesel sales performance."
      : isBranchManager(session.roleName)
        ? "Monitor branch-wide sales, inventory risk, and station performance."
        : "Monitor fuel, shop, and cement performance from one secure command center.";

  return (
    <DashboardPageShell
      title={generalSalesTitle}
      description={generalSalesDescription}
      {...shellProps}
    >
      {dashboardVariant === "general-sales" ? (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <DashboardCard
              title="Commodity Sales Today"
              value={`D${todaySales.shop.toLocaleString()}`}
              icon="📦"
              trend={8}
              footer={`Rice D${riceSales.toLocaleString()} · Cooking Oil D${cookingSales.toLocaleString()} · Others D${otherShopSales.toLocaleString()}`}
              tone="emerald"
            />
            <DashboardCard
              title="Cement Sales Today"
              value={`D${todaySales.cement.toLocaleString()}`}
              icon="🧱"
              trend={6}
              footer={`${cementBagsSold.toLocaleString()} bags sold`}
              tone="amber"
            />
            <DashboardCard
              title="Low Stock Products"
              value={alertCount.toLocaleString()}
              icon="⚠️"
              trend={0}
              footer={
                lowStockAlerts[0]
                  ? `${lowStockAlerts[0].item} · ${lowStockAlerts[0].station}`
                  : "No active low stock alerts"
              }
              tone="sky"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-10">
            <div className="xl:col-span-7">
              <SalesChart data={salesByDayChartData} title="My Sales by Day" />
            </div>
            <div className="xl:col-span-3">
              <AlertCard alerts={lowStockAlerts} />
            </div>
          </div>
        </>
      ) : dashboardVariant === "fuel-sales" ? (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <DashboardCard
              title="Petrol Sales Today"
              value={`D${fuelPetrolSales.toLocaleString()}`}
              icon="⛽"
              trend={10}
              footer={`${todaySales.fuel.toLocaleString()} total fuel sales today`}
              tone="sky"
            />
            <DashboardCard
              title="Diesel Sales Today"
              value={`D${fuelDieselSales.toLocaleString()}`}
              icon="🛢️"
              trend={7}
              footer={`${todayTransactionCount.toLocaleString()} fuel transactions`}
              tone="emerald"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-10">
            <div className="xl:col-span-7">
              <SalesChart data={salesByDayChartData} title="My Fuel Sales by Day" />
            </div>
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)] xl:col-span-3">
              <h3 className="text-lg font-semibold text-slate-900">Fuel Summary</h3>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-sm font-medium text-slate-500">Today&apos;s Fuel Total</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    D{todaySales.fuel.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-sm font-medium text-slate-500">Petrol vs Diesel</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    Petrol D{fuelPetrolSales.toLocaleString()} · Diesel D
                    {fuelDieselSales.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <DashboardCard
              title="Today's Fuel Sales"
              value={`D${todaySales.fuel.toLocaleString()}`}
              icon="⛽"
              trend={12}
              footer={`Petrol D${fuelPetrolSales.toLocaleString()} · Diesel D${fuelDieselSales.toLocaleString()}`}
              tone="sky"
            />
            <DashboardCard
              title="Today's Shop Sales"
              value={`D${todaySales.shop.toLocaleString()}`}
              icon="📦"
              trend={8}
              footer={`Rice D${riceSales.toLocaleString()} · Cooking Oil D${cookingSales.toLocaleString()} · Others D${otherShopSales.toLocaleString()}`}
              tone="emerald"
            />
            <DashboardCard
              title="Today's Cement Sales"
              value={`D${todaySales.cement.toLocaleString()}`}
              icon="🧱"
              trend={-5}
              footer={`${cementBagsSold.toLocaleString()} bags sold`}
              tone="amber"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-10">
            <div className="xl:col-span-7">
              <SalesChart
                data={salesByDayChartData}
                title={
                  dashboardVariant === "branch-manager"
                    ? "Branch Sales by Day"
                    : "Sales by Day"
                }
              />
            </div>
            <div className="xl:col-span-3">
              <AlertCard alerts={lowStockAlerts} />
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-10">
            <div className="xl:col-span-10">
              <StationMap salesByStation={salesByStation} />
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-10">
            <div className="xl:col-span-6">
              <DataTable
                columns={recentSalesTableColumns}
                data={topStations}
                title={
                  dashboardVariant === "branch-manager"
                    ? "Branch Station Summary"
                    : "Top Stations"
                }
                subtitle={
                  dashboardVariant === "branch-manager"
                    ? "Current station performance inside this branch view."
                    : "Station rankings by total and category sales"
                }
              />
            </div>
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)] xl:col-span-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] tracking-[0.2em] text-slate-400 uppercase">
                    Snapshot
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    Executive Summary
                  </h3>
                </div>
                <AppIcon name="pin" className="h-6 w-6 text-slate-500" />
              </div>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-sm font-medium text-slate-500">
                    Top station lead
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {bestStation?.name || "-"} leads with D
                    {bestStation?.sales?.toLocaleString() || "0"}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-sm font-medium text-slate-500">
                    Sales concentration
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    Fuel contributes D{todaySales.fuel.toLocaleString()} of D
                    {totalTodaySales.toLocaleString()} today.
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-sm font-medium text-slate-500">
                    Operational risk
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {alertCount} low-stock alerts remain open across the network.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardPageShell>
  );
}

function buildDashboardSalesQueryOptions(session) {
  if (isGeneralSales(session?.roleName)) {
    return {
      stationId: session?.branchId || "",
      branchName: session?.branchName || "",
      categories: ["shop", "cement"],
      includeCashierMetadata: true,
      cashierName: session?.fullName || "",
    };
  }

  if (isFuelSales(session?.roleName)) {
    return {
      stationId: session?.branchId || "",
      branchName: session?.branchName || "",
      categories: ["fuel"],
      includeCashierMetadata: true,
      cashierName: session?.fullName || "",
    };
  }

  if (isBranchManager(session?.roleName)) {
    return {
      stationId: session?.branchId || "",
      branchName: session?.branchName || "",
    };
  }

  return {};
}

function buildDashboardSummaryQueryOptions(session) {
  const baseOptions = {};

  if (isGeneralSales(session?.roleName) || isFuelSales(session?.roleName)) {
    return {
      ...baseOptions,
      scope: "cashier",
      stationId: session?.branchId || "",
      stationName: session?.branchName || "",
      cashierName: session?.fullName || "",
    };
  }

  if (isBranchManager(session?.roleName)) {
    return {
      ...baseOptions,
      scope: "station",
      stationId: session?.branchId || "",
      stationName: session?.branchName || "",
    };
  }

  return {
    ...baseOptions,
    scope: "station",
  };
}
