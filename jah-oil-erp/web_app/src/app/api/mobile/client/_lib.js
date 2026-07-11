import { findUserByCashierQrCode, listUsers } from "@/features/auth/data";
import { isFuelSales, isGeneralSales } from "@/features/auth/scopes";

export const CLIENT_PAYMENT_CONTRACT_VERSION = "2026-06-21";

const DEMO_CASHIER_QR_MAP = {
  "JAH-BANJUL-AMIE": {
    id: "cashier-amie",
    qrCode: "JAH-BANJUL-AMIE",
    name: "Amie",
    stationId: "",
    stationName: "Banjul Station",
    roleName: "Fuel Sales",
    source: "demo",
  },
  "JAH-BRIKAMA-MAMA": {
    id: "cashier-mama",
    qrCode: "JAH-BRIKAMA-MAMA",
    name: "Mama",
    stationId: "",
    stationName: "Brikama Station",
    roleName: "General Sales",
    source: "demo",
  },
  "JAH-BANJUL-MENDY": {
    id: "cashier-mendy",
    qrCode: "JAH-BANJUL-MENDY",
    name: "Mendy",
    stationId: "",
    stationName: "Banjul Station",
    roleName: "General Sales",
    source: "demo",
  },
};

function normalizeComparable(value) {
  return `${value || ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeCashierQrCode(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "object") {
    return normalizeCashierQrCode(
      value.qrCode || value.cashierQrCode || value.cashierCode || value.code,
    );
  }

  const rawValue = `${value}`.trim();

  if (!rawValue) {
    return "";
  }

  if (rawValue.startsWith("{")) {
    try {
      const parsed = JSON.parse(rawValue);
      return normalizeCashierQrCode(parsed);
    } catch {}
  }

  try {
    const parsedUrl = new URL(rawValue);
    return normalizeCashierQrCode(
      parsedUrl.searchParams.get("qrCode") ||
        parsedUrl.searchParams.get("cashierQrCode") ||
        parsedUrl.searchParams.get("cashierCode") ||
        parsedUrl.searchParams.get("code"),
    );
  } catch {}

  return rawValue;
}

function parseCashierQrCode(qrCode) {
  const normalizedQrCode = normalizeCashierQrCode(qrCode);

  if (!normalizedQrCode) {
    return null;
  }

  const upperCaseQrCode = normalizedQrCode.toUpperCase();
  const segments = upperCaseQrCode.split("-").filter(Boolean);

  if (segments.length < 3 || segments[0] !== "JAH") {
    return {
      rawCode: normalizedQrCode,
      stationHint: "",
      cashierHint: "",
    };
  }

  return {
    rawCode: normalizedQrCode,
    stationHint: segments.slice(1, -1).join("-"),
    cashierHint: segments.at(-1) || "",
  };
}

function buildCashierCapabilities(roleName) {
  const fuelCashier = isFuelSales(roleName);

  return {
    buyFuel: fuelCashier,
    redeemBulkFuel: fuelCashier,
  };
}

function buildVerifiedCashierPayload(cashier) {
  return {
    id: cashier.id || "",
    qrCode: cashier.qrCode || "",
    name: cashier.name || "",
    stationId: cashier.stationId || "",
    stationName: cashier.stationName || "",
    roleName: cashier.roleName || "",
    capabilities: buildCashierCapabilities(cashier.roleName),
    source: cashier.source || "app_users",
  };
}

function findDemoCashier(qrCode) {
  const normalizedQrCode = normalizeCashierQrCode(qrCode);
  const matchedCashier = DEMO_CASHIER_QR_MAP[normalizedQrCode.toUpperCase()];

  return matchedCashier ? buildVerifiedCashierPayload(matchedCashier) : null;
}

function matchesCashierQrHints(user, parsedQrCode) {
  if (!parsedQrCode) {
    return false;
  }

  const normalizedUserName = normalizeComparable(user.fullName);
  const normalizedBranchName = normalizeComparable(user.branchName);
  const normalizedCashierHint = normalizeComparable(parsedQrCode.cashierHint);
  const normalizedStationHint = normalizeComparable(parsedQrCode.stationHint);

  const matchesName = normalizedCashierHint
    ? normalizedUserName.includes(normalizedCashierHint)
    : false;
  const matchesStation = normalizedStationHint
    ? normalizedBranchName.includes(normalizedStationHint)
    : true;

  return matchesName && matchesStation;
}

export async function resolveVerifiedCashier(qrCode) {
  const normalizedQrCode = normalizeCashierQrCode(qrCode);

  if (!normalizedQrCode) {
    return null;
  }

  const demoCashier = findDemoCashier(normalizedQrCode);

  if (demoCashier) {
    return demoCashier;
  }

  const exactUser = await findUserByCashierQrCode(normalizedQrCode);

  if (exactUser && exactUser.status === "active") {
    return buildVerifiedCashierPayload({
      id: exactUser.id,
      qrCode: exactUser.cashierQrCode || normalizedQrCode,
      name: exactUser.fullName,
      stationId: exactUser.branchId,
      stationName: exactUser.branchName,
      roleName: exactUser.roleName,
      source: "app_users",
    });
  }

  const parsedQrCode = parseCashierQrCode(normalizedQrCode);
  const users = await listUsers();
  const matchedUser = users.find(
    (user) =>
      user.status === "active" &&
      (isGeneralSales(user.roleName) || isFuelSales(user.roleName)) &&
      matchesCashierQrHints(user, parsedQrCode),
  );

  if (!matchedUser) {
    return null;
  }

  return buildVerifiedCashierPayload({
    id: matchedUser.id,
    qrCode: normalizedQrCode,
    name: matchedUser.fullName,
    stationId: matchedUser.branchId,
    stationName: matchedUser.branchName,
    roleName: matchedUser.roleName,
    source: "app_users",
  });
}
