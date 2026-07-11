import {
  buildMetricCards,
  formatCurrency,
} from "@/features/operations/helpers";

function sortByAmountDescending(left, right) {
  return Number(right.totalAmount || 0) - Number(left.totalAmount || 0);
}

function filterByStationId(records, stationId) {
  return (Array.isArray(records) ? records : []).filter(
    (record) => `${record.stationId || ""}` === `${stationId || ""}`,
  );
}

export function buildFuelStationSummaryFromSummary(records) {
  const grouped = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    const stationId = record.stationId || "";
    const stationName = record.station || "";
    const groupKey = stationId || stationName;

    if (!groupKey || Number(record.fuelSales || 0) <= 0) {
      return;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        stationId,
        station: stationName,
        date: record.date || "",
        petrolSales: 0,
        dieselSales: 0,
        totalAmount: 0,
      });
    }

    const summary = grouped.get(groupKey);
    summary.petrolSales += Number(record.petrolSales || 0);
    summary.dieselSales += Number(record.dieselSales || 0);
    summary.totalAmount += Number(record.fuelSales || 0);

    if ((record.date || "") > summary.date) {
      summary.date = record.date || "";
    }
  });

  return Array.from(grouped.values()).sort(sortByAmountDescending);
}

export function buildFuelDailyBreakdownFromSummary(records, stationId) {
  const grouped = new Map();

  filterByStationId(records, stationId).forEach((record) => {
    if (!grouped.has(record.date)) {
      grouped.set(record.date, {
        date: record.date || "",
        petrolSales: 0,
        dieselSales: 0,
        totalAmount: 0,
      });
    }

    const day = grouped.get(record.date);
    day.petrolSales += Number(record.petrolSales || 0);
    day.dieselSales += Number(record.dieselSales || 0);
    day.totalAmount += Number(record.fuelSales || 0);
  });

  return Array.from(grouped.values()).sort((left, right) =>
    `${right.date || ""}`.localeCompare(`${left.date || ""}`),
  );
}

export function buildFuelSummaryCardsFromSummary(records) {
  const totals = (Array.isArray(records) ? records : []).reduce(
    (summary, record) => {
      summary.total += Number(record.fuelSales || 0);
      summary.petrol += Number(record.petrolSales || 0);
      summary.diesel += Number(record.dieselSales || 0);
      return summary;
    },
    { total: 0, petrol: 0, diesel: 0 },
  );

  return buildMetricCards([
    { title: "Total Sales", value: formatCurrency(totals.total), icon: "💰" },
    { title: "Petrol", value: formatCurrency(totals.petrol), icon: "⛽" },
    { title: "Diesel", value: formatCurrency(totals.diesel), icon: "🚚" },
  ]);
}

export function buildFuelTopPerformerDataFromSummary(records, limit = 3) {
  return buildFuelStationSummaryFromSummary(records)
    .slice(0, limit)
    .map((station) => ({
      label: station.station,
      stationId: station.stationId,
      value: station.totalAmount,
    }));
}

export function buildCementStationSummaryFromSummary(records) {
  const grouped = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    const stationId = record.stationId || "";
    const stationName = record.station || "";
    const groupKey = stationId || stationName;

    if (!groupKey || Number(record.cementSales || 0) <= 0) {
      return;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        stationId,
        station: stationName,
        date: record.date || "",
        totalAmount: 0,
        totalQuantity: 0,
      });
    }

    const summary = grouped.get(groupKey);
    summary.totalAmount += Number(record.cementSales || 0);
    summary.totalQuantity += Number(record.cementBagsSold || 0);

    if ((record.date || "") > summary.date) {
      summary.date = record.date || "";
    }
  });

  return Array.from(grouped.values()).sort(sortByAmountDescending);
}

export function buildCementDailyBreakdownFromSummary(records, stationId) {
  const grouped = new Map();

  filterByStationId(records, stationId).forEach((record) => {
    if (!grouped.has(record.date)) {
      grouped.set(record.date, {
        date: record.date || "",
        totalAmount: 0,
        totalQuantity: 0,
      });
    }

    const day = grouped.get(record.date);
    day.totalAmount += Number(record.cementSales || 0);
    day.totalQuantity += Number(record.cementBagsSold || 0);
  });

  return Array.from(grouped.values()).sort((left, right) =>
    `${right.date || ""}`.localeCompare(`${left.date || ""}`),
  );
}

export function buildCementSummaryCardsFromSummary(records) {
  const totals = (Array.isArray(records) ? records : []).reduce(
    (summary, record) => {
      summary.total += Number(record.cementSales || 0);
      summary.bags += Number(record.cementBagsSold || 0);
      return summary;
    },
    { total: 0, bags: 0 },
  );
  const averagePerBag =
    totals.bags > 0 ? Number(totals.total || 0) / totals.bags : 0;

  return buildMetricCards([
    { title: "Total Sales", value: formatCurrency(totals.total), icon: "💰" },
    { title: "Bags Sold", value: totals.bags.toLocaleString(), icon: "🏗️" },
    { title: "Avg / Bag", value: formatCurrency(averagePerBag), icon: "📏" },
  ]);
}

export function buildCementTopPerformerDataFromSummary(records, limit = 3) {
  return buildCementStationSummaryFromSummary(records)
    .slice(0, limit)
    .map((station) => ({
      label: station.station,
      stationId: station.stationId,
      value: station.totalAmount,
    }));
}

export function buildCommodityStationSummaryFromSummary(records) {
  const grouped = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    const stationId = record.stationId || "";
    const stationName = record.station || "";
    const groupKey = stationId || stationName;

    if (!groupKey || Number(record.shopSales || 0) <= 0) {
      return;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        stationId,
        station: stationName,
        date: record.date || "",
        riceSales: 0,
        cookingOilSales: 0,
        otherSales: 0,
        totalAmount: 0,
      });
    }

    const summary = grouped.get(groupKey);
    summary.riceSales += Number(record.riceSales || 0);
    summary.cookingOilSales += Number(record.cookingOilSales || 0);
    summary.otherSales += Number(record.otherShopSales || 0);
    summary.totalAmount += Number(record.shopSales || 0);

    if ((record.date || "") > summary.date) {
      summary.date = record.date || "";
    }
  });

  return Array.from(grouped.values()).sort(sortByAmountDescending);
}

export function buildCommoditySummaryCardsFromSummary(records) {
  const totals = (Array.isArray(records) ? records : []).reduce(
    (summary, record) => {
      summary.total += Number(record.shopSales || 0);
      summary.rice += Number(record.riceSales || 0);
      summary.cookingOil += Number(record.cookingOilSales || 0);
      summary.other += Number(record.otherShopSales || 0);
      return summary;
    },
    { total: 0, rice: 0, cookingOil: 0, other: 0 },
  );

  return buildMetricCards([
    { title: "Total Sales", value: formatCurrency(totals.total), icon: "💰" },
    { title: "Rice", value: formatCurrency(totals.rice), icon: "🍚" },
    {
      title: "Cooking Oil",
      value: formatCurrency(totals.cookingOil),
      icon: "🫗",
    },
    { title: "Others", value: formatCurrency(totals.other), icon: "🛒" },
  ]);
}

export function buildCommodityTopPerformerDataFromSummary(records, limit = 3) {
  return buildCommodityStationSummaryFromSummary(records)
    .slice(0, limit)
    .map((station) => ({
      label: station.station,
      stationId: station.stationId,
      value: station.totalAmount,
    }));
}
