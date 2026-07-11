import {
  getDashboardVariant,
  isBranchManager,
  isFuelSales,
  isGeneralSales,
  isPrivilegedRole,
} from "@/features/auth/scopes";

const DATE_RANGE_FILTERS = [
  { key: "fromDate", type: "date", label: "from" },
  { key: "toDate", type: "date", label: "to" },
];

const STATION_FILTER = {
  key: "station",
  type: "select",
  label: "station",
  optionsKey: "stationOptions",
};

const CATEGORY_FILTER = {
  key: "category",
  type: "select",
  label: "category",
  optionsKey: "categoryOptions",
};

const ITEM_FILTER = {
  key: "item",
  type: "select",
  label: "item",
  optionsKey: "itemOptions",
};

const CASHIER_FILTER = {
  key: "cashier",
  type: "select",
  label: "cashier",
  optionsKey: "cashierOptions",
};

const STATUS_FILTER = {
  key: "status",
  type: "select",
  label: "status",
  optionsKey: "statusOptions",
};

const PRODUCT_FILTER = {
  key: "product",
  type: "select",
  label: "product",
  optionsKey: "productOptions",
};

const RECORDED_BY_FILTER = {
  key: "recordedBy",
  type: "select",
  label: "recorded by",
  optionsKey: "recordedByOptions",
};

const PAYMENT_METHOD_FILTER = {
  key: "paymentMethod",
  type: "select",
  label: "payment method",
  optionsKey: "paymentMethodOptions",
};

const COMPANY_FILTER = {
  key: "company",
  type: "select",
  label: "company",
  optionsKey: "companyOptions",
};

const CLIENT_FILTER = {
  key: "client",
  type: "select",
  label: "client",
  optionsKey: "clientOptions",
};

const DIRECTION_FILTER = {
  key: "direction",
  type: "select",
  label: "direction",
  optionsKey: "directionOptions",
};

const ACTOR_FILTER = {
  key: "actor",
  type: "select",
  label: "actor",
  optionsKey: "actorOptions",
};

const REPORT_DEFINITIONS = [
  {
    key: "sales-summary",
    title: "Sales Summary",
    description:
      "Grouped daily sales totals for the records inside your reporting scope.",
    cadence: "Daily",
    format: "CSV",
    tone: "from-slate-50 to-white",
    recommendedUse:
      "Use this for day-end review, management updates, and operational follow-up.",
    includes: "Date, station, category, line count, quantity, amount",
    filters: [...DATE_RANGE_FILTERS, STATION_FILTER, CATEGORY_FILTER],
  },
  {
    key: "commodity-sales",
    title: "Commodity Sales Transactions",
    description:
      "Detailed commodity sales lines with cashier and customer context where available.",
    cadence: "Daily",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "commodities-sales",
    recommendedUse:
      "Use this to review commodity transactions, quantities sold, and sales value.",
    includes: "Date, station, item, cashier, customer, quantity, amount",
    filters: [...DATE_RANGE_FILTERS, STATION_FILTER, ITEM_FILTER, CASHIER_FILTER],
  },
  {
    key: "cement-sales",
    title: "Cement Sales Transactions",
    description:
      "Detailed cement sales lines scoped to the stations or cashier records you can access.",
    cadence: "Daily",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "cement",
    recommendedUse:
      "Use this to review cement bag movements and sales performance.",
    includes: "Date, station, item, cashier, customer, quantity, amount",
    filters: [...DATE_RANGE_FILTERS, STATION_FILTER, ITEM_FILTER, CASHIER_FILTER],
  },
  {
    key: "fuel-sales",
    title: "Fuel Sales Transactions",
    description:
      "Detailed Petrol and Diesel sales lines scoped to your reporting access.",
    cadence: "Daily",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "fuel-sales",
    recommendedUse:
      "Use this to track fuel product performance, cashier activity, and quantities sold.",
    includes: "Date, station, item, cashier, customer, quantity, amount",
    filters: [...DATE_RANGE_FILTERS, STATION_FILTER, ITEM_FILTER, CASHIER_FILTER],
  },
  {
    key: "station-performance",
    title: "Station Performance",
    description:
      "Aggregated station totals with sales mix by fuel, commodity, and cement categories.",
    cadence: "Weekly",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "stations",
    recommendedUse:
      "Use this to compare station contribution and category mix at a glance.",
    includes: "Station, total sales, fuel sales, commodity sales, cement sales",
    filters: [...DATE_RANGE_FILTERS, STATION_FILTER, CATEGORY_FILTER],
  },
  {
    key: "inventory-snapshot",
    title: "Inventory Snapshot",
    description:
      "Current stock levels, reorder levels, and inventory status by branch and product.",
    cadence: "Daily",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "inventory",
    recommendedUse:
      "Use this to track stock-on-hand, identify shortages, and plan replenishment.",
    includes: "Station, product, quantity, unit, reorder level, status",
    filters: [STATION_FILTER, CATEGORY_FILTER, PRODUCT_FILTER, STATUS_FILTER],
  },
  {
    key: "incoming-stock-history",
    title: "Incoming Stock History",
    description:
      "Recorded incoming stock quantities with before-and-after inventory levels.",
    cadence: "Weekly",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "incoming-stock",
    recommendedUse:
      "Use this to audit stock receipts and confirm inventory updates by branch.",
    includes:
      "Recorded at, station, product, quantity added, previous quantity, new quantity, recorded by",
    filters: [
      ...DATE_RANGE_FILTERS,
      STATION_FILTER,
      CATEGORY_FILTER,
      PRODUCT_FILTER,
      RECORDED_BY_FILTER,
    ],
  },
  {
    key: "fuel-delivery-log",
    title: "Fuel Delivery Log",
    description:
      "Delivered fuel quantities, statuses, and who recorded the delivery.",
    cadence: "Weekly",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "fuel-deliveries",
    recommendedUse:
      "Use this to reconcile deliveries and review dispatch-to-receipt accuracy.",
    includes: "Delivery date, station, fuel type, quantity, status, recorded by",
    filters: [
      ...DATE_RANGE_FILTERS,
      STATION_FILTER,
      PRODUCT_FILTER,
      STATUS_FILTER,
      RECORDED_BY_FILTER,
    ],
  },
  {
    key: "stock-reconciliation",
    title: "Stock Reconciliation",
    description:
      "Compare quantities received into stock against quantities sold by station and product.",
    cadence: "Weekly",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "inventory",
    recommendedUse:
      "Use this to reconcile incoming stock against sold quantities for any weekly, monthly, or custom period.",
    includes:
      "Station, product, category, quantity received, quantity sold, net quantity movement, sales value",
    filters: [...DATE_RANGE_FILTERS, STATION_FILTER, CATEGORY_FILTER, PRODUCT_FILTER],
  },
  {
    key: "best-performing-stations",
    title: "Best Performing Stations",
    description:
      "Rank stations by sales value for a selected product or across all products in the chosen period.",
    cadence: "Weekly",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "stations",
    recommendedUse:
      "Use this to compare station leaders for a product line or for all products, with a visual ranking chart.",
    includes:
      "Station, quantity sold, sales value, transaction count, average sale value",
    filters: [...DATE_RANGE_FILTERS, CATEGORY_FILTER, PRODUCT_FILTER],
  },
  {
    key: "coupon-activity",
    title: "Coupon Activity",
    description:
      "Coupon redemption movement history including company, station, and balance movement.",
    cadence: "Weekly",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "coupons",
    recommendedUse:
      "Use this to audit coupon usage and track remaining value movement.",
    includes:
      "Movement date, company, purchase reference, coupon code, station, direction, amount delta, balance after",
    filters: [
      ...DATE_RANGE_FILTERS,
      COMPANY_FILTER,
      STATION_FILTER,
      DIRECTION_FILTER,
    ],
  },
  {
    key: "bulk-fuel-purchases",
    title: "Bulk Fuel Purchase Balances",
    description:
      "Bulk fuel purchase balances, redeemed totals, and client contact details.",
    cadence: "Weekly",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "bulk-fuel-purchases",
    recommendedUse:
      "Use this to monitor client prepaid fuel balances and redemption progress.",
    includes:
      "Client, phone, address, product, reference, purchase amount, redeemed amount, available balance, status",
    filters: [...DATE_RANGE_FILTERS, CLIENT_FILTER, PRODUCT_FILTER, STATUS_FILTER],
  },
  {
    key: "credit-settlement-history",
    title: "Credit Settlement History",
    description:
      "Recorded credit-account paydowns and related balance changes over time.",
    cadence: "Weekly",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "balance-management",
    recommendedUse:
      "Use this to review customer settlements and remaining outstanding balances.",
    includes:
      "Movement date, customer, station, product, receipt, settled amount, remaining balance, actor",
    filters: [...DATE_RANGE_FILTERS, STATION_FILTER, CATEGORY_FILTER, CLIENT_FILTER, ACTOR_FILTER],
  },
  {
    key: "outstanding-credit-accounts",
    title: "Outstanding Credit Accounts",
    description:
      "Outstanding customer credit balances with contact details and due-status context for follow-up.",
    cadence: "Weekly",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "balance-management",
    recommendedUse:
      "Use this to follow up customers with unpaid credit balances, especially overdue accounts.",
    includes:
      "Customer, contact number, station, product, outstanding balance, next payment date, days overdue, status",
    filters: [
      ...DATE_RANGE_FILTERS,
      STATION_FILTER,
      CATEGORY_FILTER,
      PRODUCT_FILTER,
      STATUS_FILTER,
      CLIENT_FILTER,
    ],
  },
  {
    key: "reversed-pos-transactions",
    title: "Reversed POS Transactions",
    description:
      "Reversed POS receipts including original cashier, reversal actor, and payment method.",
    cadence: "Daily",
    format: "CSV",
    tone: "from-slate-50 to-white",
    requiredModuleKey: "reverse-transactions",
    recommendedUse:
      "Use this to audit voided POS transactions and investigate operational exceptions.",
    includes:
      "Reversed at, station, receipt, items, cashier, customer, payment method, amount, reversed by",
    filters: [
      ...DATE_RANGE_FILTERS,
      STATION_FILTER,
      CASHIER_FILTER,
      PAYMENT_METHOD_FILTER,
      ACTOR_FILTER,
    ],
  },
];

export function getVisibleReports(session) {
  const allowedModules = new Set(
    Array.isArray(session?.modules) ? session.modules : [],
  );

  return REPORT_DEFINITIONS.filter(
    (report) =>
      !report.requiredModuleKey || allowedModules.has(report.requiredModuleKey),
  );
}

export function getReportDefinition(reportKey) {
  return (
    REPORT_DEFINITIONS.find(
      (report) => report.key === `${reportKey || ""}`.trim(),
    ) || null
  );
}

export function getReportsPageMeta(session) {
  const dashboardVariant = getDashboardVariant(session);

  return {
    dashboardVariant,
    title: isGeneralSales(session?.roleName)
      ? "My Reports"
      : isFuelSales(session?.roleName)
        ? "My Fuel Reports"
        : isBranchManager(session?.roleName)
          ? "Branch Reports"
          : "Reports",
    description: isGeneralSales(session?.roleName)
      ? "Prepare your personal commodity and cement sales exports."
      : isFuelSales(session?.roleName)
        ? "Prepare your personal Petrol and Diesel sales exports."
        : isBranchManager(session?.roleName)
          ? "Prepare branch-level operational summaries and exports."
          : "Prepare operational summaries and management-ready exports.",
  };
}

export function getReportHeroHeading(session) {
  const dashboardVariant = getDashboardVariant(session);

  if (dashboardVariant === "general-sales") {
    return "Generate personal commodity and cement sales exports.";
  }

  if (dashboardVariant === "fuel-sales") {
    return "Generate personal Petrol and Diesel sales exports.";
  }

  if (dashboardVariant === "branch-manager") {
    return "Generate branch-level sales, stock, and station reports.";
  }

  return "Generate operational exports for sales, stock, delivery, and balance control.";
}

export function getReportScopeLabel(session) {
  if (isPrivilegedRole(session?.roleName)) {
    return "All stations";
  }

  if (isBranchManager(session?.roleName)) {
    return session?.branchName
      ? `${session.branchName} branch`
      : "Assigned branch";
  }

  return session?.fullName ? `${session.fullName} only` : "My records";
}

export { REPORT_DEFINITIONS };
