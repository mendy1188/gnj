const AUTH_COOKIE = "jah_oil_session";
const ONE_DAY = 60 * 60 * 24;
const DEMO_EMAIL = "admin@jahoil.com";
const DEMO_PASSWORD = "password";

const ROLE_NAMES = {
  ADMIN: "Admin",
  GENERAL_MANAGER: "General Manager",
  BRANCH_MANAGER: "Branch Manager",
  GENERAL_SALES: "General Sales",
  FUEL_SALES: "Fuel Sales",
};

const MODULE_DEFINITIONS = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "📊" },
  // { key: "coupons", label: "Coupons", href: "/coupons", icon: "🎟️" },
  {
    key: "bulk-fuel-purchases",
    label: "Bulk Fuel Purchases",
    href: "/bulk-fuel-purchases",
    icon: "🛢️",
  },
  { key: "stations", label: "Stations", href: "/stations", icon: "🏢" },
  { key: "inventory", label: "Inventory", href: "/inventory", icon: "📦" },
  {
    key: "product-settings",
    label: "Product Settings",
    href: "/product-settings",
    icon: "🏷️",
  },
  {
    key: "station-settings",
    label: "Station Settings",
    href: "/station-settings",
    icon: "🛠️",
  },
  {
    key: "payment-methods",
    label: "Payment Methods",
    href: "/payment-methods",
    icon: "💳",
  },
  {
    key: "rewards-management",
    label: "Rewards Management",
    href: "/rewards-management",
    icon: "🎁",
  },
  // {
  //   key: "coupon-purchases",
  //   label: "Purchase Coupons",
  //   href: "/coupon-purchases",
  //   icon: "🧾",
  // },
  // {
  //   key: "bulk-fuel-purchase-settings",
  //   label: "Bulk Fuel Purchase Settings",
  //   href: "/bulk-fuel-purchase-settings",
  //   icon: "⛽",
  // },
  {
    key: "balance-management",
    label: "Credit Settlements",
    href: "/balance-management",
    icon: "🏦",
  },
  {
    key: "reverse-transactions",
    label: "Reversed Transactions",
    href: "/reverse-transactions",
    icon: "↩️",
  },
  {
    key: "incoming-stock",
    label: "Incoming Stock",
    href: "/incoming-stock",
    icon: "📥",
  },
  { key: "cement", label: "Cement", href: "/cement", icon: "🧱" },
  {
    key: "fuel-deliveries",
    label: "Fuel Deliveries",
    href: "/fuel-deliveries",
    icon: "🚚",
  },
  { key: "fuel-sales", label: "Fuel Sales", href: "/fuel-sales", icon: "⛽" },
  {
    key: "commodities-sales",
    label: "Commodity Sales",
    href: "/commodities-sales",
    icon: "🥖",
  },
  { key: "pos", label: "POS", href: "/pos", icon: "🛒" },
  { key: "reports", label: "Reports", href: "/reports", icon: "📈" },
  { key: "admin", label: "Users / Roles", href: "/admin", icon: "🛡️" },
  {
    key: "pos-envelopes",
    label: "POS Repairs",
    href: "/admin/pos-repairs",
    icon: "document",
  },
];

const NAVIGATION_DEFINITIONS = [
  { type: "module", key: "dashboard" },
  { type: "module", key: "stations" },
  { type: "module", key: "inventory" },
  { type: "module", key: "cement" },
  { type: "module", key: "fuel-deliveries" },
  { type: "module", key: "fuel-sales" },
  { type: "module", key: "commodities-sales" },
  { type: "module", key: "coupons" },
  { type: "module", key: "bulk-fuel-purchases" },
  { type: "module", key: "pos" },
  { type: "module", key: "reports" },
  {
    type: "group",
    key: "settings",
    label: "Admin",
    icon: "⚙️",
    children: [
      "product-settings",
      "station-settings",
      "incoming-stock",
      "payment-methods",
      "rewards-management",
      "coupon-purchases",
      "bulk-fuel-purchase-settings",
      "balance-management",
      "reverse-transactions",
      "pos-envelopes",
      "admin",
    ],
  },
];

const MODULE_ROUTE_MAP = Object.fromEntries(
  MODULE_DEFINITIONS.map((module) => [module.key, module.href]),
);

const DEFAULT_ROLE_DEFINITIONS = [
  {
    code: "admin",
    name: ROLE_NAMES.ADMIN,
    branchRequired: false,
    modules: MODULE_DEFINITIONS.map((module) => module.key),
  },
  {
    code: "general_manager",
    name: ROLE_NAMES.GENERAL_MANAGER,
    branchRequired: false,
    modules: MODULE_DEFINITIONS.filter(
      (module) =>
        ![
          "admin",
          "pos-envelopes",
          "payment-methods",
          "balance-management",
        ].includes(module.key),
    ).map((module) => module.key),
  },
  {
    code: "branch_manager",
    name: ROLE_NAMES.BRANCH_MANAGER,
    branchRequired: true,
    modules: [
      "dashboard",
      "coupons",
      "stations",
      "inventory",
      "incoming-stock",
      "cement",
      "commodities-sales",
      "reverse-transactions",
      "reports",
    ],
  },
  {
    code: "general_sales",
    name: ROLE_NAMES.GENERAL_SALES,
    branchRequired: true,
    modules: ["dashboard", "commodities-sales", "cement", "pos", "reports"],
  },
  {
    code: "fuel_sales",
    name: ROLE_NAMES.FUEL_SALES,
    branchRequired: true,
    modules: ["dashboard", "fuel-sales", "pos", "reports"],
  },
];

const DEFAULT_ROLE_MODULES_BY_CODE = Object.fromEntries(
  DEFAULT_ROLE_DEFINITIONS.map((role) => [role.code, role.modules]),
);

const DEMO_SESSION = {
  userId: "demo-admin",
  fullName: "System Admin",
  email: DEMO_EMAIL,
  roleId: "demo-admin-role",
  roleName: ROLE_NAMES.ADMIN,
  modules: MODULE_DEFINITIONS.map((module) => module.key),
  branchId: "",
  branchName: "",
  mustChangePassword: false,
  status: "active",
};

function getProtectedRouteKeys() {
  return MODULE_DEFINITIONS.map((module) => module.key);
}

function getModuleForPath(pathname) {
  return (
    MODULE_DEFINITIONS.find(
      (module) => pathname === module.href || pathname.startsWith(`${module.href}/`),
    )?.key || null
  );
}

function requiresBranchAssignment(roleName) {
  return ![ROLE_NAMES.ADMIN, ROLE_NAMES.GENERAL_MANAGER].includes(roleName);
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function getSessionSecret() {
  const configuredSecret = `${process.env.AUTH_SECRET || ""}`.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (isProductionRuntime()) {
    throw new Error("AUTH_SECRET is required in production.");
  }

  return (
    process.env.APPWRITE_API_KEY ||
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ||
    "jah-oil-dev-secret"
  );
}

async function createSessionToken(session) {
  const payload = base64UrlEncode(
    JSON.stringify({
      ...session,
      modules: Array.isArray(session.modules) ? session.modules : [],
    }),
  );
  const signature = await signValue(payload);

  return `${payload}.${signature}`;
}

async function parseSessionToken(token) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = await signValue(payload);

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }
}

function getUserInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function buildNavigationItems(allowedModuleKeys = []) {
  const allowedModules = new Set(allowedModuleKeys);
  const moduleMap = new Map(MODULE_DEFINITIONS.map((module) => [module.key, module]));

  return NAVIGATION_DEFINITIONS.flatMap((entry) => {
    if (entry.type === "group") {
      const children = entry.children
        .map((key) => moduleMap.get(key))
        .filter(
          (module) =>
            module &&
            (allowedModules.has(module.key) ||
              (module.key === "pos-envelopes" && allowedModules.has("admin"))),
        )
        .map(toNavigationItem);

      return children.length > 0
        ? [
            {
              key: entry.key,
              label: entry.label,
              icon: entry.icon,
              children,
            },
          ]
        : [];
    }

    const module = moduleMap.get(entry.key);

    return module && allowedModules.has(module.key) ? [toNavigationItem(module)] : [];
  });
}

function toNavigationItem(module) {
  return {
    key: module.key,
    href: module.href,
    label: module.label,
    icon: module.icon,
  };
}

async function signValue(value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64Url(bytes);
}

function base64UrlDecode(value) {
  const bytes = base64UrlToBytes(value);
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export {
  AUTH_COOKIE,
  DEFAULT_ROLE_MODULES_BY_CODE,
  DEFAULT_ROLE_DEFINITIONS,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_SESSION,
  MODULE_DEFINITIONS,
  MODULE_ROUTE_MAP,
  ONE_DAY,
  ROLE_NAMES,
  createSessionToken,
  getModuleForPath,
  getProtectedRouteKeys,
  getUserInitials,
  buildNavigationItems,
  parseSessionToken,
  requiresBranchAssignment,
};
