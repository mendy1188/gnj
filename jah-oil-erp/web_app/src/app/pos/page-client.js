"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { OnionIcon, SugarBagIcon } from "@/components/pos/ProductIcons";
import { AppIcon } from "@/components/ui/AppIcon";
import ToastMessage from "@/components/ui/ToastMessage";
import {
  isFuelSales,
  isGeneralSales,
  isPrivilegedRole,
} from "@/features/auth/scopes";
import DashboardPageShell from "@/features/dashboard/page-shell";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { PRIMARY_ACTION_BUTTON_CLASS } from "@/features/operations/ui";
import { getDefaultPaymentMethods } from "@/features/payments/constants";
import PosCashierTransactionsControl from "@/features/pos/PosCashierTransactionsControl";
import {
  queuePendingPosSale,
  registerPosOfflineSupport,
  syncPendingPosSales,
} from "@/features/pos/offline-sync";
import { usePosSyncStatus } from "@/features/pos/use-pos-sync-status";

const PosSyncNavControl = dynamic(
  () => import("@/features/pos/PosSyncNavControl"),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        aria-label="POS sync status"
        aria-hidden="true"
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-3xl border border-slate-200 bg-slate-100 text-slate-700 transition"
      >
        <AppIcon name="sync" className="h-5 w-5" />
      </button>
    ),
  },
);

function formatCurrency(value) {
  return `D${Number(value || 0).toLocaleString()}`;
}

function isFuelCategory(category) {
  return `${category || ""}`.trim().toLowerCase() === "fuel";
}

function isCouponPaymentMethod(code) {
  return `${code || ""}`.trim().toLowerCase() === "coupon";
}

function isCreditPaymentMethod(code) {
  return `${code || ""}`.trim().toLowerCase() === "credit";
}

function isBulkRedeemPaymentMethod(code) {
  return `${code || ""}`.trim().toLowerCase() === "bulk-redeem";
}

function isFuelGiftPaymentMethod(code) {
  return `${code || ""}`.trim().toLowerCase() === "fuel-gift";
}

function isCashierRole(roleName) {
  return isGeneralSales(roleName) || isFuelSales(roleName);
}

function getCheckoutEmptyStateIcon(roleName) {
  return isFuelSales(roleName) ? "diesel" : "cart";
}

function getFuelQuantityFromAmount(amount, unitPrice) {
  const normalizedAmount = parseCurrencyInput(amount);
  const normalizedUnitPrice = Number(unitPrice || 0);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return 0;
  }

  if (!Number.isFinite(normalizedUnitPrice) || normalizedUnitPrice <= 0) {
    return 0;
  }

  return normalizedAmount / normalizedUnitPrice;
}

function truncateToTwoDecimals(value) {
  const normalizedValue = Number(value || 0);

  if (!Number.isFinite(normalizedValue)) {
    return 0;
  }

  return Math.floor(normalizedValue * 100) / 100;
}

function formatFuelQuantity(value) {
  const normalizedValue = Number(value || 0);

  if (!Number.isFinite(normalizedValue)) {
    return "0.0";
  }

  return normalizedValue.toFixed(1);
}

function formatReceiptDateTime(value) {
  const parsedDate = new Date(value || "");

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

function formatReceiptQuantity(item) {
  if (isFuelCategory(item?.category)) {
    return `${formatFuelQuantity(item?.qty)} ${item?.unit || "liter"}`;
  }

  return `${Number(item?.qty || 0).toLocaleString()} ${item?.unit || "unit"}`;
}

function formatReceiptPaymentMethod(value) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return "—";
  }

  if (normalizedValue === normalizedValue.toLowerCase()) {
    return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
  }

  return normalizedValue;
}

function formatDateFieldLabel(value) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return "Select due date";
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsedDate);
}

function escapeReceiptHtml(value) {
  return `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function buildClientReceiptNumber({
  saleDate = "",
  clientSaleId = "",
} = {}) {
  const now = saleDate ? new Date(saleDate) : new Date();
  const normalizedDate = Number.isNaN(now.getTime()) ? new Date() : now;
  const datePart = [
    normalizedDate.getUTCFullYear(),
    String(normalizedDate.getUTCMonth() + 1).padStart(2, "0"),
    String(normalizedDate.getUTCDate()).padStart(2, "0"),
  ].join("");
  const timePart = [
    String(normalizedDate.getUTCHours()).padStart(2, "0"),
    String(normalizedDate.getUTCMinutes()).padStart(2, "0"),
    String(normalizedDate.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = await buildClientReceiptSuffix(clientSaleId);

  return `POS-${datePart}-${timePart}-${suffix}`;
}

async function buildClientReceiptSuffix(clientSaleId) {
  const normalizedId = `${clientSaleId || ""}`.trim();

  if (!normalizedId) {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(normalizedId),
    );

    return Array.from(new Uint8Array(digest))
      .slice(0, 3)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  return (
    normalizedId
      .replaceAll(/[^a-zA-Z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase() || "LOCAL1"
  );
}

function buildReceiptHtml({
  receiptNumber,
  saleDate,
  stationName,
  cashierName,
  customerName,
  customerPhone,
  vehicleRegistrationNumber,
  companyOrOrganizationName,
  billableTo,
  paymentMethod,
  items,
  subtotal,
  total,
  statusLabel,
}) {
  const itemRows = (Array.isArray(items) ? items : [])
    .map(
      (item) => `
        <tr>
          <td>${escapeReceiptHtml(item.name)}</td>
          <td style="text-align:center;">${escapeReceiptHtml(
            formatReceiptQuantity(item),
          )}</td>
          <td style="text-align:right;">${escapeReceiptHtml(
            formatCurrency(item.price),
          )}</td>
          <td style="text-align:right;">${escapeReceiptHtml(
            formatCurrency(
              isFuelCategory(item.category)
                ? Number(item.amount || 0)
                : Number(item.price || 0) * Number(item.qty || 0),
            ),
          )}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeReceiptHtml(receiptNumber)}</title>
        <style>
          body {
            font-family: Inter, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 24px;
            background: #ffffff;
          }
          .receipt {
            max-width: 360px;
            margin: 0 auto;
          }
          .brand {
            text-align: center;
            margin-bottom: 18px;
          }
          .brand h1 {
            font-size: 18px;
            margin: 0;
          }
          .brand p {
            margin: 4px 0 0;
            font-size: 12px;
            color: #475569;
          }
          .meta,
          .totals {
            width: 100%;
            border-collapse: collapse;
            margin-top: 14px;
          }
          .meta td,
          .totals td {
            padding: 4px 0;
            font-size: 12px;
            vertical-align: top;
          }
          .items {
            width: 100%;
            border-collapse: collapse;
            margin-top: 18px;
          }
          .items th,
          .items td {
            border-bottom: 1px solid #e2e8f0;
            padding: 8px 0;
            font-size: 12px;
          }
          .items th {
            color: #475569;
            font-weight: 600;
            text-align: left;
          }
          .totals td:last-child,
          .meta td:last-child {
            text-align: right;
          }
          .status {
            margin-top: 12px;
            padding: 10px 12px;
            border-radius: 10px;
            background: #f8fafc;
            font-size: 12px;
            color: #334155;
          }
          .footer {
            margin-top: 18px;
            text-align: center;
            font-size: 11px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="brand">
            <h1>Jah Multi Industries</h1>
            <p>Sales Receipt</p>
          </div>

          <table class="meta">
            <tr>
              <td>Receipt</td>
              <td>${escapeReceiptHtml(receiptNumber)}</td>
            </tr>
            <tr>
              <td>Date</td>
              <td>${escapeReceiptHtml(formatReceiptDateTime(saleDate))}</td>
            </tr>
            <tr>
              <td>Station</td>
              <td>${escapeReceiptHtml(stationName || "—")}</td>
            </tr>
            <tr>
              <td>Cashier</td>
              <td>${escapeReceiptHtml(cashierName || "POS Counter")}</td>
            </tr>
            <tr>
              <td>Customer</td>
              <td>${escapeReceiptHtml(customerName || "Walk-in Customer")}</td>
            </tr>
            <tr>
              <td>Phone</td>
              <td>${escapeReceiptHtml(customerPhone || "—")}</td>
            </tr>
            <tr>
              <td>Vehicle</td>
              <td>${escapeReceiptHtml(vehicleRegistrationNumber || "—")}</td>
            </tr>
            <tr>
              <td>Company / Org.</td>
              <td>${escapeReceiptHtml(companyOrOrganizationName || "—")}</td>
            </tr>
            <tr>
              <td>Billable To</td>
              <td>${escapeReceiptHtml(billableTo || "—")}</td>
            </tr>
            <tr>
              <td>Payment</td>
              <td>${escapeReceiptHtml(formatReceiptPaymentMethod(paymentMethod))}</td>
            </tr>
          </table>

          <table class="items">
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align:center;">Qty</th>
                <th style="text-align:right;">Price</th>
                <th style="text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          <table class="totals">
            <tr>
              <td>Subtotal</td>
              <td>${escapeReceiptHtml(formatCurrency(subtotal))}</td>
            </tr>
            <tr>
              <td style="font-weight: 700;">Total</td>
              <td style="font-weight: 700;">${escapeReceiptHtml(
                formatCurrency(total),
              )}</td>
            </tr>
          </table>

          ${
            statusLabel
              ? `<div class="status">${escapeReceiptHtml(statusLabel)}</div>`
              : ""
          }

          <div class="footer">
            Thank you for your business.
          </div>
        </div>
      </body>
    </html>
  `;
}

function printReceipt(receipt) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = frameWindow?.document;

  if (!frameWindow || !frameDocument) {
    iframe.remove();
    return;
  }

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 300);
  };

  frameWindow.onafterprint = cleanup;
  frameDocument.open();
  frameDocument.write(buildReceiptHtml(receipt));
  frameDocument.close();

  window.setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
  }, 150);
}

function parseCurrencyInput(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return 0;
  }

  const parsedValue = Number.parseFloat(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getCartItemQuantity(item) {
  if (isFuelCategory(item?.category)) {
    return getFuelQuantityFromAmount(
      item?.amountInput ?? item?.amount,
      item?.price,
    );
  }

  return Number(item?.qty || 0);
}

function getCartItemLineTotal(item) {
  if (isFuelCategory(item?.category)) {
    return parseCurrencyInput(item?.amountInput ?? item?.amount);
  }

  return Number(item?.price || 0) * Number(item?.qty || 0);
}

function normalizeProductName(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function normalizeFuelGiftLookupCode(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function getProductIconKey(productName) {
  const normalized = normalizeProductName(productName);

  if (normalized === "rice (50kg)") {
    return "rice-50";
  }

  if (normalized === "rice (25kg)") {
    return "rice-25";
  }

  if (normalized.includes("sugar")) {
    return "sugar";
  }

  if (normalized.includes("cooking oil")) {
    return "oil";
  }

  if (normalized === "onion" || normalized === "onions") {
    return "onion";
  }

  if (normalized.includes("cement")) {
    return "cement";
  }

  if (normalized === "petrol") {
    return "petrol";
  }

  if (normalized === "diesel") {
    return "diesel";
  }

  return "onion";
}

function getProductOrder(productName) {
  const normalized = normalizeProductName(productName);

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

  if (normalized === "onion" || normalized === "onions") {
    return 5;
  }

  if (normalized.includes("cement")) {
    return 6;
  }

  if (normalized.includes("rice")) {
    return 7;
  }

  return 99;
}

function ProductIcon({ icon, className = "h-10 w-10" }) {
  if (icon === "rice-50") {
    return (
      <Image
        src="/icons/jah-rice-50kg.png"
        alt="Rice 50kg"
        width={96}
        height={96}
        className={className}
      />
    );
  }

  if (icon === "rice-25") {
    return (
      <Image
        src="/icons/jah-rice-25kg.png"
        alt="Rice 25kg"
        width={96}
        height={96}
        className={className}
      />
    );
  }

  if (icon === "sugar") {
    return <SugarBagIcon className={className} />;
  }

  if (icon === "oil") {
    return (
      <Image
        src="/icons/cooking-oil50l.png"
        alt="Cooking oil"
        width={96}
        height={96}
        className={className}
      />
    );
  }

  if (icon === "cement") {
    return (
      <Image
        src="/icons/cement.png"
        alt="Cement"
        width={96}
        height={96}
        className={className}
      />
    );
  }

  if (icon === "onion") {
    return (
      <Image
        src="/icons/onions.png"
        alt="Onions"
        width={96}
        height={96}
        className={className}
      />
    );
  }

  if (icon === "petrol") {
    return (
      <Image
        src="/icons/petrol-icon.png"
        alt="Petrol"
        width={96}
        height={96}
        className={className}
      />
    );
  }

  if (icon === "diesel") {
    return (
      <Image
        src="/icons/diesel-icon.png"
        alt="Diesel"
        width={96}
        height={96}
        className={className}
      />
    );
  }

  return <OnionIcon className={className} />;
}

function buildFallbackProducts() {
  return [
    { id: "", name: "Petrol", price: 112, unit: "liter", category: "fuel" },
    { id: "", name: "Diesel", price: 115, unit: "liter", category: "fuel" },
    { id: "", name: "Rice (50kg)", price: 1700, unit: "bag", category: "shop" },
    { id: "", name: "Rice (25kg)", price: 800, unit: "bag", category: "shop" },
    {
      id: "",
      name: "Cooking Oil (20-Litre)",
      price: 1500,
      unit: "container",
      category: "shop",
    },
    { id: "", name: "Onion", price: 500, unit: "bag", category: "shop" },
    {
      id: "",
      name: "Cement (42,5 R)",
      price: 450,
      unit: "bag",
      category: "cement",
    },
  ];
}

export default function PosPageClient({
  products = [],
  stations = [],
  paymentMethods = [],
  shellProps,
}) {
  const session = shellProps?.session || null;
  const [cart, setCart] = useState([]);
  const [stationId, setStationId] = useState(stations[0]?.id || "");
  const [cashierName, setCashierName] = useState(
    session?.fullName || "POS Counter",
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [vehicleRegistrationNumber, setVehicleRegistrationNumber] = useState("");
  const [companyOrOrganizationName, setCompanyOrOrganizationName] = useState("");
  const [billableTo, setBillableTo] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [bulkReferenceCode, setBulkReferenceCode] = useState("");
  const [fuelGiftCode, setFuelGiftCode] = useState("");
  const [appliedFuelGift, setAppliedFuelGift] = useState(null);
  const [isApplyingFuelGift, setIsApplyingFuelGift] = useState(false);
  const [creditDueDate, setCreditDueDate] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const creditDueDateInputRef = useRef(null);
  const [shouldPrintReceipt, setShouldPrintReceipt] = useState(true);
  const [submissionState, setSubmissionState] = useState(null);
  const [saleRefreshKey, setSaleRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();
  const { pendingCount, isOnline } = usePosSyncStatus({
    autoSync: true,
  });
  const availablePaymentMethods = useMemo(() => {
    const source =
      Array.isArray(paymentMethods) && paymentMethods.length > 0
        ? paymentMethods
        : getDefaultPaymentMethods().filter((method) => method.isEnabled);

    return source.map((method) => ({
      code: `${method.code || ""}`.trim().toLowerCase(),
      label: method.label || `${method.code || ""}`.trim(),
    }));
  }, [paymentMethods]);
  const [paymentMethod, setPaymentMethod] = useState(
    availablePaymentMethods[0]?.code || "cash",
  );

  const catalogProducts = useMemo(() => {
    const source = products.length ? products : buildFallbackProducts();

    return source
      .map((product) => ({
        id: product.id || "",
        name: product.name,
        price: Number(product.price || 0),
        unit: product.unit || "unit",
        category: product.category || "shop",
        icon: getProductIconKey(product.name),
        accent: "from-slate-50 to-white",
      }))
      .sort(
        (left, right) =>
          getProductOrder(left.name) - getProductOrder(right.name),
      );
  }, [products]);
  const canManageCheckoutContext = isPrivilegedRole(session?.roleName);
  const canReverseTransactions = isCashierRole(session?.roleName);
  const checkoutEmptyStateIcon = getCheckoutEmptyStateIcon(session?.roleName);

  function openCreditDueDatePicker() {
    const input = creditDueDateInputRef.current;

    if (!input) {
      return;
    }

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.focus();
  }

  useEffect(() => {
    void registerPosOfflineSupport();
  }, []);

  useEffect(() => {
    if (availablePaymentMethods.length === 0) {
      return;
    }

    if (
      !availablePaymentMethods.some((method) => method.code === paymentMethod)
    ) {
      setPaymentMethod(availablePaymentMethods[0].code);
    }
  }, [availablePaymentMethods, paymentMethod]);

  useEffect(() => {
    if (!submissionState?.message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSubmissionState(null);
    }, 4500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [submissionState]);

  async function handleApplyFuelGiftCode() {
    if (!normalizedFuelGiftCode) {
      setSubmissionState({
        tone: "warning",
        message: "Enter a fuel gift code before applying it.",
      });
      return;
    }

    if (!isOnline) {
      setSubmissionState({
        tone: "warning",
        message:
          "Fuel gift redemption requires an internet connection so the code can be verified live.",
      });
      return;
    }

    setSubmissionState(null);
    setIsApplyingFuelGift(true);

    try {
      const response = await fetch("/api/pos/fuel-gifts/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: normalizedFuelGiftCode }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success || !payload?.gift) {
        throw new Error(
          payload?.message || "Fuel gift code could not be verified.",
        );
      }

      const gift = payload.gift;
      const matchedProduct = catalogProducts.find((product) => {
        const normalizedName = normalizeProductName(product.name);

        return (
          normalizedName === normalizeProductName(gift.productName) ||
          normalizedName === normalizeProductName(gift.productCode)
        );
      });

      if (!matchedProduct) {
        throw new Error(
          "This cashier cannot sell the fuel product linked to that gift code.",
        );
      }

      setAppliedFuelGift(gift);
      setCart([
        {
          ...matchedProduct,
          qty: 1,
          amount: Number(gift.amount || 0),
          amountInput: String(Number(gift.amount || 0)),
        },
      ]);
      setCustomerName(gift.recipientName || gift.clientName || "");
      setSubmissionState({
        tone: "success",
        message: `Fuel gift loaded for ${gift.recipientName || "recipient"}.`,
      });
    } catch (error) {
      setAppliedFuelGift(null);
      setSubmissionState({
        tone: "error",
        message: getUserFacingErrorMessage(error, {
          moduleName: "POS",
          genericLabel: "verify this fuel gift code",
          fallbackMessage: "Fuel gift code could not be verified.",
        }),
      });
    } finally {
      setIsApplyingFuelGift(false);
    }
  }

  function handleClearFuelGift() {
    setAppliedFuelGift(null);
    setFuelGiftCode("");
    setCart([]);
    setCustomerName("");
    setSubmissionState(null);
  }

  function addToCart(product) {
    if (isFuelGiftLocked) {
      setSubmissionState({
        tone: "warning",
        message: "Clear the applied fuel gift before changing the product selection.",
      });
      return;
    }

    setSubmissionState(null);
    setCart((currentCart) => {
      const existingItem = currentCart.find(
        (item) => item.name === product.name,
      );

      if (existingItem) {
        const nextFuelAmount =
          getCartItemLineTotal(existingItem) + Number(product.price || 0);

        return currentCart.map((item) =>
          item.name === product.name
            ? isFuelCategory(item.category)
              ? { ...item, amountInput: String(nextFuelAmount) }
              : { ...item, qty: item.qty + 1 }
            : item,
        );
      }

      return [
        ...currentCart,
        isFuelCategory(product.category)
          ? {
              ...product,
              qty: 1,
              amount: Number(product.price || 0),
              amountInput: String(Number(product.price || 0)),
            }
          : { ...product, qty: 1 },
      ];
    });
  }

  function updateQty(productName, quantity) {
    if (isFuelGiftLocked) {
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 1) {
      return;
    }

    setCart((currentCart) =>
      currentCart.map((item) =>
        item.name === productName ? { ...item, qty: quantity } : item,
      ),
    );
  }

  function updateFuelAmount(productName, amountInput) {
    if (isFuelGiftLocked) {
      return;
    }

    setCart((currentCart) =>
      currentCart.map((item) =>
        item.name === productName ? { ...item, amountInput } : item,
      ),
    );
  }

  function removeFromCart(productName) {
    if (isFuelGiftLocked) {
      return;
    }

    setCart((currentCart) =>
      currentCart.filter((item) => item.name !== productName),
    );
  }

  const subtotal = useMemo(
    () => cart.reduce((total, item) => total + getCartItemLineTotal(item), 0),
    [cart],
  );
  const total = subtotal;
  const hasFuelItemsInCart = useMemo(
    () => cart.some((item) => isFuelCategory(item.category)),
    [cart],
  );
  const normalizedFuelGiftCode = useMemo(
    () => normalizeFuelGiftLookupCode(fuelGiftCode),
    [fuelGiftCode],
  );
  const isFuelGiftLocked =
    isFuelGiftPaymentMethod(paymentMethod) &&
    Boolean(appliedFuelGift?.code) &&
    normalizeFuelGiftLookupCode(appliedFuelGift.code) === normalizedFuelGiftCode;
  const isPaymentContextValid = useMemo(() => {
    if (isCouponPaymentMethod(paymentMethod)) {
      return Boolean(
        couponCode.trim() &&
          customerName.trim() &&
          customerPhone.trim() &&
          (!hasFuelItemsInCart || vehicleRegistrationNumber.trim()) &&
          companyOrOrganizationName.trim(),
      );
    }

    if (isBulkRedeemPaymentMethod(paymentMethod)) {
      return Boolean(bulkReferenceCode.trim());
    }

    if (isFuelGiftPaymentMethod(paymentMethod)) {
      return Boolean(
        normalizedFuelGiftCode &&
          appliedFuelGift?.code &&
          normalizeFuelGiftLookupCode(appliedFuelGift.code) ===
            normalizedFuelGiftCode,
      );
    }

    if (isCreditPaymentMethod(paymentMethod)) {
      return Boolean(
        customerName.trim() &&
          customerPhone.trim() &&
          (!hasFuelItemsInCart || vehicleRegistrationNumber.trim()) &&
          billableTo.trim(),
      );
    }

    return true;
  }, [
    bulkReferenceCode,
    billableTo,
    couponCode,
    fuelGiftCode,
    appliedFuelGift,
    companyOrOrganizationName,
    customerName,
    customerPhone,
    hasFuelItemsInCart,
    normalizedFuelGiftCode,
    paymentMethod,
    vehicleRegistrationNumber,
  ]);

  useEffect(() => {
    if (!isFuelGiftPaymentMethod(paymentMethod)) {
      if (appliedFuelGift) {
        setCart([]);
        setCustomerName("");
      }
      setAppliedFuelGift(null);
      setFuelGiftCode("");
    }
  }, [appliedFuelGift, paymentMethod]);

  function handleCompleteSale() {
    if (!isPaymentContextValid) {
      setSubmissionState({
        tone: "warning",
        message: "Complete the required payment details before saving this sale.",
      });
      return;
    }

    setSubmissionState(null);
    const selectedStation = stations.find(
      (station) => station.id === stationId,
    );
    const saleDate = new Date().toISOString();
    const saleItems = cart.map((item) => ({
      productId: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      price: item.price,
      qty: getCartItemQuantity(item),
      amount: isFuelCategory(item.category)
        ? getCartItemLineTotal(item)
        : undefined,
    }));
    const salePayload = {
      stationId,
      stationName: selectedStation?.name || "",
      paymentMethod,
      cashierName,
      customerName,
      customerPhone,
      vehicleRegistrationNumber,
      companyOrOrganizationName,
      billableTo,
      couponCode,
      bulkReferenceCode,
      fuelGiftCode,
      creditDueDate,
      paymentNote,
      saleDate,
      items: saleItems,
    };
    const receiptContext = {
      saleDate,
      stationName: selectedStation?.name || "",
      cashierName,
      customerName: isFuelGiftLocked
        ? appliedFuelGift?.recipientName ||
          appliedFuelGift?.clientName ||
          customerName ||
          "Gift Recipient"
        : customerName || "Walk-in Customer",
      customerPhone,
      vehicleRegistrationNumber,
      companyOrOrganizationName,
      billableTo,
      paymentMethod:
        availablePaymentMethods.find((method) => method.code === paymentMethod)
          ?.label || paymentMethod,
      items: saleItems,
      subtotal,
      total,
    };

    startTransition(async () => {
      try {
        if (isFuelGiftPaymentMethod(paymentMethod)) {
          if (!isOnline) {
            setSubmissionState({
              tone: "warning",
              message:
                "Fuel gift redemption requires an internet connection and cannot be queued offline.",
            });
            return;
          }

          const response = await fetch("/api/pos/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(salePayload),
          });
          const result = await response.json().catch(() => null);

          if (!response.ok || !result?.success) {
            throw new Error(result?.message || "Fuel gift sale could not be completed.");
          }

          setCart([]);
          setCustomerName("");
          setCustomerPhone("");
          setVehicleRegistrationNumber("");
          setCompanyOrOrganizationName("");
          setBillableTo("");
          setCouponCode("");
          setBulkReferenceCode("");
          setFuelGiftCode("");
          setAppliedFuelGift(null);
          setCreditDueDate("");
          setPaymentNote("");
          setSubmissionState({
            tone: "success",
            message: "Sale completed successfully.",
          });
          setSaleRefreshKey((current) => current + 1);

          if (shouldPrintReceipt) {
            printReceipt({
              ...receiptContext,
              receiptNumber: result.receiptNumber || "",
              statusLabel: "Sale synced successfully.",
            });
          }

          return;
        }

        const queuedSale = queuePendingPosSale(salePayload);
        const provisionalReceiptNumber = await buildClientReceiptNumber({
          saleDate,
          clientSaleId: queuedSale.id,
        });

        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setVehicleRegistrationNumber("");
        setCompanyOrOrganizationName("");
        setBillableTo("");
        setCouponCode("");
        setBulkReferenceCode("");
        setFuelGiftCode("");
        setAppliedFuelGift(null);
        setCreditDueDate("");
        setPaymentNote("");

        if (!isOnline) {
          setSubmissionState({
            tone: "warning",
            message:
              "Offline mode: sale is saved on this device and will sync automatically when internet connection is restored.",
          });

          if (shouldPrintReceipt) {
            printReceipt({
              ...receiptContext,
              receiptNumber: provisionalReceiptNumber,
              statusLabel:
                "Sale saved locally. Sync will continue automatically when connection is restored.",
            });
          }
          return;
        }

        const syncResult = await syncPendingPosSales({
          prioritizeSaleId: queuedSale.id,
        });
        const queuedSaleResult = syncResult?.results?.[queuedSale.id];

        if (queuedSaleResult?.success) {
          setSubmissionState({
            tone: "success",
            message: "Sale completed successfully.",
          });
          setSaleRefreshKey((current) => current + 1);

          if (shouldPrintReceipt) {
            printReceipt({
              ...receiptContext,
              receiptNumber:
                queuedSaleResult.receiptNumber || provisionalReceiptNumber,
              statusLabel: "Sale synced successfully.",
            });
          }
          return;
        }

        setSubmissionState({
          tone: "warning",
          message:
            "Some issues were encountered. The sale is saved on this device and will sync automatically once the issue is resolved.",
        });

        if (shouldPrintReceipt) {
          printReceipt({
            ...receiptContext,
            receiptNumber: provisionalReceiptNumber,
            statusLabel: queuedSaleResult?.message
              ? `Sale saved locally. Sync pending: ${queuedSaleResult.message}`
              : "Sale saved locally. Sync pending.",
          });
        }
      } catch (error) {
        setSubmissionState({
          tone: "error",
          message: getUserFacingErrorMessage(error, {
            moduleName: "POS",
            genericLabel: "save this sale locally",
            fallbackMessage: "Failed to save sale locally.",
          }),
        });
      }
    });
  }

  return (
    <DashboardPageShell
      title="POS"
      description=""
      {...shellProps}
      actions={
        <>
          {canReverseTransactions ? (
            <PosCashierTransactionsControl
              session={session}
              refreshKey={saleRefreshKey}
            />
          ) : null}
          <PosSyncNavControl />
        </>
      }
    >
      <ToastMessage
        message={submissionState?.message || ""}
        tone={
          submissionState?.tone === "success"
            ? "success"
            : submissionState?.tone === "warning"
              ? "warning"
              : submissionState
                ? "error"
                : "info"
        }
        onClose={() => setSubmissionState(null)}
      />
      <div className="grid gap-6 md:grid-cols-10 md:items-start">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.05)] md:col-span-6">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-100 px-6 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] tracking-[0.24em] text-sky-700 uppercase">
                  POS Catalog
                </p>
                <h2 className="mt-1.5 text-2xl font-semibold text-slate-900">
                  Available Products
                </h2>
                {/* <p className="mt-2 max-w-xl text-sm text-slate-600">
                  Select in-store items, update quantities, and prepare a clean
                  checkout flow for commodity sales.
                </p> */}
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              {catalogProducts.map((product) => (
                <button
                  key={product.name}
                  type="button"
                  onClick={() => addToCart(product)}
                  className={`group cursor-pointer rounded-[1.5rem] border border-slate-200 bg-gradient-to-br ${product.accent} p-3.5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg`}
                >
                  <div className="flex justify-center">
                    <div className="flex h-24 w-24 items-center justify-center rounded-[1.25rem] bg-sky-50/80">
                      <ProductIcon
                        icon={product.icon}
                        className="h-16 w-16 object-contain"
                      />
                    </div>
                  </div>
                  <div className="mt-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {product.name}
                    </h3>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {formatCurrency(product.price)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      per {product.unit}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.05)] md:col-span-4">
          <div className="border-b border-slate-200 bg-slate-900 px-6 py-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] tracking-[0.24em] text-sky-200 uppercase">
                  Checkout
                </p>
                <h2 className="mt-1.5 text-xl font-semibold">Sale Summary</h2>
                {/* <p className="mt-1.5 text-xs text-slate-300">
                  Review cart lines, adjust quantities, and confirm totals
                  before completing the sale.
                </p> */}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="rounded-2xl bg-white/10 px-3 py-2 text-white">
                  <AppIcon name="receipt" className="h-5 w-5" />
                </span>
                {pendingCount > 0 ? (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-sky-100">
                    {pendingCount.toLocaleString()} not synced
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {canManageCheckoutContext ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Station
                  </label>
                  <select
                    value={stationId}
                    onChange={(event) => setStationId(event.target.value)}
                    disabled={stations.length <= 1}
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                  >
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Cashier
                  </label>
                  <input
                    type="text"
                    value={cashierName}
                    onChange={(event) => setCashierName(event.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            ) : null}

            <div>
              <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                Payment
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {availablePaymentMethods.map((method) => {
                  const isSelected = method.code === paymentMethod;

                  return (
                    <button
                      key={method.code}
                      type="button"
                      onClick={() => setPaymentMethod(method.code)}
                      className={`font-small cursor-pointer rounded-full border px-2 py-1 text-sm transition ${
                        isSelected
                          ? "border-sky-500 bg-sky-50 text-sky-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {method.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  disabled={isFuelGiftLocked}
                  placeholder={
                    isCouponPaymentMethod(paymentMethod) ||
                    isCreditPaymentMethod(paymentMethod)
                      ? "Required"
                      : "Optional"
                  }
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder={
                    isCouponPaymentMethod(paymentMethod) ||
                    isCreditPaymentMethod(paymentMethod)
                      ? "Required"
                      : "Optional"
                  }
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {isCouponPaymentMethod(paymentMethod) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Coupon Code
                  </label>
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value)}
                    placeholder="Required"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                  />
                </div>
                {hasFuelItemsInCart ? (
                  <div>
                    <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                      Vehicle Registration
                    </label>
                    <input
                      type="text"
                      value={vehicleRegistrationNumber}
                      onChange={(event) =>
                        setVehicleRegistrationNumber(event.target.value)
                      }
                      placeholder="Required for fuel"
                      className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                    />
                  </div>
                ) : null}
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Company / Organization
                  </label>
                  <input
                    type="text"
                    value={companyOrOrganizationName}
                    onChange={(event) =>
                      setCompanyOrOrganizationName(event.target.value)
                    }
                    placeholder="Required"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Note
                  </label>
                  <input
                    type="text"
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    placeholder="Optional"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            ) : null}

            {isCreditPaymentMethod(paymentMethod) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Credit Due Date
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openCreditDueDatePicker}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 transition hover:border-slate-300 focus:border-sky-500 focus:outline-none"
                    >
                      <span
                        className={
                          creditDueDate ? "text-slate-900" : "text-slate-400"
                        }
                      >
                        {formatDateFieldLabel(creditDueDate)}
                      </span>
                      <AppIcon name="clock" className="h-4 w-4 text-slate-400" />
                    </button>
                    {creditDueDate ? (
                      <button
                        type="button"
                        onClick={() => setCreditDueDate("")}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                        aria-label="Clear due date"
                      >
                        <AppIcon name="close" className="h-4 w-4" />
                      </button>
                    ) : null}
                    <input
                      ref={creditDueDateInputRef}
                      type="date"
                      value={creditDueDate}
                      onChange={(event) => setCreditDueDate(event.target.value)}
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                  </div>
                </div>
                {hasFuelItemsInCart ? (
                  <div>
                    <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                      Vehicle Registration
                    </label>
                    <input
                      type="text"
                      value={vehicleRegistrationNumber}
                      onChange={(event) =>
                        setVehicleRegistrationNumber(event.target.value)
                      }
                      placeholder="Required for fuel"
                      className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                    />
                  </div>
                ) : null}
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Billable To
                  </label>
                  <input
                    type="text"
                    value={billableTo}
                    onChange={(event) => setBillableTo(event.target.value)}
                    placeholder="Required"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Note
                  </label>
                  <input
                    type="text"
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    placeholder="Optional"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            ) : null}

            {isBulkRedeemPaymentMethod(paymentMethod) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Bulk Reference
                  </label>
                  <input
                    type="text"
                    value={bulkReferenceCode}
                    onChange={(event) => setBulkReferenceCode(event.target.value)}
                    placeholder="Required"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Note
                  </label>
                  <input
                    type="text"
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    placeholder="Optional"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            ) : null}

            {isFuelGiftPaymentMethod(paymentMethod) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Fuel Gift Code
                  </label>
                  <input
                    type="text"
                    value={fuelGiftCode}
                    onChange={(event) => {
                      setFuelGiftCode(event.target.value.toUpperCase());
                      setCart([]);
                      setCustomerName("");
                      setAppliedFuelGift(null);
                    }}
                    placeholder="Required"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 uppercase transition outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                    Note
                  </label>
                  <input
                    type="text"
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    placeholder="Optional"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition outline-none focus:border-sky-500"
                  />
                </div>
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleApplyFuelGiftCode}
                    disabled={isApplyingFuelGift || !normalizedFuelGiftCode}
                    className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                  >
                    {isApplyingFuelGift ? "Applying..." : "Apply Gift Code"}
                  </button>
                  {appliedFuelGift ? (
                    <button
                      type="button"
                      onClick={handleClearFuelGift}
                      className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Clear Gift
                    </button>
                  ) : null}
                </div>
                {appliedFuelGift ? (
                  <div className="sm:col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                    <p className="font-semibold text-emerald-900">
                      Gift ready: {appliedFuelGift.productName} · {formatCurrency(appliedFuelGift.amount)}
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Recipient: {appliedFuelGift.recipientName || "Recipient"} · Code: {appliedFuelGift.code}
                    </p>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <p className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                    Fuel gift redemptions must match the assigned fuel product and the exact gift value.
                  </p>
                </div>
              </div>
            ) : null}

            {cart.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-2xl shadow-sm">
                  <AppIcon
                    name={checkoutEmptyStateIcon}
                    className="h-7 w-7 text-slate-700"
                  />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  Cart is empty
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Add items from the product catalog to build a sale.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {cart.map((item) => (
                    <div
                      key={item.name}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold text-slate-900">
                                {item.name}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {formatCurrency(item.price)} per {item.unit}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.name)}
                              disabled={isFuelGiftLocked}
                              className="cursor-pointer rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <AppIcon name="close" className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            {isFuelCategory(item.category) ? (
                              <div>
                                <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                                  Amount
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={item.amountInput ?? ""}
                                  disabled={isFuelGiftLocked}
                                  onChange={(event) =>
                                    updateFuelAmount(
                                      item.name,
                                      event.target.value,
                                    )
                                  }
                                  className="mt-1 block w-24 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 transition outline-none focus:border-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                                />
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {formatFuelQuantity(
                                    truncateToTwoDecimals(
                                      getFuelQuantityFromAmount(
                                        item.amountInput ?? item.amount,
                                        item.price,
                                      ),
                                    ),
                                  )}{" "}
                                  liters
                                </p>
                              </div>
                            ) : (
                              <div>
                                <label className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                                  Qty
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.qty}
                                  disabled={isFuelGiftLocked}
                                  onChange={(event) =>
                                    updateQty(
                                      item.name,
                                      Number.parseInt(event.target.value, 10),
                                    )
                                  }
                                  className="mt-1 block w-24 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 transition outline-none focus:border-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                                />
                              </div>
                            )}
                            <div className="text-right">
                              <p className="text-[10px] tracking-[0.2em] text-slate-400 uppercase">
                                Line Total
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {formatCurrency(getCartItemLineTotal(item))}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-[1.5rem] bg-slate-950 px-4 py-4 text-white">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="border-t border-white/10 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-200">
                          Total
                        </span>
                        <span className="text-xl font-semibold text-white">
                          {formatCurrency(total)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={shouldPrintReceipt}
                    onChange={(event) =>
                      setShouldPrintReceipt(event.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="font-medium">Print receipt after sale</span>
                </label>

                <button
                  type="button"
                  onClick={handleCompleteSale}
                  disabled={
                    isPending ||
                    cart.length === 0 ||
                    !stationId ||
                    !isPaymentContextValid
                  }
                  className={`w-full cursor-pointer rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${PRIMARY_ACTION_BUTTON_CLASS}`}
                >
                  {isPending ? "Saving..." : "Complete Sale"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardPageShell>
  );
}
