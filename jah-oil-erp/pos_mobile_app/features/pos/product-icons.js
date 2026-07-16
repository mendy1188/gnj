const ICON_MAP = [
  { match: "petrol", icon: "⛽" },
  { match: "diesel", icon: "🛢️" },
  { match: "rice (50kg)", icon: "🍚" },
  { match: "rice (25kg)", icon: "🍚" },
  { match: "sugar", icon: "🍚" },
  { match: "cooking oil", icon: "🫗" },
  { match: "cement", icon: "🧱" },
  { match: "onion", icon: "🧅" },
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
