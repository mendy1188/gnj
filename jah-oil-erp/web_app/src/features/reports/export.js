import {
  filterFuelDeliveriesForSession,
  filterIncomingStockRecordsForSession,
  filterInventoryRecordsForSession,
  filterSalesRecordsForSession,
  isBranchManager,
  isPrivilegedRole,
} from "@/features/auth/scopes";
import { buildBulkFuelPurchaseRows } from "@/features/bulk-fuel/helpers";
import {
  getReportDefinition,
  getReportScopeLabel,
} from "@/features/reports/catalog";
import { buildSimpleReportPdf } from "@/features/reports/pdf";
import {
  getCouponMovementsData,
  getCustomerBalanceAccountsData,
  getCustomerBalanceMovementsData,
  getFuelDeliveriesData,
  getIncomingStockData,
  getInventoryData,
  getProductsData,
  getReversedPosTransactionsData,
  getSalesDataForDateRange,
  getSalesDataFresh,
  getStationCategoryDailySummaryData,
  getStationProductDailySummaryData,
} from "@/lib/data/appwrite-data";

function normalizeString(value) {
  return `${value || ""}`.trim();
}

function normalizeFilterValue(value) {
  const normalizedValue = normalizeString(value);

  return normalizedValue.toLowerCase() === "all" ? "" : normalizedValue;
}

function normalizeDateValue(value) {
  const normalizedValue = `${value || ""}`.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

function normalizeFileToken(value) {
  return `${value || ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const REPORT_TIME_ZONE = "Africa/Accra";

function formatReportTemporalValue(
  value,
  { includeTime = false, timeZone = REPORT_TIME_ZONE } = {},
) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return "";
  }

  const hasTimeComponent =
    normalizedValue.includes("T") || /\d{2}:\d{2}/.test(normalizedValue);
  const date = hasTimeComponent
    ? new Date(normalizedValue)
    : new Date(`${normalizedValue.slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(includeTime
      ? {
          hour: "numeric",
          minute: "2-digit",
        }
      : {}),
    timeZone,
  }).format(date);
}

function formatDateTimeForDisplay(value) {
  return formatReportTemporalValue(value, { includeTime: true });
}

function formatDateForDisplay(value) {
  return formatReportTemporalValue(value, { includeTime: false });
}

function getCurrentDateInReportTimeZone() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIME_ZONE,
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

function parseDateOnlyToUtcMillis(value) {
  const normalizedValue = `${value || ""}`.trim().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return Number.NaN;
  }

  return Date.parse(`${normalizedValue}T00:00:00Z`);
}

function getDaysPastDue(dueDate, todayDate = getCurrentDateInReportTimeZone()) {
  const dueTime = parseDateOnlyToUtcMillis(dueDate);
  const todayTime = parseDateOnlyToUtcMillis(todayDate);

  if (!Number.isFinite(dueTime) || !Number.isFinite(todayTime) || todayTime <= dueTime) {
    return 0;
  }

  return Math.floor((todayTime - dueTime) / (1000 * 60 * 60 * 24));
}

function escapeCsvCell(value) {
  const normalizedValue =
    value === null || value === undefined ? "" : String(value);

  if (
    normalizedValue.includes(",") ||
    normalizedValue.includes('"') ||
    normalizedValue.includes("\n")
  ) {
    return `"${normalizedValue.replace(/"/g, '""')}"`;
  }

  return normalizedValue;
}

function formatValueForColumn(column, rawValue, mode = "csv") {
  if (column?.format === "date") {
    return formatDateForDisplay(rawValue);
  }

  if (column?.format === "datetime") {
    return formatDateTimeForDisplay(rawValue);
  }

  if (column?.format === "currency") {
    return mode === "pdf"
      ? `D${Number(rawValue || 0).toLocaleString()}`
      : Number(rawValue || 0);
  }

  if (column?.format === "number") {
    return mode === "pdf"
      ? Number(rawValue || 0).toLocaleString()
      : Number(rawValue || 0);
  }

  return rawValue ?? "";
}

function buildFormattedRows(columns, rows, mode = "csv") {
  const sourceColumns = Array.isArray(columns) ? columns : [];
  const sourceRows = Array.isArray(rows) ? rows : [];

  return sourceRows.map((row) =>
    Object.fromEntries(
      sourceColumns.map((column) => [
        column.key,
        formatValueForColumn(column, row?.[column.key], mode),
      ]),
    ),
  );
}

function buildCsvContent(columns, rows) {
  const sourceColumns = Array.isArray(columns) ? columns : [];
  const normalizedRows = Array.isArray(rows) ? rows : [];

  if (normalizedRows.length === 0) {
    return "No data available\n";
  }

  const headers =
    sourceColumns.length > 0
      ? sourceColumns.map((column) => column.key)
      : Object.keys(normalizedRows[0]);
  const lines = [
    headers.map((header) => escapeCsvCell(header)).join(","),
    ...normalizedRows.map((row) =>
      headers.map((header) => escapeCsvCell(row[header])).join(","),
    ),
  ];

  return `${lines.join("\n")}\n`;
}

function normalizeReportFilters(filters = {}) {
  return {
    rangePreset: normalizeFilterValue(filters.rangePreset),
    fromDate: normalizeDateValue(filters.fromDate),
    toDate: normalizeDateValue(filters.toDate),
    station: normalizeFilterValue(filters.station),
    category: normalizeFilterValue(filters.category),
    item: normalizeFilterValue(filters.item),
    cashier: normalizeFilterValue(filters.cashier),
    status: normalizeFilterValue(filters.status),
    product: normalizeFilterValue(filters.product),
    recordedBy: normalizeFilterValue(filters.recordedBy),
    paymentMethod: normalizeFilterValue(filters.paymentMethod),
    company: normalizeFilterValue(filters.company),
    client: normalizeFilterValue(filters.client),
    direction: normalizeFilterValue(filters.direction),
    actor: normalizeFilterValue(filters.actor),
  };
}

function getRecordDate(value) {
  return `${value || ""}`.slice(0, 10);
}

function isWithinDateRange(value, fromDate, toDate) {
  const recordDate = getRecordDate(value);

  if (!recordDate) {
    return false;
  }

  if (fromDate && recordDate < fromDate) {
    return false;
  }

  if (toDate && recordDate > toDate) {
    return false;
  }

  return true;
}

function matchesFilter(value, expectedValue) {
  if (!expectedValue) {
    return true;
  }

  return normalizeString(value) === expectedValue;
}

function buildOptions(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeString(value))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function getAccessibleSalesTypes(session) {
  const allowedModules = new Set(
    Array.isArray(session?.modules) ? session.modules : [],
  );
  const allowedTypes = [];

  if (allowedModules.has("fuel-sales")) {
    allowedTypes.push("Fuel");
  }

  if (allowedModules.has("commodities-sales")) {
    allowedTypes.push("Shop");
  }

  if (allowedModules.has("cement")) {
    allowedTypes.push("Cement");
  }

  return allowedTypes;
}

async function getScopedSalesRecords(session, allowedTypes = []) {
  const salesRecords = await getSalesDataFresh();

  return filterSalesRecordsForSession(salesRecords, session, {
    allowedTypes:
      allowedTypes.length > 0 ? allowedTypes : getAccessibleSalesTypes(session),
  }).sort(
    (left, right) =>
      `${right.saleDate || right.date || ""}`.localeCompare(
        `${left.saleDate || left.date || ""}`,
      ) ||
      `${left.station || ""}`.localeCompare(`${right.station || ""}`) ||
      `${left.item || ""}`.localeCompare(`${right.item || ""}`),
  );
}

async function getScopedSalesRecordsForRange(
  session,
  {
    allowedTypes = [],
    startDate = "",
    endDate = "",
  } = {},
) {
  const salesRecords =
    startDate || endDate
      ? await getSalesDataForDateRange({ startDate, endDate })
      : await getSalesDataFresh();

  return filterSalesRecordsForSession(salesRecords, session, {
    allowedTypes:
      allowedTypes.length > 0 ? allowedTypes : getAccessibleSalesTypes(session),
  }).sort(
    (left, right) =>
      `${right.saleDate || right.date || ""}`.localeCompare(
        `${left.saleDate || left.date || ""}`,
      ) ||
      `${left.station || ""}`.localeCompare(`${right.station || ""}`) ||
      `${left.item || ""}`.localeCompare(`${right.item || ""}`),
  );
}

function buildSalesSummaryRows(records) {
  return Array.from(Array.isArray(records) ? records : []).map((record) => ({
    date: record.date || "",
    station: record.station || "",
    category: record.category || toDisplayCategory(record.categoryKey),
    line_count: Number(record.transactions || 0),
    total_quantity: Number(record.totalQuantity || 0),
    total_amount: Number(record.totalAmount || 0),
  })).sort(
    (left, right) =>
      `${right.date || ""}`.localeCompare(`${left.date || ""}`) ||
      `${left.station || ""}`.localeCompare(`${right.station || ""}`) ||
      `${left.category || ""}`.localeCompare(`${right.category || ""}`),
  );
}

function buildStationPerformanceRows(records) {
  const grouped = new Map();

  records.forEach((record) => {
    const key = normalizeString(record.station || "Unknown station");
    const current = grouped.get(key) || {
      station: key,
      line_count: 0,
      quantity: 0,
      fuel_sales: 0,
      commodity_sales: 0,
      cement_sales: 0,
      total_sales: 0,
    };

    const amount = Number(record.totalAmount || record.amount || 0);
    current.line_count += Number(record.transactions || 0) || 0;
    current.quantity += Number(record.totalQuantity || record.quantity || 0);
    current.total_sales += amount;

    const category =
      record.category || record.type || toDisplayCategory(record.categoryKey);

    if (category === "Fuel") {
      current.fuel_sales += amount;
    } else if (category === "Shop") {
      current.commodity_sales += amount;
    } else if (category === "Cement") {
      current.cement_sales += amount;
    }

    grouped.set(key, current);
  });

  return Array.from(grouped.values()).sort(
    (left, right) =>
      Number(right.total_sales || 0) - Number(left.total_sales || 0) ||
      `${left.station || ""}`.localeCompare(`${right.station || ""}`),
  );
}

function normalizeCategoryKey(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();

  if (normalizedValue === "fuel") {
    return "fuel";
  }

  if (normalizedValue === "cement") {
    return "cement";
  }

  if (normalizedValue === "shop") {
    return "shop";
  }

  return normalizedValue;
}

function toDisplayCategory(category) {
  const normalizedCategory = normalizeCategoryKey(category);

  if (normalizedCategory === "fuel") {
    return "Fuel";
  }

  if (normalizedCategory === "cement") {
    return "Cement";
  }

  return "Shop";
}

function toDisplayCategoryOrEmpty(category) {
  const normalizedCategory = normalizeCategoryKey(category);

  if (!normalizedCategory) {
    return "";
  }

  return toDisplayCategory(normalizedCategory);
}

function inferProductCategory(category, productName = "") {
  const normalizedCategory = normalizeCategoryKey(category);

  if (["fuel", "shop", "cement"].includes(normalizedCategory)) {
    return normalizedCategory;
  }

  const normalizedProductName = `${productName || ""}`.trim().toLowerCase();

  if (
    normalizedProductName.includes("petrol") ||
    normalizedProductName.includes("diesel")
  ) {
    return "fuel";
  }

  if (normalizedProductName.includes("cement")) {
    return "cement";
  }

  return "shop";
}

function filterStationProductSummaryRecordsForSession(records, session) {
  if (isPrivilegedRole(session?.roleName)) {
    return Array.isArray(records) ? records : [];
  }

  if (!session?.branchName) {
    return [];
  }

  return (Array.isArray(records) ? records : []).filter(
    (record) => normalizeString(record.station) === normalizeString(session.branchName),
  );
}

function ensureStationProductSummaryRecord(map, key, seed) {
  if (!map.has(key)) {
    map.set(key, {
      date: seed.date,
      stationId: seed.stationId || "",
      station: seed.station || "",
      productId: seed.productId || "",
      productName: seed.productName || "",
      category: toDisplayCategory(seed.category),
      unit: seed.unit || "",
      receivedQuantity: 0,
      soldQuantity: 0,
      soldAmount: 0,
      netQuantity: 0,
      transactions: 0,
    });
  }

  return map.get(key);
}

async function buildStationProductSummaryRecordsFromRaw(session, filters = {}) {
  const [incomingRecords, salesRecords, products] = await Promise.all([
    getIncomingStockData(),
    getScopedSalesRecordsForRange(session, {
      startDate: filters.fromDate,
      endDate: filters.toDate,
    }),
    getProductsData(),
  ]);
  const grouped = new Map();
  const productsById = new Map(
    (Array.isArray(products) ? products : []).map((product) => [product.id, product]),
  );
  const productsByName = new Map(
    (Array.isArray(products) ? products : []).map((product) => [
      `${product.name || ""}`.trim().toLowerCase(),
      product,
    ]),
  );
  const scopedIncoming = filterIncomingStockRecordsForSession(incomingRecords, session);

  scopedIncoming.forEach((record) => {
    const date = `${record.recordedAt || record.date || ""}`.slice(0, 10);
    const station = `${record.station || ""}`.trim();
    const stationId = `${record.stationId || ""}`.trim();
    const productName = `${record.productName || ""}`.trim();
    const productId = `${record.productId || ""}`.trim();

    if (
      !date ||
      !station ||
      !productName ||
      !isWithinDateRange(date, filters.fromDate, filters.toDate)
    ) {
      return;
    }

    const productMeta =
      productsById.get(productId) ||
      productsByName.get(productName.toLowerCase()) ||
      null;
    const summary = ensureStationProductSummaryRecord(
      grouped,
      [date, stationId || station, productId || productName].join("::"),
      {
        date,
        stationId,
        station,
        productId,
        productName,
        category: inferProductCategory(productMeta?.category, productName),
        unit: record.unit || productMeta?.unit || "",
      },
    );
    const quantity = Number(record.quantityAdded || 0);

    summary.receivedQuantity += quantity;
    summary.netQuantity += quantity;
  });

  salesRecords.forEach((record) => {
    const date = `${record.saleDate || record.date || ""}`.slice(0, 10);
    const station = `${record.station || ""}`.trim();
    const stationId = `${record.stationId || ""}`.trim();
    const productName = `${record.item || ""}`.trim();

    if (!date || !station || !productName) {
      return;
    }

    const productMeta = productsByName.get(productName.toLowerCase()) || null;
    const summary = ensureStationProductSummaryRecord(
      grouped,
      [date, stationId || station, productName].join("::"),
      {
        date,
        stationId,
        station,
        productId: productMeta?.id || "",
        productName,
        category: inferProductCategory(record.type, productName),
        unit: productMeta?.unit || "",
      },
    );
    const quantity = Number(record.quantity || 0);
    const amount = Number(record.amount || 0);

    summary.soldQuantity += quantity;
    summary.soldAmount += amount;
    summary.netQuantity -= quantity;
    summary.transactions += 1;
  });

  return Array.from(grouped.values()).sort(
    (left, right) =>
      `${right.date || ""}`.localeCompare(`${left.date || ""}`) ||
      `${left.station || ""}`.localeCompare(`${right.station || ""}`) ||
      `${left.productName || ""}`.localeCompare(`${right.productName || ""}`),
  );
}

function filterStationCategorySummaryRecordsForSession(records, session) {
  if (isPrivilegedRole(session?.roleName)) {
    return Array.isArray(records) ? records : [];
  }

  if (!session?.branchName) {
    return [];
  }

  return (Array.isArray(records) ? records : []).filter(
    (record) => normalizeString(record.station) === normalizeString(session.branchName),
  );
}

function ensureStationCategorySummaryRecord(map, key, seed) {
  if (!map.has(key)) {
    map.set(key, {
      date: seed.date,
      stationId: seed.stationId || "",
      station: seed.station || "",
      category: seed.category || toDisplayCategory(seed.categoryKey),
      categoryKey: seed.categoryKey || normalizeCategoryKey(seed.category),
      totalQuantity: 0,
      totalAmount: 0,
      transactions: 0,
    });
  }

  return map.get(key);
}

function buildStationCategorySummaryRecordsFromStationProduct(records) {
  const grouped = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    const categoryKey = normalizeCategoryKey(record.categoryKey || record.category);

    if (!record.date || !record.station || !categoryKey) {
      return;
    }

    const summary = ensureStationCategorySummaryRecord(
      grouped,
      [record.date, record.stationId || record.station, categoryKey].join("::"),
      {
        date: record.date,
        stationId: record.stationId || "",
        station: record.station,
        category: toDisplayCategory(categoryKey),
        categoryKey,
      },
    );

    summary.totalQuantity += Number(record.soldQuantity || 0);
    summary.totalAmount += Number(record.soldAmount || 0);
    summary.transactions += Number(record.transactions || 0);
  });

  return Array.from(grouped.values()).sort(
    (left, right) =>
      `${right.date || ""}`.localeCompare(`${left.date || ""}`) ||
      `${left.station || ""}`.localeCompare(`${right.station || ""}`) ||
      `${left.category || ""}`.localeCompare(`${right.category || ""}`),
  );
}

function buildStationCategorySummaryRecordsFromRaw(records) {
  const grouped = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    const category = record.type || record.category;
    const categoryKey = normalizeCategoryKey(category);

    if (!record.date || !record.station || !categoryKey) {
      return;
    }

    const summary = ensureStationCategorySummaryRecord(
      grouped,
      [record.date, record.stationId || record.station, categoryKey].join("::"),
      {
        date: record.date,
        stationId: record.stationId || "",
        station: record.station,
        category: toDisplayCategory(categoryKey),
        categoryKey,
      },
    );

    summary.totalQuantity += Number(record.quantity || 0);
    summary.totalAmount += Number(record.amount || 0);
    summary.transactions += 1;
  });

  return Array.from(grouped.values()).sort(
    (left, right) =>
      `${right.date || ""}`.localeCompare(`${left.date || ""}`) ||
      `${left.station || ""}`.localeCompare(`${right.station || ""}`) ||
      `${left.category || ""}`.localeCompare(`${right.category || ""}`),
  );
}

async function getStationCategorySummaryRecords(session, filters) {
  const categorySummaryRecords = filterStationCategorySummaryRecordsForSession(
    await getStationCategoryDailySummaryData({
      startDate: filters.fromDate,
      endDate: filters.toDate,
      stationName: filters.station,
      category: normalizeCategoryKey(filters.category),
    }),
    session,
  );

  if (categorySummaryRecords.length > 0) {
    return categorySummaryRecords;
  }

  const stationProductSummaryRecords = await getStationProductSummaryRecords(
    session,
    filters,
  );

  if (stationProductSummaryRecords.length > 0) {
    return buildStationCategorySummaryRecordsFromStationProduct(
      stationProductSummaryRecords,
    );
  }

  return buildStationCategorySummaryRecordsFromRaw(
    await getScopedSalesRecordsForRange(session, {
      startDate: filters.fromDate,
      endDate: filters.toDate,
    }),
  );
}

async function getStationProductSummaryRecords(session, filters) {
  const summaryRecords = filterStationProductSummaryRecordsForSession(
    await getStationProductDailySummaryData({
      startDate: filters.fromDate,
      endDate: filters.toDate,
      stationName: filters.station,
      productName: filters.product,
      category: normalizeCategoryKey(filters.category),
    }),
    session,
  );

  if (summaryRecords.length > 0) {
    return summaryRecords;
  }

  return buildStationProductSummaryRecordsFromRaw(session, filters);
}

function buildStockReconciliationRows(records) {
  const grouped = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    const key = [
      normalizeString(record.station),
      normalizeString(record.productName),
    ].join("::");
    const current = grouped.get(key) || {
      station: record.station || "",
      product: record.productName || "",
      category: record.category || toDisplayCategory(record.categoryKey),
      unit: record.unit || "",
      received_quantity: 0,
      sold_quantity: 0,
      net_quantity: 0,
      sold_amount: 0,
      transactions: 0,
    };

    current.received_quantity += Number(record.receivedQuantity || 0);
    current.sold_quantity += Number(record.soldQuantity || 0);
    current.net_quantity += Number(record.netQuantity || 0);
    current.sold_amount += Number(record.soldAmount || 0);
    current.transactions += Number(record.transactions || 0);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).sort(
    (left, right) =>
      Number(right.sold_amount || 0) - Number(left.sold_amount || 0) ||
      `${left.station || ""}`.localeCompare(`${right.station || ""}`) ||
      `${left.product || ""}`.localeCompare(`${right.product || ""}`),
  );
}

function buildBestPerformingStationRows(records) {
  const grouped = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    const stationKey = normalizeString(record.station);
    const current = grouped.get(stationKey) || {
      station: record.station || "",
      sold_quantity: 0,
      sold_amount: 0,
      transactions: 0,
      average_sale: 0,
    };

    current.sold_quantity += Number(record.soldQuantity || 0);
    current.sold_amount += Number(record.soldAmount || 0);
    current.transactions += Number(record.transactions || 0);
    grouped.set(stationKey, current);
  });

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      average_sale:
        Number(row.transactions || 0) > 0
          ? Number(row.sold_amount || 0) / Number(row.transactions || 0)
          : 0,
    }))
    .sort(
      (left, right) =>
        Number(right.sold_amount || 0) - Number(left.sold_amount || 0) ||
        `${left.station || ""}`.localeCompare(`${right.station || ""}`),
    );
}

function buildStockReconciliationSummaryCards(rows) {
  const totals = (Array.isArray(rows) ? rows : []).reduce(
    (summary, row) => {
      summary.received += Number(row.received_quantity || 0);
      summary.sold += Number(row.sold_quantity || 0);
      summary.net += Number(row.net_quantity || 0);
      summary.amount += Number(row.sold_amount || 0);
      return summary;
    },
    { received: 0, sold: 0, net: 0, amount: 0 },
  );

  return [
    {
      title: "Received Qty",
      value: totals.received.toLocaleString(),
      icon: "📥",
    },
    {
      title: "Sold Qty",
      value: totals.sold.toLocaleString(),
      icon: "🧾",
    },
    {
      title: "Net Movement",
      value: totals.net.toLocaleString(),
      icon: "⚖️",
    },
    {
      title: "Sales Value",
      value: `D${totals.amount.toLocaleString()}`,
      icon: "💰",
    },
  ];
}

function buildBestPerformingStationSummaryCards(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const totals = sourceRows.reduce(
    (summary, row) => {
      summary.amount += Number(row.sold_amount || 0);
      summary.quantity += Number(row.sold_quantity || 0);
      summary.transactions += Number(row.transactions || 0);
      return summary;
    },
    { amount: 0, quantity: 0, transactions: 0 },
  );
  const topStation = sourceRows[0] || null;

  return [
    {
      title: "Total Sales",
      value: `D${totals.amount.toLocaleString()}`,
      icon: "💰",
    },
    {
      title: "Quantity Sold",
      value: totals.quantity.toLocaleString(),
      icon: "📦",
    },
    {
      title: "Stations Ranked",
      value: sourceRows.length.toLocaleString(),
      icon: "🏢",
    },
    {
      title: "Top Station",
      value: topStation
        ? `${topStation.station} · D${Number(topStation.sold_amount || 0).toLocaleString()}`
        : "—",
      icon: "🏆",
    },
  ];
}

function buildOutstandingCreditSummaryCards(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const totals = sourceRows.reduce(
    (summary, row) => {
      summary.outstanding += Number(row.outstanding_amount || 0);

      if (Number(row.days_overdue || 0) > 0) {
        summary.overdueCount += 1;
        summary.overdueAmount += Number(row.outstanding_amount || 0);
      }

      return summary;
    },
    {
      outstanding: 0,
      overdueCount: 0,
      overdueAmount: 0,
    },
  );

  return [
    {
      title: "Outstanding Accounts",
      value: sourceRows.length.toLocaleString(),
      icon: "🧾",
    },
    {
      title: "Outstanding Total",
      value: `D${totals.outstanding.toLocaleString()}`,
      icon: "💰",
    },
    {
      title: "Overdue Accounts",
      value: totals.overdueCount.toLocaleString(),
      icon: "⏰",
    },
    {
      title: "Overdue Amount",
      value: `D${totals.overdueAmount.toLocaleString()}`,
      icon: "📞",
    },
  ];
}

function buildBestPerformingStationChart(rows, productLabel = "") {
  const normalizedProductLabel = `${productLabel || ""}`.trim();

  return {
    title: normalizedProductLabel
      ? `Best Performing Stations · ${normalizedProductLabel}`
      : "Best Performing Stations · All Products",
    data: (Array.isArray(rows) ? rows : []).slice(0, 8).map((row) => ({
      label: row.station,
      value: Number(row.sold_amount || 0),
    })),
  };
}

function buildSalesTransactionRows(records) {
  return records.map((record) => ({
    sale_date: record.saleDate || record.date || "",
    station: record.station || "",
    category: record.type || "",
    item: record.item || "",
    cashier: record.cashierName || "",
    customer_name: record.customerName || "",
    customer_phone: record.customerPhone || "",
    quantity: Number(record.quantity || 0),
    amount: Number(record.amount || 0),
  }));
}

function buildInventoryRows(records) {
  return records.map((record) => ({
    station: record.station || "",
    product: record.name || "",
    category: record.category || "",
    quantity: Number(record.quantity || 0),
    unit: record.unit || "",
    reorder_level: Number(record.reorderLevel || 0),
    status: record.status || "",
  }));
}

function buildIncomingStockRows(records) {
  return records.map((record) => ({
    recorded_at: record.recordedAt || "",
    station: record.station || "",
    product: record.productName || "",
    category: record.category || "",
    quantity_added: Number(record.quantityAdded || 0),
    previous_quantity: Number(record.previousQuantity || 0),
    new_quantity: Number(record.newQuantity || 0),
    unit: record.unit || "",
    recorded_by: record.recordedBy || "",
    notes: record.notes || "",
  }));
}

function buildFuelDeliveryRows(records) {
  return records.map((record) => ({
    delivery_date: record.deliveryDate || record.date || "",
    station: record.station || "",
    fuel_type: record.type || "",
    quantity: Number(record.quantity || 0),
    status: record.status || "",
    recorded_by: record.recordedBy || "",
  }));
}

function buildCouponMovementRows(records) {
  return records.map((record) => ({
    movement_date: record.movementDate || "",
    company: record.companyName || "",
    purchase_reference: record.purchaseReference || "",
    coupon_code: record.couponCode || "",
    station: record.stationName || "",
    direction: record.direction || "",
    amount_delta: Number(record.amountDelta || 0),
    balance_after: Number(record.balanceAfter || 0),
    receipt_number: record.receiptNumber || "",
    actor: record.actorName || "",
    notes: record.notes || "",
  }));
}

function buildBulkFuelRows(records) {
  return records.map((record) => ({
    client_name: record.clientName || "",
    client_phone: record.clientPhone || "",
    address: record.address || "",
    station: record.stationName || "",
    product: record.productName || "",
    reference_code: record.referenceCode || "",
    purchase_amount: Number(record.purchaseAmount || 0),
    redeemed_amount: Number(record.redeemedAmount || 0),
    available_balance: Number(record.availableBalance || 0),
    status: record.status || "",
    created_at: record.createdAt || "",
    updated_at: record.updatedAt || "",
  }));
}

function buildCreditSettlementRows(records) {
  return records.map((record) => ({
    movement_date: record.movementDate || "",
    customer_name: record.customerName || "",
    customer_phone: record.customerPhone || "",
    station: record.stationName || "",
    product: record.productName || "",
    category: record.category || "",
    receipt_number: record.receiptNumber || "",
    settled_amount: Math.abs(Number(record.amountDelta || 0)),
    balance_after: Number(record.balanceAmount || 0),
    actor: record.actorName || "",
    reference_code: record.referenceCode || "",
    notes: record.notes || "",
  }));
}

function buildOutstandingCreditAccountRows(records) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      customer_name: record.customerName || "",
      customer_phone: record.customerPhone || "",
      station: record.stationName || "",
      product: record.productName || "",
      category: record.category || "",
      date_recorded: record.createdAt || record.updatedAt || "",
      outstanding_amount: Number(record.balanceAmount || 0),
      next_payment_date: record.dueDate || "",
      days_overdue: Number(record.daysOverdue || 0),
      status: record.followUpStatus || "",
      reference_code: record.referenceCode || "",
    }))
    .sort(
      (left, right) =>
        Number(right.days_overdue || 0) - Number(left.days_overdue || 0) ||
        Number(right.outstanding_amount || 0) - Number(left.outstanding_amount || 0) ||
        `${left.customer_name || ""}`.localeCompare(`${right.customer_name || ""}`),
    );
}

function buildReversedTransactionRows(records) {
  return records.map((record) => ({
    reversed_at: record.reversedAt || record.saleDate || "",
    station: record.station || "",
    receipt_number: record.receiptNumber || "",
    items: record.itemSummary || "",
    cashier: record.cashierName || "",
    customer_name: record.customerName || "",
    customer_phone: record.customerPhone || "",
    payment_method: record.paymentMethod || "",
    amount: Number(record.amount || 0),
    reversed_by: record.reversedBy || "",
  }));
}

function getPreviewColumns(reportKey) {
  const columnMap = {
    "sales-summary": [
      {
        key: "date",
        label: "Date",
        format: "date",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "station", label: "Station" },
      { key: "category", label: "Category" },
      { key: "line_count", label: "Lines", format: "number" },
      { key: "total_quantity", label: "Quantity", format: "number" },
      { key: "total_amount", label: "Amount", format: "currency", pdfWidth: 14 },
    ],
    "commodity-sales": [
      {
        key: "sale_date",
        label: "Sale Date",
        format: "datetime",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "station", label: "Station" },
      { key: "item", label: "Item" },
      { key: "cashier", label: "Cashier" },
      { key: "quantity", label: "Quantity", format: "number" },
      { key: "amount", label: "Amount", format: "currency", pdfWidth: 12 },
    ],
    "cement-sales": [
      {
        key: "sale_date",
        label: "Sale Date",
        format: "datetime",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "station", label: "Station" },
      { key: "item", label: "Item" },
      { key: "cashier", label: "Cashier" },
      { key: "quantity", label: "Quantity", format: "number" },
      { key: "amount", label: "Amount", format: "currency", pdfWidth: 12 },
    ],
    "fuel-sales": [
      {
        key: "sale_date",
        label: "Sale Date",
        format: "datetime",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "station", label: "Station" },
      { key: "item", label: "Item" },
      { key: "cashier", label: "Cashier" },
      { key: "quantity", label: "Quantity", format: "number" },
      { key: "amount", label: "Amount", format: "currency", pdfWidth: 12 },
    ],
    "station-performance": [
      { key: "station", label: "Station" },
      { key: "line_count", label: "Lines", format: "number" },
      { key: "quantity", label: "Quantity", format: "number" },
      { key: "fuel_sales", label: "Fuel", format: "currency", pdfWidth: 10 },
      { key: "commodity_sales", label: "Shop", format: "currency", pdfWidth: 10 },
      { key: "cement_sales", label: "Cement", format: "currency", pdfWidth: 10 },
      { key: "total_sales", label: "Total", format: "currency", pdfWidth: 10 },
    ],
    "inventory-snapshot": [
      { key: "station", label: "Station" },
      { key: "product", label: "Product" },
      { key: "category", label: "Category" },
      { key: "quantity", label: "Quantity", format: "number" },
      { key: "unit", label: "Unit" },
      { key: "reorder_level", label: "Reorder", format: "number" },
      { key: "status", label: "Status" },
    ],
    "incoming-stock-history": [
      {
        key: "recorded_at",
        label: "Recorded At",
        format: "datetime",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "station", label: "Station" },
      { key: "product", label: "Product" },
      { key: "category", label: "Category" },
      { key: "quantity_added", label: "Added", format: "number" },
      { key: "new_quantity", label: "New Qty", format: "number" },
      { key: "recorded_by", label: "Recorded By" },
    ],
    "fuel-delivery-log": [
      {
        key: "delivery_date",
        label: "Delivery Date",
        format: "datetime",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "station", label: "Station" },
      { key: "fuel_type", label: "Fuel" },
      { key: "quantity", label: "Quantity", format: "number" },
      { key: "status", label: "Status" },
      { key: "recorded_by", label: "Recorded By" },
    ],
    "stock-reconciliation": [
      { key: "station", label: "Station" },
      { key: "product", label: "Product" },
      { key: "category", label: "Category" },
      { key: "received_quantity", label: "Received", format: "number" },
      { key: "sold_quantity", label: "Sold", format: "number" },
      { key: "net_quantity", label: "Net", format: "number" },
      { key: "sold_amount", label: "Sales Value", format: "currency", pdfWidth: 12 },
      { key: "transactions", label: "Transactions", format: "number" },
    ],
    "best-performing-stations": [
      { key: "station", label: "Station" },
      { key: "sold_quantity", label: "Quantity Sold", format: "number" },
      { key: "sold_amount", label: "Sales Value", format: "currency", pdfWidth: 12 },
      { key: "transactions", label: "Transactions", format: "number" },
      { key: "average_sale", label: "Avg Sale", format: "currency", pdfWidth: 12 },
    ],
    "coupon-activity": [
      {
        key: "movement_date",
        label: "Movement Date",
        format: "datetime",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "company", label: "Company" },
      { key: "coupon_code", label: "Coupon" },
      { key: "station", label: "Station" },
      { key: "direction", label: "Direction" },
      { key: "amount_delta", label: "Amount", format: "currency", pdfWidth: 12 },
      { key: "balance_after", label: "Balance", format: "currency", pdfWidth: 12 },
    ],
    "bulk-fuel-purchases": [
      { key: "client_name", label: "Client" },
      { key: "station", label: "Station" },
      { key: "product", label: "Product" },
      { key: "reference_code", label: "Reference" },
      { key: "purchase_amount", label: "Purchase", format: "currency", pdfWidth: 12 },
      { key: "redeemed_amount", label: "Redeemed", format: "currency", pdfWidth: 12 },
      { key: "available_balance", label: "Balance", format: "currency", pdfWidth: 12 },
      { key: "status", label: "Status" },
    ],
    "credit-settlement-history": [
      {
        key: "movement_date",
        label: "Settlement Date",
        format: "datetime",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "customer_name", label: "Customer" },
      { key: "station", label: "Station" },
      { key: "product", label: "Product" },
      { key: "category", label: "Category" },
      { key: "settled_amount", label: "Settled", format: "currency", pdfWidth: 12 },
      { key: "balance_after", label: "Balance", format: "currency", pdfWidth: 12 },
      { key: "actor", label: "Actor" },
    ],
    "outstanding-credit-accounts": [
      { key: "customer_name", label: "Customer" },
      { key: "customer_phone", label: "Contact" },
      { key: "station", label: "Station" },
      { key: "product", label: "Product" },
      { key: "category", label: "Category" },
      {
        key: "date_recorded",
        label: "Date Recorded",
        format: "datetime",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "outstanding_amount", label: "Outstanding", format: "currency", pdfWidth: 12 },
      {
        key: "next_payment_date",
        label: "Next Payment Date",
        format: "date",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "days_overdue", label: "Days Overdue", format: "number" },
      { key: "status", label: "Status" },
      { key: "reference_code", label: "Reference" },
    ],
    "reversed-pos-transactions": [
      {
        key: "reversed_at",
        label: "Reversed At",
        format: "datetime",
        timeZone: REPORT_TIME_ZONE,
      },
      { key: "station", label: "Station" },
      { key: "receipt_number", label: "Receipt" },
      { key: "cashier", label: "Cashier" },
      { key: "payment_method", label: "Payment" },
      { key: "amount", label: "Amount", format: "currency", pdfWidth: 12 },
      { key: "reversed_by", label: "Reversed By" },
    ],
  };

  return columnMap[reportKey] || [];
}

function buildSummary(records, amountKeys = []) {
  const sourceRecords = Array.isArray(records) ? records : [];
  const totals = {};

  amountKeys.forEach((key) => {
    totals[key] = sourceRecords.reduce(
      (sum, record) => sum + Number(record?.[key] || 0),
      0,
    );
  });

  return {
    rowCount: sourceRecords.length,
    totals,
  };
}

function buildDateRangeSubtitle(reportTitle, filters) {
  const fromLabel = filters.fromDate
    ? formatDateForDisplay(filters.fromDate)
    : "All dates";
  const toLabel = filters.toDate
    ? formatDateForDisplay(filters.toDate)
    : "Today";
  return `${reportTitle} · ${fromLabel} to ${toLabel}`;
}

function humanizeMetricKey(key) {
  return `${key || ""}`
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildSummaryText(summary) {
  const rowCount = Number(summary?.rowCount || 0);
  const totals = Object.entries(summary?.totals || {}).slice(0, 3);
  const fragments = [`Rows: ${rowCount.toLocaleString()}`];

  totals.forEach(([key, value]) => {
    const isCurrencyMetric =
      /(amount|sales|balance|redeemed|purchase|settled)/i.test(key);

    fragments.push(
      `${humanizeMetricKey(key)}: ${
        isCurrencyMetric
          ? `D${Number(value || 0).toLocaleString()}`
          : Number(value || 0).toLocaleString()
      }`,
    );
  });

  return fragments.join("  |  ");
}

function buildFilterOptionsFromRecords(records, config = {}) {
  const sourceRecords = Array.isArray(records) ? records : [];

  return Object.fromEntries(
    Object.entries(config).map(([optionsKey, extractor]) => [
      optionsKey,
      buildOptions(sourceRecords.map((record) => extractor(record))),
    ]),
  );
}

async function buildSalesSummaryDataset(session, filters) {
  const sourceRecords = await getStationCategorySummaryRecords(session, filters);
  const filterOptions = buildFilterOptionsFromRecords(sourceRecords, {
    stationOptions: (record) => record.station,
    categoryOptions: (record) => record.category,
  });
  const filteredRecords = sourceRecords.filter(
    (record) =>
      isWithinDateRange(record.date, filters.fromDate, filters.toDate) &&
      matchesFilter(record.station, filters.station) &&
      matchesFilter(record.category, filters.category),
  );
  const rows = buildSalesSummaryRows(filteredRecords);

  return {
    columns: getPreviewColumns("sales-summary"),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["total_amount", "total_quantity"]),
  };
}

async function buildSalesTransactionDataset(session, filters, allowedTypes, reportKey) {
  const sourceRecords = await getScopedSalesRecordsForRange(session, {
    allowedTypes,
    startDate: filters.fromDate,
    endDate: filters.toDate,
  });
  const filterOptions = buildFilterOptionsFromRecords(sourceRecords, {
    stationOptions: (record) => record.station,
    itemOptions: (record) => record.item,
    cashierOptions: (record) => record.cashierName,
  });
  const filteredRecords = sourceRecords.filter(
    (record) =>
      isWithinDateRange(record.saleDate || record.date, filters.fromDate, filters.toDate) &&
      matchesFilter(record.station, filters.station) &&
      matchesFilter(record.item, filters.item) &&
      matchesFilter(record.cashierName, filters.cashier),
  );
  const rows = buildSalesTransactionRows(filteredRecords);

  return {
    columns: getPreviewColumns(reportKey),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["amount", "quantity"]),
  };
}

async function buildStationPerformanceDataset(session, filters) {
  const sourceRecords = await getStationCategorySummaryRecords(session, filters);
  const filterOptions = buildFilterOptionsFromRecords(sourceRecords, {
    stationOptions: (record) => record.station,
    categoryOptions: (record) => record.category,
  });
  const filteredRecords = sourceRecords.filter(
    (record) =>
      isWithinDateRange(record.date, filters.fromDate, filters.toDate) &&
      matchesFilter(record.category, filters.category) &&
      matchesFilter(record.station, filters.station),
  );
  const rows = buildStationPerformanceRows(filteredRecords);

  return {
    columns: getPreviewColumns("station-performance"),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["fuel_sales", "commodity_sales", "cement_sales", "total_sales"]),
  };
}

async function buildInventoryDataset(session, filters) {
  const [inventoryRecords, products] = await Promise.all([
    getInventoryData(),
    getProductsData(),
  ]);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productsByName = new Map(
    products.map((product) => [`${product.name || ""}`.trim().toLowerCase(), product]),
  );
  const sourceRecords = filterInventoryRecordsForSession(inventoryRecords, session).map(
    (record) => {
      const product =
        productsById.get(record.productId || "") ||
        productsByName.get(`${record.name || ""}`.trim().toLowerCase()) ||
        null;

      return {
        ...record,
        category: toDisplayCategoryOrEmpty(product?.category || ""),
      };
    },
  );
  const filterOptions = buildFilterOptionsFromRecords(sourceRecords, {
    stationOptions: (record) => record.station,
    productOptions: (record) => record.name,
    categoryOptions: (record) => record.category,
    statusOptions: (record) => record.status,
  });
  const filteredRecords = sourceRecords.filter(
    (record) =>
      matchesFilter(record.station, filters.station) &&
      matchesFilter(record.name, filters.product) &&
      matchesFilter(record.category, filters.category) &&
      matchesFilter(record.status, filters.status),
  );
  const rows = buildInventoryRows(filteredRecords);

  return {
    columns: getPreviewColumns("inventory-snapshot"),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["quantity"]),
  };
}

async function buildIncomingStockDataset(session, filters) {
  const [incomingStockRecords, products] = await Promise.all([
    getIncomingStockData(),
    getProductsData(),
  ]);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productsByName = new Map(
    products.map((product) => [`${product.name || ""}`.trim().toLowerCase(), product]),
  );
  const sourceRecords = filterIncomingStockRecordsForSession(
    incomingStockRecords,
    session,
  ).map((record) => {
    const product =
      productsById.get(record.productId || "") ||
      productsByName.get(`${record.productName || ""}`.trim().toLowerCase()) ||
      null;

    return {
      ...record,
      category: toDisplayCategoryOrEmpty(product?.category || ""),
    };
  });
  const filterOptions = buildFilterOptionsFromRecords(sourceRecords, {
    stationOptions: (record) => record.station,
    productOptions: (record) => record.productName,
    categoryOptions: (record) => record.category,
    recordedByOptions: (record) => record.recordedBy,
  });
  const filteredRecords = sourceRecords.filter(
    (record) =>
      isWithinDateRange(record.recordedAt || record.date, filters.fromDate, filters.toDate) &&
      matchesFilter(record.station, filters.station) &&
      matchesFilter(record.productName, filters.product) &&
      matchesFilter(record.category, filters.category) &&
      matchesFilter(record.recordedBy, filters.recordedBy),
  );
  const rows = buildIncomingStockRows(filteredRecords);

  return {
    columns: getPreviewColumns("incoming-stock-history"),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["quantity_added", "new_quantity"]),
  };
}

async function buildFuelDeliveryDataset(session, filters) {
  const sourceRecords = filterFuelDeliveriesForSession(
    await getFuelDeliveriesData(),
    session,
  );
  const filterOptions = buildFilterOptionsFromRecords(sourceRecords, {
    stationOptions: (record) => record.station,
    productOptions: (record) => record.type,
    statusOptions: (record) => record.status,
    recordedByOptions: (record) => record.recordedBy,
  });
  const filteredRecords = sourceRecords.filter(
    (record) =>
      isWithinDateRange(record.deliveryDate || record.date, filters.fromDate, filters.toDate) &&
      matchesFilter(record.station, filters.station) &&
      matchesFilter(record.type, filters.product) &&
      matchesFilter(record.status, filters.status) &&
      matchesFilter(record.recordedBy, filters.recordedBy),
  );
  const rows = buildFuelDeliveryRows(filteredRecords);

  return {
    columns: getPreviewColumns("fuel-delivery-log"),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["quantity"]),
  };
}

async function buildStockReconciliationDataset(session, filters) {
  const sourceRecords = await getStationProductSummaryRecords(session, filters);
  const filterOptions = buildFilterOptionsFromRecords(sourceRecords, {
    stationOptions: (record) => record.station,
    productOptions: (record) => record.productName,
    categoryOptions: (record) => record.category,
  });
  const filteredRecords = sourceRecords.filter(
    (record) =>
      isWithinDateRange(record.date, filters.fromDate, filters.toDate) &&
      matchesFilter(record.station, filters.station) &&
      matchesFilter(record.category, filters.category) &&
      matchesFilter(record.productName, filters.product),
  );
  const rows = buildStockReconciliationRows(filteredRecords);

  return {
    columns: getPreviewColumns("stock-reconciliation"),
    rows,
    filterOptions,
    summary: buildSummary(rows, [
      "received_quantity",
      "sold_quantity",
      "net_quantity",
      "sold_amount",
    ]),
    summaryCards: buildStockReconciliationSummaryCards(rows),
  };
}

async function buildBestPerformingStationsDataset(session, filters) {
  const sourceRecords = await getStationProductSummaryRecords(session, filters);
  const filterOptions = buildFilterOptionsFromRecords(sourceRecords, {
    productOptions: (record) => record.productName,
    categoryOptions: (record) => record.category,
  });
  const filteredRecords = sourceRecords.filter(
    (record) =>
      isWithinDateRange(record.date, filters.fromDate, filters.toDate) &&
      matchesFilter(record.category, filters.category) &&
      matchesFilter(record.productName, filters.product),
  );
  const rows = buildBestPerformingStationRows(filteredRecords);

  return {
    columns: getPreviewColumns("best-performing-stations"),
    rows,
    filterOptions,
    summary: buildSummary(rows, [
      "sold_quantity",
      "sold_amount",
      "transactions",
    ]),
    summaryCards: buildBestPerformingStationSummaryCards(rows),
    chart: buildBestPerformingStationChart(rows, filters.product),
  };
}

async function buildCouponActivityDataset(session, filters) {
  const sourceRecords = await getCouponMovementsData();
  const scopedRecords = isPrivilegedRole(session?.roleName)
    ? sourceRecords
    : sourceRecords.filter(
        (record) => normalizeString(record.stationName) === normalizeString(session?.branchName),
      );
  const filterOptions = buildFilterOptionsFromRecords(scopedRecords, {
    companyOptions: (record) => record.companyName,
    stationOptions: (record) => record.stationName,
    directionOptions: (record) => record.direction,
  });
  const filteredRecords = scopedRecords.filter(
    (record) =>
      isWithinDateRange(record.movementDate, filters.fromDate, filters.toDate) &&
      matchesFilter(record.companyName, filters.company) &&
      matchesFilter(record.stationName, filters.station) &&
      matchesFilter(record.direction, filters.direction),
  );
  const rows = buildCouponMovementRows(filteredRecords);

  return {
    columns: getPreviewColumns("coupon-activity"),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["amount_delta", "balance_after"]),
  };
}

async function buildBulkFuelDataset(session, filters) {
  const [balanceAccounts, movementRecords] = await Promise.all([
    getCustomerBalanceAccountsData(),
    getCustomerBalanceMovementsData(),
  ]);
  const sourceRows = buildBulkFuelPurchaseRows(balanceAccounts, movementRecords);
  const scopedRows = isPrivilegedRole(session?.roleName)
    ? sourceRows
    : sourceRows.filter(
        (record) => normalizeString(record.stationName) === normalizeString(session?.branchName),
      );
  const filterOptions = buildFilterOptionsFromRecords(scopedRows, {
    clientOptions: (record) => record.clientName,
    productOptions: (record) => record.productName,
    statusOptions: (record) => record.status,
  });
  const filteredRows = scopedRows.filter(
    (record) =>
      isWithinDateRange(record.createdAt || record.updatedAt, filters.fromDate, filters.toDate) &&
      matchesFilter(record.clientName, filters.client) &&
      matchesFilter(record.productName, filters.product) &&
      matchesFilter(record.status, filters.status),
  );
  const rows = buildBulkFuelRows(filteredRows);

  return {
    columns: getPreviewColumns("bulk-fuel-purchases"),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["purchase_amount", "redeemed_amount", "available_balance"]),
  };
}

async function buildCreditSettlementDataset(session, filters) {
  const [accounts, movements, products] = await Promise.all([
    getCustomerBalanceAccountsData(),
    getCustomerBalanceMovementsData(),
    getProductsData(),
  ]);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productsByName = new Map(
    products.map((product) => [`${product.name || ""}`.trim().toLowerCase(), product]),
  );
  const sourceRecords = movements
    .filter(
      (record) =>
        record.accountType === "credit" &&
        `${record.direction || ""}`.toLowerCase() === "debit",
    )
    .map((record) => ({
      ...record,
      customerName: accountsById.get(record.accountId)?.customerName || "",
      customerPhone: accountsById.get(record.accountId)?.customerPhone || "",
      stationName:
        record.stationName || accountsById.get(record.accountId)?.stationName || "",
      productName:
        record.productName || accountsById.get(record.accountId)?.productName || "",
      category: toDisplayCategoryOrEmpty(
        productsById.get(
          record.productId || accountsById.get(record.accountId)?.productId || "",
        )?.category ||
          productsByName.get(
            `${record.productName || accountsById.get(record.accountId)?.productName || ""}`
              .trim()
              .toLowerCase(),
          )?.category ||
          "",
      ),
    }));
  const scopedRecords = isPrivilegedRole(session?.roleName)
    ? sourceRecords
    : sourceRecords.filter(
        (record) => normalizeString(record.stationName) === normalizeString(session?.branchName),
      );
  const filterOptions = buildFilterOptionsFromRecords(scopedRecords, {
    stationOptions: (record) => record.stationName,
    clientOptions: (record) => record.customerName,
    categoryOptions: (record) => record.category,
    actorOptions: (record) => record.actorName,
  });
  const filteredRecords = scopedRecords.filter(
    (record) =>
      isWithinDateRange(record.movementDate, filters.fromDate, filters.toDate) &&
      matchesFilter(record.stationName, filters.station) &&
      matchesFilter(record.customerName, filters.client) &&
      matchesFilter(record.category, filters.category) &&
      matchesFilter(record.actorName, filters.actor),
  );
  const rows = buildCreditSettlementRows(filteredRecords);

  return {
    columns: getPreviewColumns("credit-settlement-history"),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["settled_amount", "balance_after"]),
  };
}

async function buildOutstandingCreditAccountsDataset(session, filters) {
  const [accounts, movements, products] = await Promise.all([
    getCustomerBalanceAccountsData(),
    getCustomerBalanceMovementsData(),
    getProductsData(),
  ]);
  const movementProductNameByAccountId = new Map();

  movements.forEach((record) => {
    const accountId = normalizeString(record.accountId);
    const productName = normalizeString(record.productName);

    if (!accountId || !productName || movementProductNameByAccountId.has(accountId)) {
      return;
    }

    movementProductNameByAccountId.set(accountId, productName);
  });

  const productsById = new Map(products.map((product) => [product.id, product]));
  const productsByName = new Map(
    products.map((product) => [`${product.name || ""}`.trim().toLowerCase(), product]),
  );
  const todayDate = getCurrentDateInReportTimeZone();
  const sourceRecords = accounts
    .filter(
      (record) =>
        record.accountType === "credit" && Number(record.balanceAmount || 0) > 0,
    )
    .map((record) => {
      const productName =
        record.productName || movementProductNameByAccountId.get(record.id) || "";
      const product =
        productsById.get(record.productId || "") ||
        productsByName.get(`${productName || ""}`.trim().toLowerCase()) ||
        null;
      const dueDate = getRecordDate(record.dueDate || "");
      const daysOverdue = getDaysPastDue(dueDate, todayDate);
      const normalizedStatus = `${record.status || ""}`.trim().toLowerCase();
      const followUpStatus =
        daysOverdue > 0 && normalizedStatus === "active"
          ? "Overdue"
          : normalizedStatus === "suspended"
            ? "Suspended"
            : normalizedStatus === "inactive"
              ? "Inactive"
              : "Active";

      return {
        ...record,
        productName,
        category: toDisplayCategoryOrEmpty(product?.category || record.productCategory || ""),
        daysOverdue,
        followUpStatus,
      };
    });
  const scopedRecords = isPrivilegedRole(session?.roleName)
    ? sourceRecords
    : sourceRecords.filter(
        (record) => normalizeString(record.stationName) === normalizeString(session?.branchName),
      );
  const filterOptions = buildFilterOptionsFromRecords(scopedRecords, {
    stationOptions: (record) => record.stationName,
    categoryOptions: (record) => record.category,
    productOptions: (record) => record.productName,
    statusOptions: (record) => record.followUpStatus,
    clientOptions: (record) => record.customerName,
  });
  const filteredRecords = scopedRecords.filter(
    (record) =>
      isWithinDateRange(
        record.dueDate || record.updatedAt || record.createdAt,
        filters.fromDate,
        filters.toDate,
      ) &&
      matchesFilter(record.stationName, filters.station) &&
      matchesFilter(record.category, filters.category) &&
      matchesFilter(record.productName, filters.product) &&
      matchesFilter(record.followUpStatus, filters.status) &&
      matchesFilter(record.customerName, filters.client),
  );
  const rows = buildOutstandingCreditAccountRows(filteredRecords);

  return {
    columns: getPreviewColumns("outstanding-credit-accounts"),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["outstanding_amount"]),
    summaryCards: buildOutstandingCreditSummaryCards(rows),
  };
}

async function buildReversedTransactionsDataset(session, filters) {
  const sourceRecords = await getReversedPosTransactionsData(
    isPrivilegedRole(session?.roleName)
      ? {}
      : {
          stationId: session?.branchId || "",
          branchName: session?.branchName || "",
        },
  );
  const filterOptions = buildFilterOptionsFromRecords(sourceRecords, {
    stationOptions: (record) => record.station,
    cashierOptions: (record) => record.cashierName,
    paymentMethodOptions: (record) => record.paymentMethod,
    actorOptions: (record) => record.reversedBy,
  });
  const filteredRecords = sourceRecords.filter(
    (record) =>
      isWithinDateRange(record.reversedAt || record.saleDate, filters.fromDate, filters.toDate) &&
      matchesFilter(record.station, filters.station) &&
      matchesFilter(record.cashierName, filters.cashier) &&
      matchesFilter(record.paymentMethod, filters.paymentMethod) &&
      matchesFilter(record.reversedBy, filters.actor),
  );
  const rows = buildReversedTransactionRows(filteredRecords);

  return {
    columns: getPreviewColumns("reversed-pos-transactions"),
    rows,
    filterOptions,
    summary: buildSummary(rows, ["amount"]),
  };
}

export async function buildReportDataset(reportKey, session, filters = {}) {
  const report = getReportDefinition(reportKey);

  if (!report) {
    throw new Error("Requested report was not found.");
  }

  if (
    report.requiredModuleKey &&
    !session?.modules?.includes(report.requiredModuleKey)
  ) {
    throw new Error("You do not have access to view this report.");
  }

  const normalizedFilters = normalizeReportFilters(filters);
  let dataset;

  if (report.key === "sales-summary") {
    dataset = await buildSalesSummaryDataset(session, normalizedFilters);
  } else if (report.key === "commodity-sales") {
    dataset = await buildSalesTransactionDataset(
      session,
      normalizedFilters,
      ["Shop"],
      report.key,
    );
  } else if (report.key === "cement-sales") {
    dataset = await buildSalesTransactionDataset(
      session,
      normalizedFilters,
      ["Cement"],
      report.key,
    );
  } else if (report.key === "fuel-sales") {
    dataset = await buildSalesTransactionDataset(
      session,
      normalizedFilters,
      ["Fuel"],
      report.key,
    );
  } else if (report.key === "station-performance") {
    dataset = await buildStationPerformanceDataset(session, normalizedFilters);
  } else if (report.key === "inventory-snapshot") {
    dataset = await buildInventoryDataset(session, normalizedFilters);
  } else if (report.key === "incoming-stock-history") {
    dataset = await buildIncomingStockDataset(session, normalizedFilters);
  } else if (report.key === "fuel-delivery-log") {
    dataset = await buildFuelDeliveryDataset(session, normalizedFilters);
  } else if (report.key === "stock-reconciliation") {
    dataset = await buildStockReconciliationDataset(session, normalizedFilters);
  } else if (report.key === "best-performing-stations") {
    dataset = await buildBestPerformingStationsDataset(
      session,
      normalizedFilters,
    );
  } else if (report.key === "coupon-activity") {
    dataset = await buildCouponActivityDataset(session, normalizedFilters);
  } else if (report.key === "bulk-fuel-purchases") {
    dataset = await buildBulkFuelDataset(session, normalizedFilters);
  } else if (report.key === "credit-settlement-history") {
    dataset = await buildCreditSettlementDataset(session, normalizedFilters);
  } else if (report.key === "outstanding-credit-accounts") {
    dataset = await buildOutstandingCreditAccountsDataset(
      session,
      normalizedFilters,
    );
  } else if (report.key === "reversed-pos-transactions") {
    dataset = await buildReversedTransactionsDataset(session, normalizedFilters);
  } else {
    throw new Error("Report preview is not configured.");
  }

  return {
    report,
    filters: normalizedFilters,
    columns: dataset.columns,
    rows: dataset.rows,
    filterOptions: dataset.filterOptions || {},
    summary: dataset.summary || { rowCount: dataset.rows.length, totals: {} },
    summaryCards: dataset.summaryCards || [],
    chart: dataset.chart || null,
  };
}

export async function buildReportExport(
  reportKey,
  session,
  { format = "csv", filters = {} } = {},
) {
  const dataset = await buildReportDataset(reportKey, session, filters);
  const normalizedFormat = `${format || "csv"}`.trim().toLowerCase();
  const exportedAt = new Date().toISOString().slice(0, 10);
  const scopePart = isPrivilegedRole(session?.roleName)
    ? "all-stations"
    : isBranchManager(session?.roleName)
      ? normalizeFileToken(session?.branchName || "branch")
      : normalizeFileToken(session?.fullName || "my-records");
  const baseFileName = [
    "report",
    normalizeFileToken(reportKey),
    scopePart,
    exportedAt,
  ].join("-");

  if (normalizedFormat === "pdf") {
    const pdf = buildSimpleReportPdf({
      title: dataset.report.title,
      subtitle: buildDateRangeSubtitle(dataset.report.title, dataset.filters),
      columns: dataset.columns,
      rows: buildFormattedRows(dataset.columns, dataset.rows, "pdf"),
      brandName: "JAH MULTI INDUSTRIES",
      scopeLabel: getReportScopeLabel(session),
      generatedAt: formatDateTimeForDisplay(new Date().toISOString()),
      generatedBy: session?.fullName || "System",
      summaryText: buildSummaryText(dataset.summary),
    });

    return {
      report: dataset.report,
      filename: `${baseFileName}.pdf`,
      mimeType: "application/pdf",
      body: pdf,
      rowCount: dataset.rows.length,
    };
  }

  return {
    report: dataset.report,
    filename: `${baseFileName}.csv`,
    mimeType: "text/csv; charset=utf-8",
    body: `\uFEFF${buildCsvContent(
      dataset.columns,
      buildFormattedRows(dataset.columns, dataset.rows, "csv"),
    )}`,
    rowCount: dataset.rows.length,
  };
}

export function buildReportPreviewPayload(dataset) {
  return {
    report: {
      key: dataset.report.key,
      title: dataset.report.title,
      description: dataset.report.description,
      includes: dataset.report.includes,
      recommendedUse: dataset.report.recommendedUse,
      filters: dataset.report.filters || [],
    },
    columns: dataset.columns,
    rows: dataset.rows,
    filterOptions: dataset.filterOptions,
    summary: dataset.summary,
    summaryCards: dataset.summaryCards,
    chart: dataset.chart,
    appliedFilters: dataset.filters,
  };
}
