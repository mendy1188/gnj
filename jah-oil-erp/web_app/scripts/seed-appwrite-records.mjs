#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";

import {
  createAdminConfig,
  createDocument,
  isAlreadyExistsError,
  loadEnvFiles,
  parseArgs,
  validateAdminConfig,
} from "./lib/appwrite-admin.mjs";
import { loadMockData } from "./lib/mock-data.mjs";

const DEFAULT_ADMIN_EMAIL = "admin@jahoil.com";
const DEFAULT_ADMIN_PASSWORD = "admin@jahoil123";
const ROLE_DEFINITIONS = [
  {
    documentId: "role_admin",
    code: "admin",
    name: "Admin",
    branchRequired: false,
    modules: [
      "dashboard",
      "stations",
      "inventory",
      "incoming-stock",
      "product-settings",
      "cement",
      "fuel-deliveries",
      "fuel-sales",
      "commodities-sales",
      "pos",
      "reports",
      "admin",
    ],
  },
  {
    documentId: "role_general_manager",
    code: "general_manager",
    name: "General Manager",
    branchRequired: false,
    modules: [
      "dashboard",
      "stations",
      "inventory",
      "incoming-stock",
      "product-settings",
      "cement",
      "fuel-deliveries",
      "fuel-sales",
      "commodities-sales",
      "pos",
      "reports",
    ],
  },
  {
    documentId: "role_branch_manager",
    code: "branch_manager",
    name: "Branch Manager",
    branchRequired: true,
    modules: [
      "dashboard",
      "stations",
      "inventory",
      "incoming-stock",
      "cement",
      "commodities-sales",
      "reports",
    ],
  },
  {
    documentId: "role_general_sales",
    code: "general_sales",
    name: "General Sales",
    branchRequired: true,
    modules: ["dashboard", "commodities-sales", "cement", "pos", "reports"],
  },
  {
    documentId: "role_fuel_sales",
    code: "fuel_sales",
    name: "Fuel Sales",
    branchRequired: true,
    modules: ["dashboard", "fuel-sales", "pos", "reports"],
  },
];

loadEnvFiles();

const cliArgs = parseArgs(process.argv.slice(2), {
  booleanFlags: ["dry-run", "help"],
});
const config = createAdminConfig(cliArgs);

if (cliArgs.help) {
  printUsage();
  process.exit(0);
}

validateAdminConfig(config);

const mockData = loadMockData();

main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);

  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }

  process.exit(1);
});

async function main() {
  const stations = buildStations(mockData.stations);
  const products = buildProducts(mockData);
  const productPriceHistory = buildProductPriceHistory(products);
  const inventoryItems = buildInventory(mockData.inventory, stations, products, mockData.salesData);
  const incomingStockRecords = buildIncomingStockRecords(inventoryItems);
  const deliveries = buildFuelDeliveries(mockData.fuelDeliveries, stations, products);
  const roles = buildRoles();
  const users = buildUsers();
  const opsReceipts = buildOpsReceipts(mockData.salesData, stations, products);
  const posReceipts = buildPosReceipts(stations, products, mockData.salesData);
  const allReceipts = [...opsReceipts, ...posReceipts];
  const receiptItems = allReceipts.flatMap((receipt) => receipt.items);
  const {
    stationDailySummaries,
    cashierDailySummaries,
  } = buildSalesSummaries(allReceipts);

  console.log(`Using Appwrite endpoint: ${config.apiBaseUrl}`);
  console.log(`Target database ID: ${config.databaseId}`);

  if (config.dryRun) {
    console.log("Dry run only. No Appwrite API requests will be sent.");
    printSummary({
      stations,
      products,
      productPriceHistory,
      inventoryItems,
      incomingStockRecords,
      deliveries,
      roles,
      users,
      receipts: allReceipts,
      receiptItems,
      stationDailySummaries,
      cashierDailySummaries,
    });
    return;
  }

  await seedCollection("stations", stations);
  await seedCollection("products", products);
  await seedCollection("product_price_history", productPriceHistory);
  await seedCollection("inventory_items", inventoryItems);
  await seedCollection("incoming_stock_records", incomingStockRecords);
  await seedCollection("fuel_deliveries", deliveries);
  await seedCollection("app_roles", roles);
  await seedCollection("app_users", users);
  await seedCollection("station_daily_summary", stationDailySummaries);
  await seedCollection("cashier_daily_summary", cashierDailySummaries);
  await seedCollection(
    "sales_receipts",
    allReceipts.map(({ documentId, data }) => ({ documentId, data })),
  );
  await seedCollection("sales_receipt_items", receiptItems);

  console.log("Appwrite records seeded successfully.");
  printSummary({
    stations,
    products,
    productPriceHistory,
    inventoryItems,
    incomingStockRecords,
    deliveries,
    roles,
    users,
    receipts: allReceipts,
    receiptItems,
    stationDailySummaries,
    cashierDailySummaries,
  });
}

async function seedCollection(collectionId, records) {
  let created = 0;
  let skipped = 0;

  for (const record of records) {
    try {
      await createDocument(config, collectionId, record.documentId, cleanData(record.data));
      created += 1;
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        skipped += 1;
        continue;
      }

      throw error;
    }
  }

  console.log(`${collectionId}: created ${created}, skipped ${skipped}`);
}

function buildStations(stationRecords) {
  return stationRecords.map((station) => {
    const code = toUpperCode(station.location || station.name);
    const documentId = buildDocumentId("st", station.name);

    return {
      documentId,
      data: {
        name: station.name,
        code,
        location: station.location,
        status: normalizeStationStatus(station.status),
        manager_name: station.manager,
        manager_phone: "",
        latitude: null,
        longitude: null,
      },
    };
  });
}

function buildProducts({ salesData, inventory, fuelDeliveries }) {
  const byName = new Map();
  const inventoryUnits = new Map(inventory.map((item) => [item.name, item.unit]));
  const salesGroups = groupBy(salesData, (record) => record.item);

  for (const delivery of fuelDeliveries) {
    const productName = delivery.type;
    if (!byName.has(productName)) {
      byName.set(productName, {
        name: productName,
        category: normalizeCategory(productName),
        unit: inventoryUnits.get(productName) || "liters",
      });
    }
  }

  for (const sale of salesData) {
    if (!byName.has(sale.item)) {
      byName.set(sale.item, {
        name: sale.item,
        category: normalizeCategory(sale.type, sale.item),
        unit: inventoryUnits.get(sale.item) || inferUnit(sale.item, sale.type),
      });
    }
  }

  for (const inventoryItem of inventory) {
    if (!byName.has(inventoryItem.name)) {
      byName.set(inventoryItem.name, {
        name: inventoryItem.name,
        category: normalizeCategory(inventoryItem.name),
        unit: inventoryItem.unit,
      });
    }
  }

  return Array.from(byName.values()).map((product) => {
    const productSales = salesGroups.get(product.name) || [];
    const totalQuantity = productSales.reduce((sum, record) => sum + Number(record.quantity || 0), 0);
    const totalAmount = productSales.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const sellingPrice =
      totalQuantity > 0 ? Number((totalAmount / totalQuantity).toFixed(2)) : fallbackPrice(product.name);
    const sku = `${product.category}-${slugify(product.name)}`.toUpperCase().slice(0, 64);

    return {
      documentId: buildDocumentId("prd", product.name),
      data: {
        name: product.name,
        sku,
        category: product.category,
        unit: product.unit,
        status: "active",
        selling_price: sellingPrice,
        description: `Seeded from mock ERP data for ${product.name}.`,
      },
    };
  });
}

function buildInventory(inventoryRecords, stations, products, salesData) {
  const stationIds = new Map(stations.map((station) => [station.data.name, station.documentId]));
  const productMap = new Map(products.map((product) => [product.data.name, product]));
  const latestSaleDate = salesData.reduce(
    (latest, record) => (record.date > latest ? record.date : latest),
    "",
  );

  return inventoryRecords.map((record) => {
    const stationId = stationIds.get(record.station);
    const product = productMap.get(record.name);

    if (!stationId || !product) {
      throw new Error(`Inventory mapping failed for ${record.station} / ${record.name}`);
    }

    return {
      documentId: buildDocumentId("inv", `${record.station}-${record.name}`),
      data: {
        station_id: stationId,
        station_name: record.station,
        product_id: product.documentId,
        product_name: record.name,
        category: product.data.category,
        quantity: Number(record.quantity),
        unit: record.unit,
        reorder_level: Number(record.reorderLevel),
        status: getInventoryStatus(record.quantity, record.reorderLevel),
        last_updated_at: toIsoDateTime(latestSaleDate, 23, 59),
      },
    };
  });
}

function buildProductPriceHistory(products) {
  const changedAt = new Date().toISOString();

  return products.map((product) => ({
    documentId: buildDocumentId("pph", product.data.name),
    data: {
      product_id: product.documentId,
      product_name: product.data.name,
      previous_price: 0,
      new_price: Number(product.data.selling_price || 0),
      changed_at: changedAt,
      changed_by_user_id: "seed-system",
      changed_by_name: "System Seed",
      notes: "Initial seeded selling price.",
    },
  }));
}

function buildFuelDeliveries(deliveryRecords, stations, products) {
  const stationIds = new Map(stations.map((station) => [station.data.name, station.documentId]));
  const productMap = new Map(products.map((product) => [product.data.name, product]));

  return deliveryRecords.map((delivery) => {
    const stationId = stationIds.get(delivery.station);
    const product = productMap.get(delivery.type);

    if (!stationId || !product) {
      throw new Error(`Fuel delivery mapping failed for ${delivery.station} / ${delivery.type}`);
    }

    return {
      documentId: buildDocumentId("fdl", `${delivery.id}-${delivery.station}-${delivery.type}`),
      data: {
        station_id: stationId,
        station_name: delivery.station,
        product_id: product.documentId,
        product_name: delivery.type,
        delivery_date: toIsoDateTime(delivery.date, 9, delivery.id),
        quantity: Number(delivery.quantity),
        unit: "liters",
        status: normalizeDeliveryStatus(delivery.status),
        supplier: "Jah Oil Supply",
        reference_no: `FDL-${String(delivery.id).padStart(4, "0")}`,
        driver_name: "",
        recorded_by: "Warehouse Team",
        notes: `Imported from mock fuel delivery #${delivery.id}.`,
      },
    };
  });
}

function buildIncomingStockRecords(inventoryItems) {
  return inventoryItems.map((inventoryItem, index) => {
    const newQuantity = Number(inventoryItem.data.quantity || 0);
    const quantityAdded = Math.max(1, Math.round(newQuantity * 0.2));
    const previousQuantity = Math.max(0, newQuantity - quantityAdded);

    return {
      documentId: buildDocumentId(
        "isr",
        `${inventoryItem.data.station_name}-${inventoryItem.data.product_name}`,
      ),
      data: {
        inventory_item_id: inventoryItem.documentId,
        station_id: inventoryItem.data.station_id,
        station_name: inventoryItem.data.station_name,
        product_id: inventoryItem.data.product_id,
        product_name: inventoryItem.data.product_name,
        quantity_added: quantityAdded,
        previous_quantity: previousQuantity,
        new_quantity: newQuantity,
        unit: inventoryItem.data.unit,
        recorded_at: toIsoDateTime("2026-06-08", 8 + (index % 10), index % 60),
        recorded_by: "Warehouse Team",
        notes: `Seeded incoming stock record for ${inventoryItem.data.product_name}.`,
      },
    };
  });
}

function buildRoles() {
  return ROLE_DEFINITIONS.map((role) => ({
    documentId: role.documentId,
    data: {
      code: role.code,
      name: role.name,
      modules_json: JSON.stringify(role.modules),
      branch_required: role.branchRequired,
      status: "active",
    },
  }));
}

function buildUsers() {
  const now = new Date().toISOString();

  return [
    {
      documentId: buildDocumentId("usr", DEFAULT_ADMIN_EMAIL),
      data: {
        full_name: "System Admin",
        email: DEFAULT_ADMIN_EMAIL,
        role_id: "role_admin",
        role_name: "Admin",
        branch_station_id: "",
        branch_station_name: "",
        password_hash: hashPassword(DEFAULT_ADMIN_PASSWORD),
        must_change_password: false,
        status: "active",
        created_at: now,
        updated_at: now,
      },
    },
  ];
}

function buildOpsReceipts(salesRecords, stations, products) {
  const stationIds = new Map(stations.map((station) => [station.data.name, station.documentId]));
  const productMap = new Map(products.map((product) => [product.data.name, product]));

  return salesRecords.map((sale) => {
    const stationId = stationIds.get(sale.station);
    const product = productMap.get(sale.item);

    if (!stationId || !product) {
      throw new Error(`Sales mapping failed for ${sale.station} / ${sale.item}`);
    }

    const receiptNumber = `OPS-${sale.date.replaceAll("-", "")}-${String(sale.id).padStart(4, "0")}`;
    const documentId = buildDocumentId("rcp", receiptNumber);
    const saleDate = toIsoDateTime(sale.date, 8 + (sale.id % 10), sale.id % 60);
    const unitPrice =
      sale.quantity > 0 ? Number((Number(sale.amount) / Number(sale.quantity)).toFixed(2)) : 0;

    return {
      documentId,
      data: {
        receipt_number: receiptNumber,
        station_id: stationId,
        station_name: sale.station,
        sale_date: saleDate,
        source: "ops",
        subtotal: Number(sale.amount),
        tax_amount: 0,
        discount_amount: 0,
        total_amount: Number(sale.amount),
        payment_method: "cash",
        payment_method_code: "cash",
        payment_method_label: "Cash",
        status: "completed",
        cashier_name: "Imported Ops",
        customer_name: "",
        notes: `Imported from mock sales row #${sale.id}.`,
      },
      items: [
        {
          documentId: buildDocumentId("rit", `${receiptNumber}-1`),
          data: {
            receipt_id: documentId,
            receipt_number: receiptNumber,
            sale_date: saleDate,
            station_id: stationId,
            station_name: sale.station,
            product_id: product.documentId,
            product_name: sale.item,
            category: product.data.category,
            line_number: 1,
            quantity: Number(sale.quantity),
            unit: product.data.unit,
            unit_price: unitPrice,
            line_total: Number(sale.amount),
          },
        },
      ],
    };
  });
}

function buildPosReceipts(stations, products, salesData) {
  const stationIds = new Map(stations.map((station) => [station.data.name, station.documentId]));
  const productMap = new Map(products.map((product) => [product.data.name, product]));
  const latestDate = salesData.reduce(
    (latest, record) => (record.date > latest ? record.date : latest),
    "",
  );
  const templates = [
    {
      station: "Banjul Station",
      receiptNumber: `POS-${latestDate.replaceAll("-", "")}-0001`,
      saleDate: toIsoDateTime(latestDate, 17, 10),
      paymentMethod: "cash",
      cashierName: "POS Counter 1",
      lines: [
        { productName: "Rice", quantity: 2 },
        { productName: "Cooking Oil", quantity: 1 },
      ],
    },
    {
      station: "Serekunda Station",
      receiptNumber: `POS-${latestDate.replaceAll("-", "")}-0002`,
      saleDate: toIsoDateTime(latestDate, 17, 18),
      paymentMethod: "card",
      cashierName: "POS Counter 2",
      lines: [
        { productName: "Sugar", quantity: 1 },
        { productName: "Onions", quantity: 2 },
      ],
    },
    {
      station: "Bakau Station",
      receiptNumber: `POS-${latestDate.replaceAll("-", "")}-0003`,
      saleDate: toIsoDateTime(latestDate, 17, 26),
      paymentMethod: "transfer",
      cashierName: "POS Counter 3",
      lines: [
        { productName: "Rice", quantity: 1 },
        { productName: "Sugar", quantity: 1 },
        { productName: "Cooking Oil", quantity: 2 },
      ],
    },
  ];

  return templates.map((template) => {
    const stationId = stationIds.get(template.station);

    if (!stationId) {
      throw new Error(`POS station mapping failed for ${template.station}`);
    }

    const documentId = buildDocumentId("rcp", template.receiptNumber);
    const items = template.lines.map((line, index) => {
      const product = productMap.get(line.productName);

      if (!product) {
        throw new Error(`POS product mapping failed for ${line.productName}`);
      }

      const unitPrice = Number(product.data.selling_price || 0);
      const lineTotal = Number((unitPrice * line.quantity).toFixed(2));

      return {
        documentId: buildDocumentId("rit", `${template.receiptNumber}-${index + 1}`),
        data: {
          receipt_id: documentId,
          receipt_number: template.receiptNumber,
          sale_date: template.saleDate,
          station_id: stationId,
          station_name: template.station,
          product_id: product.documentId,
          product_name: line.productName,
          category: product.data.category,
          line_number: index + 1,
          quantity: Number(line.quantity),
          unit: product.data.unit,
          unit_price: unitPrice,
          line_total: lineTotal,
        },
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.data.line_total, 0);

    return {
      documentId,
      data: {
        receipt_number: template.receiptNumber,
        station_id: stationId,
        station_name: template.station,
        sale_date: template.saleDate,
        source: "pos",
        subtotal,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: subtotal,
        payment_method: template.paymentMethod,
        payment_method_code: template.paymentMethod,
        payment_method_label:
          template.paymentMethod.charAt(0).toUpperCase() +
          template.paymentMethod.slice(1),
        status: "completed",
        cashier_name: template.cashierName,
        customer_name: "Walk-in Customer",
        notes: "Seeded POS receipt with multiple line items.",
      },
      items,
    };
  });
}

function buildSalesSummaries(receipts) {
  const stationSummaryMap = new Map();
  const cashierSummaryMap = new Map();

  for (const receipt of receipts) {
    const date = `${receipt?.data?.sale_date || ""}`.slice(0, 10);
    const stationId = `${receipt?.data?.station_id || ""}`;
    const stationName = `${receipt?.data?.station_name || ""}`;
    const cashierName = `${receipt?.data?.cashier_name || ""}`;
    const items = Array.isArray(receipt?.items) ? receipt.items : [];
    const stationKey = `${date}|${stationId}`;
    const cashierKey = `${date}|${stationId}|${cashierName}`;

    if (!stationSummaryMap.has(stationKey)) {
      stationSummaryMap.set(stationKey, {
        documentId: buildDocumentId("sds", `${date}-${stationId}`),
        data: buildEmptySummaryDocument({
          date,
          stationId,
          stationName,
        }),
      });
    }

    if (!cashierSummaryMap.has(cashierKey)) {
      cashierSummaryMap.set(cashierKey, {
        documentId: buildDocumentId("cds", `${date}-${stationId}-${cashierName}`),
        data: buildEmptySummaryDocument({
          date,
          stationId,
          stationName,
          cashierName,
        }),
      });
    }

    stationSummaryMap.get(stationKey).data.transactions += 1;
    cashierSummaryMap.get(cashierKey).data.transactions += 1;

    for (const item of items) {
      const delta = buildSummaryDeltaFromItem(item?.data || {});
      applySummaryDelta(stationSummaryMap.get(stationKey).data, delta);
      applySummaryDelta(cashierSummaryMap.get(cashierKey).data, delta);
    }
  }

  return {
    stationDailySummaries: Array.from(stationSummaryMap.values()),
    cashierDailySummaries: Array.from(cashierSummaryMap.values()),
  };
}

function printSummary({
  stations,
  products,
  productPriceHistory,
  inventoryItems,
  incomingStockRecords,
  deliveries,
  roles,
  users,
  receipts,
  receiptItems,
  stationDailySummaries,
  cashierDailySummaries,
}) {
  console.log(`stations: ${stations.length}`);
  console.log(`products: ${products.length}`);
  console.log(`product_price_history: ${productPriceHistory.length}`);
  console.log(`inventory_items: ${inventoryItems.length}`);
  console.log(`incoming_stock_records: ${incomingStockRecords.length}`);
  console.log(`fuel_deliveries: ${deliveries.length}`);
  console.log(`app_roles: ${roles.length}`);
  console.log(`app_users: ${users.length}`);
  console.log(`sales_receipts: ${receipts.length}`);
  console.log(`sales_receipt_items: ${receiptItems.length}`);
  console.log(`station_daily_summary: ${stationDailySummaries.length}`);
  console.log(`cashier_daily_summary: ${cashierDailySummaries.length}`);
}

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function normalizeStationStatus(status) {
  return ["active", "inactive", "maintenance"].includes(status) ? status : "active";
}

function normalizeDeliveryStatus(status) {
  return ["pending", "in_transit", "delivered", "cancelled"].includes(status)
    ? status
    : "pending";
}

function normalizeCategory(typeOrName, fallbackName = "") {
  const rawValue = `${fallbackName || typeOrName}`.toLowerCase();
  const normalizedType = `${typeOrName}`.toLowerCase();

  if (normalizedType === "fuel" || rawValue === "petrol" || rawValue === "diesel") {
    return "fuel";
  }
  if (normalizedType === "cement" || rawValue === "cement") {
    return "cement";
  }
  return "shop";
}

function inferUnit(itemName, type = "") {
  const normalizedItem = itemName.toLowerCase();
  const normalizedType = type.toLowerCase();

  if (normalizedType === "fuel" || normalizedItem === "petrol" || normalizedItem === "diesel") {
    return "liters";
  }
  if (normalizedType === "cement" || normalizedItem === "cement") {
    return "bags";
  }
  if (normalizedItem === "cooking oil") {
    return "cartons";
  }
  if (normalizedItem === "building sand") {
    return "cubic meters";
  }
  return "bags";
}

function fallbackPrice(itemName) {
  const normalizedItem = itemName.toLowerCase();
  const fallbackPrices = {
    petrol: 420,
    diesel: 410,
    rice: 900,
    sugar: 920,
    "cooking oil": 2150,
    onions: 850,
    cement: 1800,
    "building sand": 870,
  };

  return fallbackPrices[normalizedItem] || 0;
}

function getInventoryStatus(quantity, reorderLevel) {
  const numericQuantity = Number(quantity);
  const numericReorderLevel = Number(reorderLevel);

  if (numericQuantity <= 0) {
    return "out";
  }
  if (numericQuantity <= numericReorderLevel) {
    return "low";
  }
  return "in_stock";
}

function toIsoDateTime(date, hour = 12, minute = 0) {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function toUpperCode(value) {
  return slugify(value).replaceAll("-", "_").toUpperCase().slice(0, 64);
}

function slugify(value) {
  return `${value}`
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildDocumentId(prefix, value) {
  const hash = crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 24);
  return `${prefix}_${hash}`.slice(0, 36);
}

function buildEmptySummaryDocument({
  date,
  stationId,
  stationName,
  cashierName = "",
}) {
  return {
    date,
    station_id: stationId,
    station_name: stationName,
    cashier_user_id: "",
    cashier_name: cashierName,
    fuel_sales: 0,
    petrol_sales: 0,
    diesel_sales: 0,
    shop_sales: 0,
    rice_sales: 0,
    cooking_oil_sales: 0,
    other_shop_sales: 0,
    cement_sales: 0,
    cement_bags_sold: 0,
    total_sales: 0,
    transactions: 0,
  };
}

function buildSummaryDeltaFromItem(item) {
  const productName = `${item.product_name || ""}`.trim().toLowerCase();
  const category = `${item.category || ""}`.trim().toLowerCase();
  const amount = Number(item.line_total || 0);
  const quantity = Number(item.quantity || 0);
  const delta = {
    fuel_sales: 0,
    petrol_sales: 0,
    diesel_sales: 0,
    shop_sales: 0,
    rice_sales: 0,
    cooking_oil_sales: 0,
    other_shop_sales: 0,
    cement_sales: 0,
    cement_bags_sold: 0,
    total_sales: amount,
  };

  if (category === "fuel") {
    delta.fuel_sales = amount;

    if (productName.includes("petrol")) {
      delta.petrol_sales = amount;
    } else if (productName.includes("diesel")) {
      delta.diesel_sales = amount;
    }

    return delta;
  }

  if (category === "cement") {
    delta.cement_sales = amount;
    delta.cement_bags_sold = quantity;
    return delta;
  }

  delta.shop_sales = amount;

  if (productName.includes("rice")) {
    delta.rice_sales = amount;
  } else if (productName.includes("cooking oil")) {
    delta.cooking_oil_sales = amount;
  } else {
    delta.other_shop_sales = amount;
  }

  return delta;
}

function applySummaryDelta(summary, delta) {
  Object.entries(delta).forEach(([key, value]) => {
    summary[key] = Number(summary[key] || 0) + Number(value || 0);
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}

function groupBy(records, getKey) {
  const groups = new Map();

  for (const record of records) {
    const key = getKey(record);
    const existing = groups.get(key) || [];
    existing.push(record);
    groups.set(key, existing);
  }

  return groups;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/seed-appwrite-records.mjs

Required environment variables:
  NEXT_PUBLIC_APPWRITE_ENDPOINT
  NEXT_PUBLIC_APPWRITE_PROJECT_ID
  APPWRITE_API_KEY
  APPWRITE_DATABASE_ID

Optional flags:
  --endpoint <url>
  --projectId <id>
  --apiKey <key>
  --databaseId <id>
  --dry-run
  --help
`);
}
