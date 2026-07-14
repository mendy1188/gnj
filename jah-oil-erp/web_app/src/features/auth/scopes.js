import { ROLE_NAMES } from "@/features/auth/session";

const FUEL_ITEMS = new Set(["Petrol", "Diesel"]);

function normalizeRoleName(roleName) {
  return `${roleName || ""}`.trim().toLowerCase();
}

export function isPrivilegedRole(roleName) {
  const normalizedRoleName = normalizeRoleName(roleName);

  return [ROLE_NAMES.ADMIN, ROLE_NAMES.GENERAL_MANAGER, ROLE_NAMES.FINANCE].some(
    (name) => normalizeRoleName(name) === normalizedRoleName,
  );
}

export function isBranchManager(roleName) {
  return normalizeRoleName(roleName) === normalizeRoleName(ROLE_NAMES.BRANCH_MANAGER);
}

export function isGeneralSales(roleName) {
  return normalizeRoleName(roleName) === normalizeRoleName(ROLE_NAMES.GENERAL_SALES);
}

export function isFuelSales(roleName) {
  return normalizeRoleName(roleName) === normalizeRoleName(ROLE_NAMES.FUEL_SALES);
}

export function filterSalesRecordsForSession(records, session, options = {}) {
  const allowedTypes = new Set(options.allowedTypes || []);
  let filteredRecords = Array.isArray(records) ? records : [];

  if (!isPrivilegedRole(session?.roleName)) {
    if (session?.branchName) {
      filteredRecords = filteredRecords.filter(
        (record) => record.station === session.branchName,
      );
    }

    if (isGeneralSales(session?.roleName) || isFuelSales(session?.roleName)) {
      filteredRecords = filteredRecords.filter(
        (record) => record.cashierName === session.fullName,
      );
    }
  }

  if (allowedTypes.size > 0) {
    filteredRecords = filteredRecords.filter((record) =>
      allowedTypes.has(record.type),
    );
  }

  return filteredRecords;
}

export function filterInventoryRecordsForSession(records, session) {
  if (isPrivilegedRole(session?.roleName)) {
    return records;
  }

  if (!session?.branchName) {
    return [];
  }

  return records.filter((record) => record.station === session.branchName);
}

export function filterIncomingStockRecordsForSession(records, session) {
  if (isPrivilegedRole(session?.roleName)) {
    return records;
  }

  if (!session?.branchName) {
    return [];
  }

  return records.filter((record) => record.station === session.branchName);
}

export function filterFuelDeliveriesForSession(records, session) {
  if (isPrivilegedRole(session?.roleName)) {
    return records;
  }

  if (!session?.branchName) {
    return [];
  }

  return records.filter((record) => record.station === session.branchName);
}

export function filterStationsForSession(records, session) {
  if (isPrivilegedRole(session?.roleName)) {
    return records;
  }

  if (!session?.branchName) {
    return [];
  }

  return records.filter((record) => record.name === session.branchName);
}

export function filterProductsForSession(records, session) {
  const sourceRecords = Array.isArray(records) ? records : [];

  if (isGeneralSales(session?.roleName)) {
    return sourceRecords.filter((record) =>
      ["shop", "cement"].includes(`${record.category || ""}`),
    );
  }

  if (isFuelSales(session?.roleName)) {
    return sourceRecords.filter(
      (record) =>
        `${record.category || ""}` === "fuel" && FUEL_ITEMS.has(record.name),
    );
  }

  return sourceRecords;
}

export function filterStationsForPosSession(records, session) {
  if (isPrivilegedRole(session?.roleName)) {
    return records;
  }

  if (!session?.branchId) {
    return [];
  }

  return records.filter((record) => record.id === session.branchId);
}

export function canEditCashierName(session) {
  return isPrivilegedRole(session?.roleName);
}

export function getDashboardVariant(session) {
  if (isGeneralSales(session?.roleName)) {
    return "general-sales";
  }

  if (isFuelSales(session?.roleName)) {
    return "fuel-sales";
  }

  if (isBranchManager(session?.roleName)) {
    return "branch-manager";
  }

  return "operations";
}
