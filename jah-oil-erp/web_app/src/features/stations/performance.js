export function addDays(dateString, amount) {
  if (!dateString) {
    return "";
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);

  return date.toISOString().slice(0, 10);
}

export function getLatestRecordDate(records) {
  return records.reduce(
    (latest, record) => (record.date > latest ? record.date : latest),
    records[0]?.date || "",
  );
}

export function filterRecordsByDate(records, fromDate, toDate) {
  const normalizedFromDate = toComparableDate(fromDate);
  const normalizedToDate = toComparableDate(toDate);
  const rangeStart =
    normalizedFromDate !== null && normalizedToDate !== null
      ? Math.min(normalizedFromDate, normalizedToDate)
      : normalizedFromDate;
  const rangeEnd =
    normalizedFromDate !== null && normalizedToDate !== null
      ? Math.max(normalizedFromDate, normalizedToDate)
      : normalizedToDate;

  return records.filter((record) => {
    const recordDate = toComparableDate(record.date);

    if (recordDate === null) {
      return false;
    }

    if (rangeStart !== null && recordDate < rangeStart) {
      return false;
    }
    if (rangeEnd !== null && recordDate > rangeEnd) {
      return false;
    }
    return true;
  });
}

function toComparableDate(value) {
  if (!value) {
    return null;
  }

  const normalizedValue = `${value}`.slice(0, 10);
  const [year, month, day] = normalizedValue.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    const fallback = new Date(value);

    if (Number.isNaN(fallback.getTime())) {
      return null;
    }

    return Date.UTC(
      fallback.getUTCFullYear(),
      fallback.getUTCMonth(),
      fallback.getUTCDate(),
    );
  }

  return Date.UTC(year, month - 1, day);
}

export function buildStationPerformance(records) {
  const grouped = new Map();

  records.forEach((record) => {
    if (!grouped.has(record.station)) {
      grouped.set(record.station, {
        station: record.station,
        date: record.date,
        fuel: 0,
        shop: 0,
        cement: 0,
        total: 0,
        transactions: 0,
      });
    }

    const station = grouped.get(record.station);
    const bucket =
      record.type === "Fuel"
        ? "fuel"
        : record.type === "Cement"
          ? "cement"
          : "shop";

    station[bucket] += record.amount;
    station.total += record.amount;
    station.transactions += 1;
    if (record.date > station.date) {
      station.date = record.date;
    }
  });

  return Array.from(grouped.values()).sort(
    (left, right) => right.total - left.total,
  );
}

export function buildStationPerformanceFromSummary(records) {
  const grouped = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    const stationId = record.stationId || "";
    const stationName = record.station || "";
    const groupKey = stationId || stationName;

    if (!groupKey) {
      return;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        stationId,
        station: stationName,
        date: record.date || "",
        fuel: 0,
        shop: 0,
        cement: 0,
        total: 0,
        transactions: 0,
      });
    }

    const summary = grouped.get(groupKey);
    summary.fuel += Number(record.fuelSales || 0);
    summary.shop += Number(record.shopSales || 0);
    summary.cement += Number(record.cementSales || 0);
    summary.total += Number(record.totalSales || 0);
    summary.transactions += Number(record.transactions || 0);

    if ((record.date || "") > summary.date) {
      summary.date = record.date || "";
    }
  });

  return Array.from(grouped.values()).sort((left, right) => right.total - left.total);
}

export function buildTopStationChartData(records, limit = 3) {
  return buildStationPerformance(records)
    .slice(0, limit)
    .map((station) => ({
      label: station.station,
      value: station.total,
    }));
}

export function buildTopStationChartDataFromSummary(records, limit = 3) {
  return buildStationPerformanceFromSummary(records)
    .slice(0, limit)
    .map((station) => ({
      label: station.station,
      stationId: station.stationId,
      value: station.total,
    }));
}

export function buildStationDailyBreakdown(records, stationName) {
  const grouped = new Map();

  records
    .filter((record) => record.station === stationName)
    .forEach((record) => {
      if (!grouped.has(record.date)) {
        grouped.set(record.date, {
          date: record.date,
          fuel: 0,
          shop: 0,
          cement: 0,
          total: 0,
          transactions: 0,
        });
      }

      const day = grouped.get(record.date);
      const bucket =
        record.type === "Fuel"
          ? "fuel"
          : record.type === "Cement"
            ? "cement"
            : "shop";

      day[bucket] += record.amount;
      day.total += record.amount;
      day.transactions += 1;
    });

  return Array.from(grouped.values()).sort((left, right) =>
    right.date.localeCompare(left.date),
  );
}

export function buildStationDailyBreakdownFromSummary(records, stationId) {
  const grouped = new Map();

  (Array.isArray(records) ? records : [])
    .filter((record) => `${record.stationId || ""}` === `${stationId || ""}`)
    .forEach((record) => {
      if (!grouped.has(record.date)) {
        grouped.set(record.date, {
          date: record.date || "",
          fuel: 0,
          shop: 0,
          cement: 0,
          total: 0,
          transactions: 0,
        });
      }

      const day = grouped.get(record.date);
      day.fuel += Number(record.fuelSales || 0);
      day.shop += Number(record.shopSales || 0);
      day.cement += Number(record.cementSales || 0);
      day.total += Number(record.totalSales || 0);
      day.transactions += Number(record.transactions || 0);
    });

  return Array.from(grouped.values()).sort((left, right) =>
    right.date.localeCompare(left.date),
  );
}

export function buildStationTransactions(records, stationName, date) {
  return records
    .filter((record) => record.station === stationName && record.date === date)
    .sort(
      (left, right) =>
        `${right.saleDate || ""}`.localeCompare(`${left.saleDate || ""}`) ||
        right.amount - left.amount,
    )
    .map((record) => ({
      date: record.date,
      saleDate: record.saleDate || record.date,
      station: record.station,
      category: record.type,
      item: record.item,
      cashierName: record.cashierName || "",
      quantity: record.quantity,
      amount: record.amount,
    }));
}

export function getBestCategory(values) {
  const categories = [
    { label: "Fuel", value: values.fuel || 0 },
    { label: "Shop", value: values.shop || 0 },
    { label: "Cement", value: values.cement || 0 },
  ];

  return categories.sort((left, right) => right.value - left.value)[0];
}

export function buildAggregateSummary(values) {
  const bestCategory = getBestCategory(values);

  return [
    {
      title: "Total Sales",
      value: `D${(values.total || 0).toLocaleString()}`,
      icon: "💰",
    },
    {
      title: "Transactions",
      value: (values.transactions || 0).toLocaleString(),
      icon: "🧾",
    },
    {
      title: "Best Category",
      value: `${bestCategory.label} · D${bestCategory.value.toLocaleString()}`,
      icon: "🏆",
    },
  ];
}

export function buildTransactionSummary(records) {
  const summary = records.reduce(
    (totals, record) => {
      totals.total += record.amount;
      totals.transactions += 1;
      if (record.category === "Fuel") {
        totals.fuel += record.amount;
      } else if (record.category === "Cement") {
        totals.cement += record.amount;
      } else {
        totals.shop += record.amount;
      }
      return totals;
    },
    { total: 0, transactions: 0, fuel: 0, shop: 0, cement: 0 },
  );

  return buildAggregateSummary(summary);
}
