const ICON_MAP = [
  { match: "petrol", icon: "petrol" },
  { match: "diesel", icon: "diesel" },
  { match: "rice (50kg)", icon: "rice-50" },
  { match: "rice (25kg)", icon: "rice-25" },
  { match: "sugar", icon: "🍚" },
  { match: "cooking oil", icon: "oil" },
  { match: "cement", icon: "cement" },
  { match: "onion", icon: "onion" },
];

export function getProductIcon(productName) {
  const normalized = `${productName || ""}`.trim().toLowerCase();
  const match = ICON_MAP.find((entry) => normalized.includes(entry.match));

  return match?.icon || "📦";
}

export function getProductOrder(productName) {
  const normalized = `${productName || ""}`.trim().toLowerCase();

  if (normalized === "petrol") {
    return 0;
  }

  if (normalized === "diesel") {
    return 1;
  }

  if (normalized === "rice (50kg)") {
    return 2;
  }

  if (normalized === "rice (25kg)") {
    return 3;
  }

  if (normalized.includes("cooking oil")) {
    return 4;
  }

  if (normalized === "onion") {
    return 5;
  }

  if (normalized.includes("cement")) {
    return 6;
  }

  return 99;
}
