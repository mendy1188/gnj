import {
  buildMetricCards,
  formatCurrency,
} from "@/features/operations/helpers";

function getInventoryHealthRatio(record) {
  const reorderLevel = Number(record.reorderLevel);

  if (!Number.isFinite(reorderLevel) || reorderLevel <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return record.quantity / reorderLevel;
}

export function filterSalesByType(records, type) {
  return records.filter((record) => record.type === type);
}

export function buildSalesStationSummary(records) {
  const grouped = new Map();

  records.forEach((record) => {
    if (!grouped.has(record.station)) {
      grouped.set(record.station, {
        station: record.station,
        lastDate: record.date,
        totalAmount: 0,
        totalQuantity: 0,
        transactions: 0,
      });
    }

    const station = grouped.get(record.station);
    station.totalAmount += record.amount;
    station.totalQuantity += record.quantity;
    station.transactions += 1;
    if (record.date > station.lastDate) {
      station.lastDate = record.date;
    }
  });

  return Array.from(grouped.values()).sort(
    (left, right) => right.totalAmount - left.totalAmount,
  );
}

export function buildSalesDailyBreakdown(records, stationName) {
  const grouped = new Map();

  records
    .filter((record) => record.station === stationName)
    .forEach((record) => {
      if (!grouped.has(record.date)) {
        grouped.set(record.date, {
          date: record.date,
          totalAmount: 0,
          totalQuantity: 0,
          transactions: 0,
        });
      }

      const day = grouped.get(record.date);
      day.totalAmount += record.amount;
      day.totalQuantity += record.quantity;
      day.transactions += 1;
    });

  return Array.from(grouped.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

export function buildSalesTransactions(records, stationName, date) {
  return records
    .filter((record) => record.station === stationName && record.date === date)
    .sort((left, right) => right.amount - left.amount)
    .map((record) => ({
      id: record.id,
      date: record.date,
      station: record.station,
      category: record.type,
      item: record.item,
      cashierName: record.cashierName || "",
      quantity: record.quantity,
      amount: record.amount,
    }));
}

export function buildTopPerformerData(records, limit = 3) {
  return buildSalesStationSummary(records)
    .slice(0, limit)
    .map((station) => ({
      label: station.station,
      value: station.totalAmount,
    }));
}

export function buildSalesSummaryCards(records, quantityLabel = "Units") {
  const totalSales = records.reduce((sum, record) => sum + record.amount, 0);
  const totalQuantity = records.reduce(
    (sum, record) => sum + record.quantity,
    0,
  );
  const transactions = records.length;

  return buildMetricCards([
    { title: "Total Sales", value: formatCurrency(totalSales), icon: "💰" },
    { title: quantityLabel, value: totalQuantity.toLocaleString(), icon: "📦" },
    { title: "Transactions", value: transactions.toLocaleString(), icon: "🧾" },
  ]);
}

export function buildDeliveryStationSummary(records) {
  const grouped = new Map();

  records.forEach((record) => {
    if (!grouped.has(record.station)) {
      grouped.set(record.station, {
        station: record.station,
        lastDate: record.date,
        totalQuantity: 0,
        deliveries: 0,
        delivered: 0,
        pending: 0,
        other: 0,
      });
    }

    const station = grouped.get(record.station);
    const statusKey =
      record.status === "delivered" || record.status === "pending"
        ? record.status
        : "other";

    station.totalQuantity += record.quantity;
    station.deliveries += 1;
    station[statusKey] += 1;
    if (record.date > station.lastDate) {
      station.lastDate = record.date;
    }
  });

  return Array.from(grouped.values()).sort(
    (left, right) => right.totalQuantity - left.totalQuantity,
  );
}

export function buildDeliverySummaryCards(records) {
  const totalQuantity = records.reduce(
    (sum, record) => sum + record.quantity,
    0,
  );
  const delivered = records.filter(
    (record) => record.status === "delivered",
  ).length;
  const pending = records.filter(
    (record) => record.status === "pending",
  ).length;

  return buildMetricCards([
    {
      title: "Total Quantity",
      value: totalQuantity.toLocaleString(),
      icon: "⛽",
    },
    { title: "Delivered", value: delivered.toLocaleString(), icon: "✅" },
    { title: "Pending", value: pending.toLocaleString(), icon: "⏳" },
  ]);
}

export function buildInventorySummaryCards(records) {
  const lowStock = records.filter(
    (record) => record.quantity <= record.reorderLevel,
  ).length;
  const criticalItem = [...records].sort(
    (left, right) =>
      getInventoryHealthRatio(left) - getInventoryHealthRatio(right),
  )[0];

  return buildMetricCards([
    {
      title: "Tracked Items",
      value: records.length.toLocaleString(),
      icon: "📦",
    },
    { title: "Low Stock", value: lowStock.toLocaleString(), icon: "⚠️" },
    {
      title: "Priority Item",
      value: criticalItem ? criticalItem.name : "None",
      icon: "🎯",
    },
  ]);
}

export function buildInventoryRows(records) {
  return records.map((record) => ({
    ...record,
    status: record.quantity <= record.reorderLevel ? "Low Stock" : "Healthy",
  }));
}

export function buildInventoryStationSummary(records) {
  const grouped = new Map();

  records.forEach((record) => {
    if (!grouped.has(record.station)) {
      grouped.set(record.station, {
        station: record.station,
        trackedItems: 0,
        lowStock: 0,
        criticalItem: record.name,
        criticalRatio: getInventoryHealthRatio(record),
      });
    }

    const station = grouped.get(record.station);
    const currentRatio = getInventoryHealthRatio(record);

    station.trackedItems += 1;
    if (record.quantity <= record.reorderLevel) {
      station.lowStock += 1;
    }
    if (currentRatio < station.criticalRatio) {
      station.criticalRatio = currentRatio;
      station.criticalItem = record.name;
    }
  });

  return Array.from(grouped.values()).sort(
    (left, right) => right.lowStock - left.lowStock,
  );
}

export function buildInventoryRiskCardData(records, limit = 3) {
  return buildInventoryStationSummary(records)
    .slice(0, limit)
    .map((station) => ({
      label: station.station,
      value: station.lowStock,
    }));
}

export function buildInventoryStationBreakdown(records, stationName) {
  return buildInventoryRows(
    records.filter((record) => record.station === stationName),
  ).sort((left, right) => left.quantity - right.quantity);
}

export function buildCommodityTransactionList(records, stationName, itemName) {
  return records
    .filter(
      (record) => record.station === stationName && record.item === itemName,
    )
    .sort(
      (left, right) =>
        `${right.saleDate || ""}`.localeCompare(`${left.saleDate || ""}`) ||
        right.amount - left.amount,
    )
    .map((record) => ({
      id: record.id,
      date: record.date,
      saleDate: record.saleDate || record.date,
      item: record.item,
      category: record.type,
      cashierName: record.cashierName || "",
      quantity: record.quantity,
      amount: record.amount,
    }));
}
