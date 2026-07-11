export const DEFAULT_PAYMENT_METHODS = [
  {
    code: "cash",
    label: "Cash",
    description: "Accept payment directly at the counter.",
    isEnabled: true,
    sortOrder: 1,
  },
  {
    code: "card",
    label: "Card",
    description: "Accept debit or credit card payments.",
    isEnabled: true,
    sortOrder: 2,
  },
  {
    code: "transfer",
    label: "Transfer",
    description: "Accept bank or wallet transfer confirmation.",
    isEnabled: true,
    sortOrder: 3,
  },
  {
    code: "credit",
    label: "Credit Sale",
    description: "Record approved customer credit sales for later settlement.",
    isEnabled: true,
    sortOrder: 4,
  },
  {
    code: "coupon",
    label: "Coupon",
    description: "Redeem approved customer coupon balances.",
    isEnabled: true,
    sortOrder: 5,
  },
  {
    code: "bulk-redeem",
    label: "Bulk Redeem",
    description: "Redeem previously funded product-specific bulk balances.",
    isEnabled: true,
    sortOrder: 6,
  },
  {
    code: "fuel-gift",
    label: "Fuel Gift",
    description: "Redeem a client-generated fuel gift code at the station.",
    isEnabled: true,
    sortOrder: 7,
  },
  {
    code: "mixed",
    label: "Mixed",
    description: "Allow split payments across more than one method.",
    isEnabled: true,
    sortOrder: 8,
  },
];

export const PAYMENT_METHOD_CODE_SET = new Set(
  DEFAULT_PAYMENT_METHODS.map((method) => method.code),
);

export function normalizePaymentMethodCode(value) {
  return `${value || ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
}

export function getDefaultPaymentMethodByCode(code) {
  const normalizedCode = normalizePaymentMethodCode(code);

  return (
    DEFAULT_PAYMENT_METHODS.find((method) => method.code === normalizedCode) ||
    null
  );
}

export function getDefaultPaymentMethods() {
  return DEFAULT_PAYMENT_METHODS.map((method) => ({ ...method }));
}

export function isLegacyPaymentMethodCode(code) {
  return PAYMENT_METHOD_CODE_SET.has(normalizePaymentMethodCode(code));
}

export function buildPaymentMethodCodeFromLabel(label) {
  const normalizedCode = normalizePaymentMethodCode(label);

  return normalizedCode || "payment-method";
}
