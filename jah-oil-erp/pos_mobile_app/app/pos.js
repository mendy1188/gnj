import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Redirect } from "expo-router";

import InfoCard from "../components/ui/InfoCard";
import LoadingScreen from "../components/ui/LoadingScreen";
import { useAuth } from "../features/auth/AuthProvider";
import {
  fetchCashierDayTransactions,
  fetchPosBootstrap,
  lookupFuelGiftCode,
  syncMobilePosSale,
} from "../features/auth/api";
import { getProductIcon, getProductOrder } from "../features/pos/product-icons";
import {
  clearResolvedPosSyncEntries,
  formatLastSyncedAt,
  getPosSyncPanelSnapshot,
  getPosSyncStatusSnapshot,
  loadCachedPosBootstrap,
  markPendingPosSaleNeedsReview,
  queuePendingPosSale,
  queuePendingPosReversal,
  reportPosDeviceSyncStatus,
  saveCachedPosBootstrap,
  subscribeToPosSyncStatus,
  syncPendingPosSales,
} from "../features/pos/offline-sync";
import { getUserFacingErrorMessage } from "../features/errors/messages";
import { useAppTheme, useThemedStyles } from "../theme/ThemeProvider";

const TRANSACTIONS_PAGE_SIZE = 20;

function formatCurrency(value) {
  return `D${Number(value || 0).toLocaleString()}`;
}

function prefetchProductImages(products = []) {
  const imageUrls = [
    ...new Set(
      products
        .map((product) => `${product?.imageUrl || ""}`.trim())
        .filter(Boolean),
    ),
  ];

  imageUrls.forEach((imageUrl) => {
    Image.prefetch(imageUrl).catch(() => {});
  });
}

function normalizeProductIdentity(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function normalizeFuelGiftLookupCode(value) {
  return `${value || ""}`.trim().toUpperCase();
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

function parseCurrencyInput(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = `${value || ""}`.trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTwoDecimalInput(value) {
  const normalizedValue = `${value || ""}`
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "");

  if (!normalizedValue) {
    return "";
  }

  const [wholePart, decimalPart = "", ...extraParts] = normalizedValue.split(".");
  const mergedDecimalPart = `${decimalPart}${extraParts.join("")}`.slice(0, 2);

  if (normalizedValue.includes(".")) {
    return `${wholePart || "0"}.${mergedDecimalPart}`;
  }

  return wholePart;
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

function formatFuelQuantity(value) {
  const normalizedValue = Number(value || 0);

  if (!Number.isFinite(normalizedValue)) {
    return "0.0";
  }

  return normalizedValue.toFixed(1);
}

function getCartItemQuantity(item) {
  if (isFuelCategory(item?.category)) {
    return getFuelQuantityFromAmount(item?.amountInput ?? item?.amount, item?.price);
  }

  return Number(item?.qty || 0);
}

function getCartItemLineTotal(item) {
  if (isFuelCategory(item?.category)) {
    return parseCurrencyInput(item?.amountInput ?? item?.amount);
  }

  return Number(item?.price || 0) * Number(item?.qty || 0);
}

function isPrivilegedRole(roleName) {
  return ["Admin", "General Manager"].includes(`${roleName || ""}`.trim());
}

function isCashierRole(roleName) {
  return ["General Sales", "Fuel Sales"].includes(`${roleName || ""}`.trim());
}

function isFuelSalesRole(roleName) {
  return `${roleName || ""}`.trim() === "Fuel Sales";
}

function getCheckoutEmptyStateIcon(roleName) {
  return isFuelSalesRole(roleName) ? "🛢️" : "🛒";
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00.000`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value) {
  const parsedDate = new Date(value || "");

  if (Number.isNaN(parsedDate.getTime())) {
    return "Today";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsedDate);
}

function formatTimeOnly(value) {
  const parsedDate = new Date(value || "");

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

function formatTransactionQuantity(record) {
  if (isFuelCategory(record?.category)) {
    return `${formatFuelQuantity(record?.quantity)} ${record?.unit || "L"}`;
  }

  return `${Number(record?.quantity || 0).toLocaleString()} ${record?.unit || "unit"}`;
}

function isQueueNetworkMessage(message) {
  const normalizedMessage = `${message || ""}`.trim().toLowerCase();

  return (
    normalizedMessage.includes("connection") ||
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("reach the server") ||
    normalizedMessage.includes("unable to sync")
  );
}

function buildQueuedSaleToastMessage(syncMessage) {
  if (!syncMessage) {
    return "Sale saved on this device and added to the sync queue. It will sync automatically shortly.";
  }

  if (isQueueNetworkMessage(syncMessage)) {
    return "No connection right now. Sale saved on this device and added to the sync queue. It will sync automatically when the connection improves.";
  }

  return "Sale saved on this device, but it could not sync right now. It was added to the queue and will retry automatically.";
}

function buildQueuedReversalToastMessage(syncMessage) {
  if (!syncMessage) {
    return "Transaction reversed on this device and added to the sync queue. It will sync automatically shortly.";
  }

  if (isQueueNetworkMessage(syncMessage)) {
    return "No connection right now. Transaction reversed on this device and queued. It will sync automatically when the connection improves.";
  }

  return "Transaction reversed on this device, but it could not sync right now. It was added to the queue and will retry automatically.";
}

function getQueuedEntryTypeLabel(entry) {
  return `${entry?.syncAction || ""}`.trim().toLowerCase() === "sale_reverse"
    ? "Reversal"
    : "Sale";
}

function getQueuedReversalReceiptIds(queuedSales = []) {
  return new Set(
    (Array.isArray(queuedSales) ? queuedSales : [])
      .filter(
        (entry) =>
          `${entry?.syncAction || ""}`.trim().toLowerCase() === "sale_reverse",
      )
      .map((entry) => `${entry?.receiptNumber || ""}`.trim() || `${entry?.id || ""}`.trim())
      .filter(Boolean),
  );
}

function removeReceiptFromSummary(summary, receiptNumber, amount) {
  const normalizedReceiptNumber = `${receiptNumber || ""}`.trim();

  if (!normalizedReceiptNumber) {
    return summary;
  }

  const nextRecords = (Array.isArray(summary?.records) ? summary.records : []).filter(
    (record) => `${record?.receiptNumber || ""}`.trim() !== normalizedReceiptNumber,
  );
  const removedCount =
    (Array.isArray(summary?.records) ? summary.records.length : 0) - nextRecords.length;

  if (removedCount <= 0) {
    return summary;
  }

  return {
    ...summary,
    totalTransactions: Math.max(0, Number(summary?.totalTransactions || 0) - removedCount),
    totalAmount: Math.max(
      0,
      Number((Number(summary?.totalAmount || 0) - Number(amount || 0)).toFixed(2)),
    ),
    records: nextRecords,
  };
}

function removeQueuedReversalTransactions(summary, queuedReceiptNumbers) {
  const queuedIds = queuedReceiptNumbers instanceof Set
    ? queuedReceiptNumbers
    : new Set();

  return (Array.isArray(summary?.records) ? summary.records : []).reduce(
    (currentSummary, record) => {
      const receiptNumber = `${record?.receiptNumber || ""}`.trim();

      if (!receiptNumber || !queuedIds.has(receiptNumber)) {
        return currentSummary;
      }

      return removeReceiptFromSummary(
        currentSummary,
        receiptNumber,
        Number(record?.amount || 0),
      );
    },
    summary,
  );
}

function SyncIcon({ color = "#0f172a", isSyncing = false }) {
  return (
    <View
      style={{
        width: 20,
        height: 20,
        position: "relative",
        opacity: isSyncing ? 0.75 : 1,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 2,
          left: 5,
          width: 11,
          height: 11,
          borderRadius: 999,
          borderWidth: 1.8,
          borderColor: color,
          borderLeftColor: "transparent",
          borderBottomColor: "transparent",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 2,
          top: 2,
          width: 5,
          height: 5,
          borderLeftWidth: 1.8,
          borderTopWidth: 1.8,
          borderColor: color,
          transform: [{ rotate: "-45deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 2,
          right: 5,
          width: 11,
          height: 11,
          borderRadius: 999,
          borderWidth: 1.8,
          borderColor: color,
          borderTopColor: "transparent",
          borderRightColor: "transparent",
        }}
      />
      <View
        style={{
          position: "absolute",
          right: 2,
          bottom: 2,
          width: 5,
          height: 5,
          borderRightWidth: 1.8,
          borderBottomWidth: 1.8,
          borderColor: color,
          transform: [{ rotate: "-45deg" }],
        }}
      />
    </View>
  );
}

export default function PosScreen() {
  const { palette, isDark, mode, toggleMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { token, session, isHydrating, signOut } = useAuth();
  const { width, height } = useWindowDimensions();
  const [bootstrap, setBootstrap] = useState(null);
  const [bootstrapNotice, setBootstrapNotice] = useState("");
  const [bootstrapError, setBootstrapError] = useState("");
  const [isLoadingBootstrap, setIsLoadingBootstrap] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cart, setCart] = useState([]);
  const [stationId, setStationId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [cashierName, setCashierName] = useState(session?.fullName || "POS Counter");
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
  const [activeDatePicker, setActiveDatePicker] = useState("");
  const [datePickerValue, setDatePickerValue] = useState(new Date());
  const [paymentNote, setPaymentNote] = useState("");
  const [shouldPrintReceipt, setShouldPrintReceipt] = useState(true);
  const [submissionState, setSubmissionState] = useState(null);
  const [syncStatus, setSyncStatus] = useState({
    pendingCount: 0,
    lastSyncedAt: "",
    isOnline: true,
    isSyncing: false,
  });
  const [isSyncPanelOpen, setIsSyncPanelOpen] = useState(false);
  const [isTransactionsPanelOpen, setIsTransactionsPanelOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [syncPanel, setSyncPanel] = useState({
    queuedSales: [],
    recentActivity: [],
  });
  const [cashierDaySummary, setCashierDaySummary] = useState({
    date: "",
    totalTransactions: 0,
    totalAmount: 0,
    nextCursor: "",
    hasMore: false,
    pageSize: TRANSACTIONS_PAGE_SIZE,
    records: [],
  });
  const [isLoadingCashierDaySummary, setIsLoadingCashierDaySummary] = useState(false);
  const [cashierDaySummaryError, setCashierDaySummaryError] = useState("");
  const [transactionsCursor, setTransactionsCursor] = useState("");
  const [transactionsCursorHistory, setTransactionsCursorHistory] = useState([]);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsReloadKey, setTransactionsReloadKey] = useState(0);
  const [reversingReceiptNumber, setReversingReceiptNumber] = useState("");
  const isTabletOrLarger = Math.min(width, height) >= 700;
  const isMobilePhone = !isTabletOrLarger;

  const catalogProducts = useMemo(() => {
    const source = Array.isArray(bootstrap?.products) ? bootstrap.products : [];

    return source
      .map((product) => ({
        id: product.id || "",
        name: product.name,
        price: Number(product.price || 0),
        unit: product.unit || "unit",
        category: product.category || "shop",
        icon: getProductIcon(product.name),
        imageUrl: product.imageUrl || "",
        imageAlt: product.imageAlt || product.name || "",
      }))
      .sort((left, right) => getProductOrder(left.name) - getProductOrder(right.name));
  }, [bootstrap]);

  const stations = bootstrap?.stations || [];
  const paymentMethods = bootstrap?.paymentMethods || [];
  const canSelectStation = isPrivilegedRole(session?.roleName);
  const isFuelSalesCashier = isFuelSalesRole(session?.roleName);
  const isCashierLocked = !canSelectStation;
  const hasPosAccess = session?.modules?.includes("pos");
  const activeStation =
    stations.find((station) => station.id === stationId) || stations[0] || null;
  const currentStationName =
    `${activeStation?.name || session?.branchName || ""}`.trim() || "Assigned station";
  const currentCashierName =
    `${cashierName || session?.fullName || ""}`.trim() || "POS Counter";
  const syncIconColor = syncStatus.isOnline
    ? styles.$palette.success
    : styles.$palette.warning;
  const todayDate = useMemo(() => getTodayDateString(), []);
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
  const pendingReversalReceiptIds = useMemo(
    () => getQueuedReversalReceiptIds(syncPanel.queuedSales),
    [syncPanel.queuedSales],
  );
  const canReverseTransactions = isCashierRole(session?.roleName);
  const checkoutEmptyStateIcon = getCheckoutEmptyStateIcon(session?.roleName);
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

  const hydrateSyncState = useCallback(async () => {
    setSyncStatus(await getPosSyncStatusSnapshot());
    setSyncPanel(await getPosSyncPanelSnapshot());
    void reportPosDeviceSyncStatus({
      token,
      context: {
        stationId: activeStation?.id || stationId,
        stationName: currentStationName,
        cashierName: currentCashierName,
      },
    });
  }, [
    activeStation?.id,
    currentCashierName,
    currentStationName,
    stationId,
    token,
  ]);

  const loadBootstrap = useCallback(
    async ({ silent = false } = {}) => {
      if (!token) {
        return;
      }

      if (!silent) {
        setIsLoadingBootstrap(true);
      }

      setBootstrapError("");

      try {
        const result = await fetchPosBootstrap(token);
        const nextBootstrap = {
          products: result?.products || [],
          stations: result?.stations || [],
          paymentMethods: result?.paymentMethods || [],
        };

        prefetchProductImages(nextBootstrap.products);
        setBootstrap(nextBootstrap);
        await saveCachedPosBootstrap(nextBootstrap);
        setBootstrapNotice("");
      } catch (error) {
        const cachedBootstrap = await loadCachedPosBootstrap();

        if (cachedBootstrap) {
          prefetchProductImages(cachedBootstrap.products || []);
          setBootstrap(cachedBootstrap);
          setBootstrapNotice(
            "Showing cached POS data. New sales still queue locally and will sync later.",
          );
        } else {
          setBootstrapError(
            getUserFacingErrorMessage(error, { context: "bootstrap" }),
          );
        }
      } finally {
        setIsLoadingBootstrap(false);
        setIsRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void hydrateSyncState();
    const unsubscribe = subscribeToPosSyncStatus(() => {
      void hydrateSyncState();
    });

    return unsubscribe;
  }, [hydrateSyncState]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadBootstrap();
  }, [loadBootstrap, token]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!token) {
        return;
      }

      void getPosSyncStatusSnapshot()
        .then((snapshot) => {
          if (snapshot.pendingCount === 0) {
            return hydrateSyncState();
          }

          return syncPendingPosSales({ token }).then(hydrateSyncState);
        })
        .catch(() => {});
    }, 15000);

    return () => clearInterval(intervalId);
  }, [hydrateSyncState, token]);

  useEffect(() => {
    if (!stations.length) {
      return;
    }

    if (!stations.some((station) => station.id === stationId)) {
      setStationId(stations[0]?.id || "");
    }
  }, [stationId, stations]);

  useEffect(() => {
    if (!paymentMethods.length) {
      return;
    }

    if (!paymentMethods.some((method) => method.code === paymentMethod)) {
      setPaymentMethod(paymentMethods[0]?.code || "");
    }
  }, [paymentMethod, paymentMethods]);

  useEffect(() => {
    if (!session?.fullName) {
      return;
    }

    setCashierName(session.fullName);
  }, [session?.fullName]);

  useEffect(() => {
    if (!submissionState?.message) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setSubmissionState(null);
    }, 4500);

    return () => clearTimeout(timeoutId);
  }, [submissionState]);

  function setDateFieldValue(target, nextValue) {
    if (target === "credit_due_date") {
      setCreditDueDate(nextValue);
    }
  }

  function openDatePicker(target) {
    const currentValue =
      (target === "credit_due_date" ? parseDateInputValue(creditDueDate) : null) ||
      new Date();
    setDatePickerValue(currentValue);
    setActiveDatePicker(target);
  }

  function closeDatePicker() {
    setActiveDatePicker("");
  }

  function applyCurrentDatePickerValue() {
    if (!activeDatePicker) {
      return;
    }

    setDateFieldValue(activeDatePicker, formatDateInputValue(datePickerValue));
    closeDatePicker();
  }

  function clearCurrentDatePickerValue() {
    if (!activeDatePicker) {
      return;
    }

    setDateFieldValue(activeDatePicker, "");
    closeDatePicker();
  }

  function handleNativeDateChange(event, selectedDate) {
    if (Platform.OS === "android") {
      if (event?.type === "dismissed") {
        closeDatePicker();
        return;
      }

      if (selectedDate && activeDatePicker) {
        setDateFieldValue(activeDatePicker, formatDateInputValue(selectedDate));
      }

      closeDatePicker();
      return;
    }

    if (selectedDate) {
      setDatePickerValue(selectedDate);
    }
  }

  async function handleApplyFuelGiftCode() {
    if (!normalizedFuelGiftCode) {
      setSubmissionState({
        tone: "warning",
        message: "Enter a fuel gift code before applying it.",
      });
      return;
    }

    if (!syncStatus.isOnline) {
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
      const result = await lookupFuelGiftCode({
        token,
        code: normalizedFuelGiftCode,
      });
      const gift = result?.gift || null;

      if (!gift) {
        throw new Error("Fuel gift code could not be verified.");
      }

      const matchedProduct = catalogProducts.find((product) => {
        const normalizedName = normalizeProductIdentity(product.name);

        return (
          normalizedName === normalizeProductIdentity(gift.productName) ||
          normalizedName === normalizeProductIdentity(gift.productCode)
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
      setCustomerPhone((currentValue) => currentValue || gift.clientPhone || "");
      setSubmissionState({
        tone: "success",
        message: `Fuel gift loaded for ${gift.recipientName || "recipient"}.`,
      });
    } catch (error) {
      setAppliedFuelGift(null);
      setSubmissionState({
        tone: "error",
        message: getUserFacingErrorMessage(error, { context: "complete_sale" }),
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
    setCustomerPhone("");
    setSubmissionState(null);
  }

  useEffect(() => {
    if (!isTransactionsPanelOpen || !token) {
      return;
    }

    let isActive = true;

    async function loadCashierDaySummary() {
      setIsLoadingCashierDaySummary(true);
      setCashierDaySummaryError("");

      try {
        const result = await fetchCashierDayTransactions({
          token,
          date: todayDate,
          stationId: activeStation?.id || stationId,
          cursor: transactionsCursor,
          pageSize: TRANSACTIONS_PAGE_SIZE,
        });

        if (!isActive) {
          return;
        }

        setCashierDaySummary((current) =>
          removeQueuedReversalTransactions(
            {
              date: result?.date || todayDate,
              totalTransactions:
                typeof result?.totalTransactions === "number"
                  ? Number(result.totalTransactions)
                  : current.totalTransactions,
              totalAmount:
                typeof result?.totalAmount === "number"
                  ? Number(result.totalAmount)
                  : current.totalAmount,
              nextCursor: `${result?.nextCursor || ""}`.trim(),
              hasMore: Boolean(result?.hasMore),
              pageSize: Number(result?.pageSize || TRANSACTIONS_PAGE_SIZE),
              records: Array.isArray(result?.records) ? result.records : [],
            },
            pendingReversalReceiptIds,
          ),
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        setCashierDaySummaryError(
          getUserFacingErrorMessage(error, { context: "transactions" }),
        );
      } finally {
        if (isActive) {
          setIsLoadingCashierDaySummary(false);
        }
      }
    }

    void loadCashierDaySummary();

    return () => {
      isActive = false;
    };
  }, [
    activeStation?.id,
    isTransactionsPanelOpen,
    transactionsReloadKey,
    stationId,
    todayDate,
    token,
    transactionsCursor,
    pendingReversalReceiptIds,
  ]);

  if (isHydrating) {
    return (
      <LoadingScreen
        title="Loading POS"
        description="Restoring your cashier session and local queue."
      />
    );
  }

  if (!token || !session) {
    return <Redirect href="/login" />;
  }

  if (session.mustChangePassword) {
    return <Redirect href="/change-password" />;
  }

  if (!hasPosAccess) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <View style={styles.headerCard}>
            <Text style={styles.headerEyebrow}>Jah Oil POS</Text>
            <Text style={styles.headerTitle}>Access denied</Text>
            <Text style={styles.headerDescription}>
              This user account does not have access to the POS module. Contact your administrator.
            </Text>
            <Pressable onPress={() => void signOut()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
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
      const existingItem = currentCart.find((item) => item.name === product.name);

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

    const normalizedAmountInput = normalizeTwoDecimalInput(amountInput);

    setCart((currentCart) =>
      currentCart.map((item) =>
        item.name === productName
          ? { ...item, amountInput: normalizedAmountInput }
          : item,
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

  async function handleCompleteSale() {
    if (!stationId || !paymentMethod || cart.length === 0 || isSubmitting) {
      return;
    }

    if (!isPaymentContextValid) {
      setSubmissionState({
        tone: "warning",
        message: "Complete the required payment details before saving this sale.",
      });
      return;
    }

    setSubmissionState(null);
    setIsSubmitting(true);

    try {
      const selectedStation = stations.find((station) => station.id === stationId);
      const saleDate = new Date().toISOString();
      const resolvedCustomerName = isFuelGiftLocked
        ? appliedFuelGift?.recipientName ||
          appliedFuelGift?.clientName ||
          customerName ||
          "Gift Recipient"
        : customerName;
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
        customerName: resolvedCustomerName,
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

      if (isFuelGiftPaymentMethod(paymentMethod)) {
        if (!syncStatus.isOnline) {
          setSubmissionState({
            tone: "warning",
            message:
              "Fuel gift redemption requires an internet connection and cannot be queued offline.",
          });
          return;
        }

        const syncResult = await syncMobilePosSale({
          token,
          payload: salePayload,
        });

        if (!syncResult?.success) {
          throw new Error(
            syncResult?.message || "Fuel gift sale could not be completed.",
          );
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
        await hydrateSyncState();
        setSubmissionState({
          tone: "success",
          message: "Sale completed successfully.",
        });
        setTransactionsReloadKey((current) => current + 1);
        return;
      }

      const queuedSale = await queuePendingPosSale(salePayload);

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
      await hydrateSyncState();

      const syncResult = await syncPendingPosSales({
        token,
        prioritizeSaleId: queuedSale.id,
      });
      const queuedSaleResult = syncResult?.results?.[queuedSale.id];
      await hydrateSyncState();

      if (queuedSaleResult?.success) {
        setSubmissionState({
          tone: "success",
          message: "Sale completed successfully.",
        });
        setTransactionsReloadKey((current) => current + 1);
        return;
      }

      setSubmissionState({
        tone: "warning",
        message: buildQueuedSaleToastMessage(queuedSaleResult?.message),
      });
    } catch (error) {
      setSubmissionState({
        tone: "error",
        message: isFuelGiftPaymentMethod(paymentMethod)
          ? `${getUserFacingErrorMessage(error, { context: "complete_sale" })} Fuel gift redemption was not saved offline. Retry when the connection is stable.`
          : getUserFacingErrorMessage(error, { context: "complete_sale" }),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadBootstrap({ silent: true });
    try {
      await syncPendingPosSales({ token, force: true });
    } catch {
      // Keep cached data and queue.
    } finally {
      await hydrateSyncState();
    }
  }

  async function handleRetrySync() {
    try {
      await syncPendingPosSales({ token, force: true });
    } finally {
      await hydrateSyncState();
    }
  }

  async function handleFlagQueuedSale(saleId) {
    await markPendingPosSaleNeedsReview(saleId);
    await hydrateSyncState();
  }

  async function handleReverseTransaction(record) {
    const receiptNumber = `${record?.receiptNumber || ""}`.trim();

    if (!receiptNumber || reversingReceiptNumber) {
      return;
    }

    setSubmissionState(null);
    setReversingReceiptNumber(receiptNumber);

    try {
      const queuedReversal = await queuePendingPosReversal({
        receiptId: record?.receiptId || record?.id || "",
        receiptNumber,
        saleDate: record?.saleDate || new Date().toISOString(),
        reversedAt: new Date().toISOString(),
        stationId: activeStation?.id || stationId,
        stationName: record?.station || currentStationName,
        cashierName: currentCashierName,
        totalAmount: Number(record?.amount || 0),
      });

      setCashierDaySummary((current) =>
        removeReceiptFromSummary(current, receiptNumber, record?.amount || 0),
      );
      await hydrateSyncState();

      const syncResult = await syncPendingPosSales({
        token,
        prioritizeSaleId: queuedReversal.id,
      });
      const queuedResult = syncResult?.results?.[queuedReversal.id];
      await hydrateSyncState();

      if (queuedResult?.success) {
        setSubmissionState({
          tone: "success",
          message: "Transaction reversed successfully.",
        });
        return;
      }

      setSubmissionState({
        tone: "warning",
        message: buildQueuedReversalToastMessage(queuedResult?.message),
      });
    } catch (error) {
      setSubmissionState({
        tone: "error",
        message: getUserFacingErrorMessage(error, { context: "transactions" }),
      });
    } finally {
      setReversingReceiptNumber("");
    }
  }

  async function handleClearResolvedEntries() {
    await clearResolvedPosSyncEntries();
    await hydrateSyncState();
  }

  function handleOpenTransactionsPanel() {
    setTransactionsCursor("");
    setTransactionsCursorHistory([]);
    setTransactionsPage(1);
    setCashierDaySummary((current) => ({
      ...current,
      nextCursor: "",
      hasMore: false,
      pageSize: TRANSACTIONS_PAGE_SIZE,
      records: [],
    }));
    setIsTransactionsPanelOpen(true);
  }

  function handleNextTransactionsPage() {
    if (!cashierDaySummary.nextCursor || !cashierDaySummary.hasMore) {
      return;
    }

    setTransactionsCursorHistory((current) => [...current, transactionsCursor]);
    setTransactionsCursor(cashierDaySummary.nextCursor);
    setTransactionsPage((current) => current + 1);
  }

  function handlePreviousTransactionsPage() {
    if (transactionsCursorHistory.length === 0) {
      return;
    }

    const nextHistory = [...transactionsCursorHistory];
    const previousCursor = nextHistory.pop() || "";

    setTransactionsCursorHistory(nextHistory);
    setTransactionsCursor(previousCursor);
    setTransactionsPage((current) => Math.max(1, current - 1));
  }

  const transactionRangeStart = cashierDaySummary.records.length
    ? (transactionsPage - 1) * cashierDaySummary.pageSize + 1
    : 0;
  const transactionRangeEnd = cashierDaySummary.records.length
    ? transactionRangeStart + cashierDaySummary.records.length - 1
    : 0;

  return (
    <View style={styles.screen}>
      {submissionState?.message ? (
        <View
          style={[
            styles.toast,
            submissionState.tone === "success"
              ? styles.toastSuccess
              : submissionState.tone === "warning"
                ? styles.toastWarning
                : styles.toastError,
          ]}
        >
          <Text style={styles.toastText}>{submissionState.message}</Text>
        </View>
      ) : null}

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.stickyHeaderContainer}>
          <View style={styles.headerCard}>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.headerEyebrow}>Jah Oil</Text>
                <Text style={styles.headerTitle}>POS</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => setIsSyncPanelOpen(true)}
                  style={[
                    styles.syncButton,
                    syncStatus.isOnline ? styles.syncButtonOnline : styles.syncButtonOffline,
                  ]}
                >
                  <SyncIcon
                    color={syncIconColor}
                    isSyncing={syncStatus.isSyncing}
                  />
                  <View
                    style={[
                      styles.syncButtonStatusDot,
                      syncStatus.isOnline
                        ? styles.syncButtonStatusDotOnline
                        : styles.syncButtonStatusDotOffline,
                    ]}
                  />
                </Pressable>
                <Pressable
                  onPress={handleOpenTransactionsPanel}
                  style={styles.iconActionButton}
                >
                  <Text style={styles.iconActionText}>🧾</Text>
                </Pressable>
                <Pressable
                  onPress={() => setIsSettingsPanelOpen(true)}
                  style={styles.iconActionButton}
                >
                  <Text style={styles.iconActionText}>⚙️</Text>
                </Pressable>
              </View>
            </View>
            {/* <Text style={styles.headerDescription}>
              Record sales, build receipts, and keep syncing even when connectivity is unstable.
            </Text> */}
          </View>
        </View>
        <View style={styles.bodyContent}>
          {bootstrapNotice ? (
            <View style={styles.noticeBanner}>
              <Text style={styles.noticeText}>{bootstrapNotice}</Text>
            </View>
          ) : null}

          {bootstrapError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{bootstrapError}</Text>
            </View>
          ) : null}

          {isLoadingBootstrap ? (
            <LoadingScreen
              title="Loading POS catalog"
              description="Fetching your stations, products, and payment methods."
            />
          ) : (
            <>
              <View
                style={[
                  styles.primaryPanels,
                  isTabletOrLarger ? styles.primaryPanelsTablet : null,
                ]}
              >
                <InfoCard
                  style={[
                    styles.catalogCard,
                    isTabletOrLarger ? styles.catalogCardTablet : null,
                  ]}
                >
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionEyebrow}>Product Catalog</Text>
                    {/* <Text style={styles.sectionTitle}>Available Products</Text> */}
                    <Text style={styles.sectionDescription}>
                      Tap a product to select it.
                    </Text>
                  </View>

                  {catalogProducts.length === 0 ? (
                    <View style={styles.emptyCart}>
                      <Text style={styles.emptyCartIcon}>📦</Text>
                      <Text style={styles.emptyCartTitle}>No POS catalog loaded</Text>
                      <Text style={styles.emptyCartDescription}>
                        Connect once to load your assigned stations, products, and payment
                        methods before selling offline.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.productGrid}>
                      {catalogProducts.map((product) => (
                        <Pressable
                          key={product.name}
                          onPress={() => addToCart(product)}
                          style={[
                            styles.productCard,
                            isFuelSalesCashier ? styles.productCardFuelSales : null,
                            isMobilePhone ? styles.productCardPhone : null,
                          ]}
                        >
                          <View
                            style={[
                              styles.productVisualRow,
                              isFuelSalesCashier ? styles.productVisualRowFuelSales : null,
                            ]}
                          >
                            <View
                              style={[
                                styles.productIconWrap,
                                isMobilePhone ? styles.productIconWrapPhone : null,
                              ]}
                            >
                              {product.imageUrl ? (
                                <Image
                                  source={{ uri: product.imageUrl }}
                                  accessibilityLabel={product.imageAlt || product.name}
                                  style={[
                                    styles.productIconImage,
                                    isMobilePhone ? styles.productIconImagePhone : null,
                                  ]}
                                  resizeMode="contain"
                                />
                              ) : (
                                <Text style={styles.productIcon}>{product.icon}</Text>
                              )}
                            </View>
                          </View>
                          <View
                            style={[
                              styles.productCopy,
                              isFuelSalesCashier ? styles.productCopyFuelSales : null,
                            ]}
                          >
                            <Text
                              numberOfLines={2}
                              style={[
                                styles.productName,
                                isFuelSalesCashier ? styles.productNameFuelSales : null,
                                isMobilePhone ? styles.productNamePhone : null,
                              ]}
                            >
                              {product.name}
                            </Text>
                            <Text
                              style={[
                                styles.productPrice,
                                isFuelSalesCashier ? styles.productPriceFuelSales : null,
                                isMobilePhone ? styles.productPricePhone : null,
                              ]}
                            >
                              {formatCurrency(product.price)}
                            </Text>
                            <Text
                              style={[
                                styles.productUnit,
                                isFuelSalesCashier ? styles.productUnitFuelSales : null,
                                isMobilePhone ? styles.productUnitPhone : null,
                              ]}
                            >
                              per {product.unit}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </InfoCard>

                <InfoCard
                  style={[
                    styles.checkoutCard,
                    isMobilePhone ? styles.checkoutCardPhone : null,
                    isTabletOrLarger ? styles.checkoutCardTablet : null,
                  ]}
                >
              {/* <View style={styles.checkoutHeader}>
                <View style={styles.checkoutCopy}>
                  <Text style={styles.checkoutEyebrow}>Checkout</Text>
                  <Text style={styles.checkoutTitle}>Order Summary</Text>
                  <Text style={styles.checkoutDescription}>
                    Review cart lines, adjust quantities, and confirm totals before completing the sale.
                  </Text>
                </View>
                <View style={styles.checkoutBadge}>
                  <Text style={styles.checkoutBadgeText}>🧾</Text>
                </View>
              </View> */}

              {canSelectStation ? (
                <View style={styles.fieldSection}>
                  <Text style={styles.fieldLabel}>Station</Text>
                  <View style={styles.chipRow}>
                    {stations.map((station) => (
                      <Pressable
                        key={station.id}
                        onPress={() => setStationId(station.id)}
                      style={[
                        styles.selectionChip,
                        isMobilePhone ? styles.selectionChipPhone : null,
                        station.id === stationId ? styles.selectionChipActive : null,
                      ]}
                    >
                        <Text
                          style={[
                            styles.selectionChipText,
                            isMobilePhone ? styles.selectionChipTextPhone : null,
                            station.id === stationId ? styles.selectionChipTextActive : null,
                          ]}
                        >
                          {station.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.fieldSection}>
                <Text style={styles.sectionEyebrow}>Sale Summary</Text>
                <Text
                  style={[
                    styles.sectionDescription,
                    isMobilePhone ? styles.sectionDescriptionPhone : null,
                  ]}
                >
                    Select payment, review cart lines, complete sale.
                </Text>
                <View style={styles.chipRow}>
                  {paymentMethods.map((method) => (
                    <Pressable
                      key={method.code}
                      onPress={() => setPaymentMethod(method.code)}
                      style={[
                        styles.selectionChip,
                        isMobilePhone ? styles.selectionChipPhone : null,
                        method.code === paymentMethod ? styles.selectionChipActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.selectionChipText,
                          isMobilePhone ? styles.selectionChipTextPhone : null,
                          method.code === paymentMethod ? styles.selectionChipTextActive : null,
                        ]}
                      >
                        {method.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.inputGrid}>
                <View style={styles.inputBlock}>
                  <Text style={styles.fieldLabel}>Customer Name</Text>
                  <TextInput
                    value={customerName}
                    onChangeText={setCustomerName}
                    editable={!isFuelGiftLocked}
                    placeholder={
                      isCouponPaymentMethod(paymentMethod) ||
                      isCreditPaymentMethod(paymentMethod)
                        ? "Required"
                        : "Optional"
                    }
                    placeholderTextColor={styles.$palette.placeholder}
                    style={[
                      styles.textInput,
                      isMobilePhone ? styles.textInputPhone : null,
                      isFuelGiftLocked ? styles.textInputDisabled : null,
                    ]}
                  />
                </View>
                <View style={styles.inputBlock}>
                  <Text style={styles.fieldLabel}>Phone Number</Text>
                  <TextInput
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                    placeholder={
                      isCouponPaymentMethod(paymentMethod) ||
                      isCreditPaymentMethod(paymentMethod)
                        ? "Required"
                        : "Optional"
                    }
                    placeholderTextColor={styles.$palette.placeholder}
                    keyboardType="phone-pad"
                    style={[
                      styles.textInput,
                      isMobilePhone ? styles.textInputPhone : null,
                    ]}
                  />
                </View>
              </View>

              {isCouponPaymentMethod(paymentMethod) ? (
                <View style={styles.inputGrid}>
                  <View style={styles.inputBlock}>
                    <Text style={styles.fieldLabel}>Coupon Code</Text>
                    <TextInput
                      value={couponCode}
                      onChangeText={setCouponCode}
                      placeholder="Required"
                      placeholderTextColor={styles.$palette.placeholder}
                      style={[
                        styles.textInput,
                        isMobilePhone ? styles.textInputPhone : null,
                      ]}
                    />
                  </View>
                  {hasFuelItemsInCart ? (
                    <View style={styles.inputBlock}>
                      <Text style={styles.fieldLabel}>Vehicle Registration</Text>
                      <TextInput
                        value={vehicleRegistrationNumber}
                        onChangeText={setVehicleRegistrationNumber}
                        placeholder="Required for fuel"
                        placeholderTextColor={styles.$palette.placeholder}
                        style={[
                          styles.textInput,
                          isMobilePhone ? styles.textInputPhone : null,
                        ]}
                      />
                    </View>
                  ) : null}
                  <View style={styles.inputBlock}>
                    <Text style={styles.fieldLabel}>Company / Organization</Text>
                    <TextInput
                      value={companyOrOrganizationName}
                      onChangeText={setCompanyOrOrganizationName}
                      placeholder="Required"
                      placeholderTextColor={styles.$palette.placeholder}
                      style={[
                        styles.textInput,
                        isMobilePhone ? styles.textInputPhone : null,
                      ]}
                    />
                  </View>
                  <View style={styles.inputBlock}>
                    <Text style={styles.fieldLabel}>Note</Text>
                    <TextInput
                      value={paymentNote}
                      onChangeText={setPaymentNote}
                      placeholder="Optional"
                      placeholderTextColor={styles.$palette.placeholder}
                      style={[
                        styles.textInput,
                        isMobilePhone ? styles.textInputPhone : null,
                      ]}
                    />
                  </View>
                </View>
              ) : null}

              {isCreditPaymentMethod(paymentMethod) ? (
                <View style={styles.inputGrid}>
                  <View style={styles.inputBlock}>
                    <Text style={styles.fieldLabel}>Credit Due Date</Text>
                    <Pressable
                      onPress={() => openDatePicker("credit_due_date")}
                      style={[
                        styles.textInput,
                        styles.dateFieldButton,
                        isMobilePhone ? styles.textInputPhone : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dateFieldText,
                          !creditDueDate ? styles.dateFieldPlaceholder : null,
                        ]}
                      >
                        {creditDueDate ? formatDisplayDate(creditDueDate) : "Select due date"}
                      </Text>
                    </Pressable>
                    {creditDueDate ? (
                      <Pressable
                        onPress={() => setCreditDueDate("")}
                        style={styles.dateFieldActionButton}
                      >
                        <Text style={styles.dateFieldActionText}>Clear date</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {hasFuelItemsInCart ? (
                    <View style={styles.inputBlock}>
                      <Text style={styles.fieldLabel}>Vehicle Registration</Text>
                      <TextInput
                        value={vehicleRegistrationNumber}
                        onChangeText={setVehicleRegistrationNumber}
                        placeholder="Required for fuel"
                        placeholderTextColor={styles.$palette.placeholder}
                        style={[
                          styles.textInput,
                          isMobilePhone ? styles.textInputPhone : null,
                        ]}
                      />
                    </View>
                  ) : null}
                  <View style={styles.inputBlock}>
                    <Text style={styles.fieldLabel}>Billable To</Text>
                    <TextInput
                      value={billableTo}
                      onChangeText={setBillableTo}
                      placeholder="Required"
                      placeholderTextColor={styles.$palette.placeholder}
                      style={[
                        styles.textInput,
                        isMobilePhone ? styles.textInputPhone : null,
                      ]}
                    />
                  </View>
                  <View style={styles.inputBlock}>
                    <Text style={styles.fieldLabel}>Note</Text>
                    <TextInput
                      value={paymentNote}
                      onChangeText={setPaymentNote}
                      placeholder="Optional"
                      placeholderTextColor={styles.$palette.placeholder}
                      style={[
                        styles.textInput,
                        isMobilePhone ? styles.textInputPhone : null,
                      ]}
                    />
                  </View>
                </View>
              ) : null}

              {isBulkRedeemPaymentMethod(paymentMethod) ? (
                <View style={styles.inputGrid}>
                  <View style={styles.inputBlock}>
                    <Text style={styles.fieldLabel}>Bulk Reference</Text>
                    <TextInput
                      value={bulkReferenceCode}
                      onChangeText={setBulkReferenceCode}
                      placeholder="Required"
                      placeholderTextColor={styles.$palette.placeholder}
                      style={[
                        styles.textInput,
                        isMobilePhone ? styles.textInputPhone : null,
                      ]}
                    />
                  </View>
                  <View style={styles.inputBlock}>
                    <Text style={styles.fieldLabel}>Note</Text>
                    <TextInput
                      value={paymentNote}
                      onChangeText={setPaymentNote}
                      placeholder="Optional"
                      placeholderTextColor={styles.$palette.placeholder}
                      style={[
                        styles.textInput,
                        isMobilePhone ? styles.textInputPhone : null,
                      ]}
                    />
                  </View>
                </View>
              ) : null}

              {isFuelGiftPaymentMethod(paymentMethod) ? (
                <View style={styles.inputGrid}>
                  <View style={styles.inputBlock}>
                    <Text style={styles.fieldLabel}>Fuel Gift Code</Text>
                    <TextInput
                      value={fuelGiftCode}
                      onChangeText={(value) => {
                        setFuelGiftCode(value.toUpperCase());
                        setCart([]);
                        setCustomerName("");
                        setCustomerPhone("");
                        setAppliedFuelGift(null);
                      }}
                      placeholder="Required"
                      placeholderTextColor={styles.$palette.placeholder}
                      autoCapitalize="characters"
                      style={[
                        styles.textInput,
                        isMobilePhone ? styles.textInputPhone : null,
                      ]}
                    />
                  </View>
                  <View style={styles.inputBlock}>
                    <Text style={styles.fieldLabel}>Note</Text>
                    <TextInput
                      value={paymentNote}
                      onChangeText={setPaymentNote}
                      placeholder="Optional"
                      placeholderTextColor={styles.$palette.placeholder}
                      style={[
                        styles.textInput,
                        isMobilePhone ? styles.textInputPhone : null,
                      ]}
                    />
                  </View>
                  <View style={styles.inlineActionRow}>
                    <Pressable
                      onPress={() => void handleApplyFuelGiftCode()}
                      disabled={isApplyingFuelGift || !normalizedFuelGiftCode}
                      style={[
                        styles.inlinePrimaryButton,
                        isApplyingFuelGift || !normalizedFuelGiftCode
                          ? styles.primaryButtonDisabled
                          : null,
                      ]}
                    >
                      <Text style={styles.inlinePrimaryButtonText}>
                        {isApplyingFuelGift ? "Applying..." : "Apply Gift Code"}
                      </Text>
                    </Pressable>
                    {appliedFuelGift ? (
                      <Pressable
                        onPress={handleClearFuelGift}
                        style={styles.inlineSecondaryButton}
                      >
                        <Text style={styles.inlineSecondaryButtonText}>Clear Gift</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {appliedFuelGift ? (
                    <View style={styles.appliedGiftCard}>
                      <Text style={styles.appliedGiftTitle}>
                        Gift ready: {appliedFuelGift.productName} ·{" "}
                        {formatCurrency(appliedFuelGift.amount)}
                      </Text>
                      <Text style={styles.appliedGiftMeta}>
                        Recipient: {appliedFuelGift.recipientName || "Recipient"} · Code:{" "}
                        {appliedFuelGift.code}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.infoHintCard}>
                    <Text style={styles.infoHintText}>
                      Fuel gift redemptions must match the assigned fuel product and the exact gift value.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* <View style={styles.inputBlock}>
                <Text style={styles.fieldLabel}>Cashier</Text>
                <TextInput
                  value={cashierName}
                  onChangeText={setCashierName}
                  editable={!isCashierLocked}
                  placeholderTextColor={styles.$palette.placeholder}
                  style={[
                    styles.textInput,
                    isCashierLocked ? styles.textInputDisabled : null,
                  ]}
                />
              </View> */}

              {cart.length === 0 ? (
                <View style={[styles.emptyCart, isMobilePhone ? styles.emptyCartPhone : null]}>
                  <Text
                    style={[
                      styles.emptyCartIcon,
                      isMobilePhone ? styles.emptyCartIconPhone : null,
                    ]}
                  >
                    {checkoutEmptyStateIcon}
                  </Text>
                  <Text
                    style={[
                      styles.emptyCartTitle,
                      isMobilePhone ? styles.emptyCartTitlePhone : null,
                    ]}
                  >
                    No products added
                  </Text>
                  <Text
                    style={[
                      styles.emptyCartDescription,
                      isMobilePhone ? styles.emptyCartDescriptionPhone : null,
                    ]}
                  >
                    Add items from the product catalog to build a sale.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.cartList}>
                    {cart.map((item) => (
                      <View
                        key={item.name}
                        style={[styles.cartItem, isMobilePhone ? styles.cartItemPhone : null]}
                      >
                        <View style={styles.cartItemHeader}>
                          <View style={styles.cartItemCopy}>
                            <Text
                              style={[
                                styles.cartItemName,
                                isMobilePhone ? styles.cartItemNamePhone : null,
                              ]}
                            >
                              {item.name}
                            </Text>
                            <Text
                              style={[
                                styles.cartItemMeta,
                                isMobilePhone ? styles.cartItemMetaPhone : null,
                              ]}
                            >
                              {formatCurrency(item.price)} per {item.unit}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => removeFromCart(item.name)}
                            style={styles.removeChip}
                          >
                            <Text style={styles.removeChipText}>✕</Text>
                          </Pressable>
                        </View>

                        <View style={styles.cartItemRow}>
                          {isFuelCategory(item.category) ? (
                            <View>
                              <Text style={styles.fieldLabel}>Amount</Text>
                              <TextInput
                                value={item.amountInput ?? ""}
                                onChangeText={(value) => updateFuelAmount(item.name, value)}
                                keyboardType="numeric"
                                style={[
                                  styles.textInput,
                                  isMobilePhone ? styles.textInputPhone : null,
                                  styles.smallInput,
                                  isMobilePhone ? styles.smallInputPhone : null,
                                  styles.textInputFuel,
                                ]}
                                placeholderTextColor={styles.$palette.placeholder}
                              />
                              <Text
                                style={[
                                  styles.helperLabel,
                                  isMobilePhone ? styles.helperLabelPhone : null,
                                  styles.helperLabelInput,
                                  isMobilePhone ? styles.helperLabelInputPhone : null,
                                ]}
                              >
                                {formatFuelQuantity(
                                  getFuelQuantityFromAmount(
                                    item.amountInput ?? item.amount,
                                    item.price,
                                  ),
                                )}{" "}
                                litres
                              </Text>
                            </View>
                          ) : (
                            <View>
                              <Text style={styles.fieldLabel}>Qty</Text>
                              <TextInput
                                value={String(item.qty)}
                                onChangeText={(value) =>
                                  updateQty(item.name, Number.parseInt(value, 10))
                                }
                                keyboardType="numeric"
                                style={[
                                  styles.textInput,
                                  isMobilePhone ? styles.textInputPhone : null,
                                  styles.smallInput,
                                  isMobilePhone ? styles.smallInputPhone : null,
                                ]}
                                placeholderTextColor={styles.$palette.placeholder}
                              />
                            </View>
                          )}
                          <View style={styles.lineTotalWrap}>
                            <Text
                              style={[
                                styles.lineTotalLabel,
                                isMobilePhone ? styles.lineTotalLabelPhone : null,
                              ]}
                            >
                              Line Total
                            </Text>
                            <Text
                              style={[
                                styles.lineTotalValue,
                                isMobilePhone ? styles.lineTotalValuePhone : null,
                              ]}
                            >
                              {formatCurrency(getCartItemLineTotal(item))}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>

                  <View
                    style={[styles.totalPanel, isMobilePhone ? styles.totalPanelPhone : null]}
                  >
                    <View style={styles.totalRow}>
                      <Text
                        style={[
                          styles.totalLabel,
                          isMobilePhone ? styles.totalLabelPhone : null,
                        ]}
                      >
                        Subtotal
                      </Text>
                      <Text
                        style={[
                          styles.totalValueSmall,
                          isMobilePhone ? styles.totalValueSmallPhone : null,
                        ]}
                      >
                        {formatCurrency(subtotal)}
                      </Text>
                    </View>
                    <View style={styles.totalDivider} />
                    <View style={styles.totalRow}>
                      <Text
                        style={[
                          styles.totalLabelStrong,
                          isMobilePhone ? styles.totalLabelPhone : null,
                        ]}
                      >
                        Total
                      </Text>
                      <Text
                        style={[
                          styles.totalValue,
                          isMobilePhone ? styles.totalValuePhone : null,
                        ]}
                      >
                        {formatCurrency(total)}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.printRow, isMobilePhone ? styles.printRowPhone : null]}>
                    <Text
                      style={[
                        styles.printLabel,
                        isMobilePhone ? styles.printLabelPhone : null,
                      ]}
                    >
                      Print receipt after sale
                    </Text>
                    <Switch
                      value={shouldPrintReceipt}
                      onValueChange={setShouldPrintReceipt}
                      trackColor={{ false: palette.switchTrackOff, true: palette.primary }}
                      thumbColor={palette.switchThumb}
                    />
                  </View>

                  <Text
                    style={[
                      styles.offlineHint,
                      isMobilePhone ? styles.offlineHintPhone : null,
                    ]}
                  >
                    {syncStatus.isOnline
                      ? "POS is online. Sales sync immediately when the request succeeds."
                      : "POS is offline. Sales save on this device first and sync automatically later."}
                  </Text>

                  <Pressable
                    onPress={handleCompleteSale}
                    disabled={
                      isSubmitting ||
                      cart.length === 0 ||
                      !stationId ||
                      !paymentMethod ||
                      !isPaymentContextValid
                    }
                    style={[
                      styles.primaryButton,
                      isMobilePhone ? styles.primaryButtonPhone : null,
                      isSubmitting ||
                      cart.length === 0 ||
                      !stationId ||
                      !paymentMethod ||
                      !isPaymentContextValid
                        ? styles.primaryButtonDisabled
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.primaryButtonText,
                        isMobilePhone ? styles.primaryButtonTextPhone : null,
                      ]}
                    >
                      {isSubmitting ? "Saving..." : "Complete Sale"}
                    </Text>
                  </Pressable>
                </>
              )}
                </InfoCard>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={isSettingsPanelOpen}
        animationType="slide"
        onRequestClose={() => setIsSettingsPanelOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <Text style={styles.modalTitle}>POS Settings</Text>
                {/* <Text style={styles.modalDescription}>
                  Cashier session details and account actions.
                </Text> */}
              </View>
              <Pressable
                onPress={() => setIsSettingsPanelOpen(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.settingsModalBody}
              contentContainerStyle={styles.settingsModalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.settingsList}>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsLabel}>Cashier</Text>
                  <Text style={styles.settingsValue}>{currentCashierName}</Text>
                </View>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsLabel}>Station</Text>
                  <Text style={styles.settingsValue}>{currentStationName}</Text>
                </View>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsLabel}>Role</Text>
                  <Text style={styles.settingsValue}>{session.roleName}</Text>
                </View>
                <View style={styles.settingsItem}>
                  <View style={styles.settingsToggleRow}>
                    <View style={styles.settingsToggleCopy}>
                      <Text style={styles.settingsLabel}>Appearance</Text>
                      <Text style={styles.settingsValue}>
                        {mode === "dark" ? "Dark mode" : "Light mode"}
                      </Text>
                    </View>
                    <Switch
                      value={isDark}
                      onValueChange={toggleMode}
                      trackColor={{ false: palette.switchTrackOff, true: palette.primary }}
                      thumbColor={palette.switchThumb}
                    />
                  </View>
                </View>
              </View>

              <Pressable
                onPress={() => {
                  setIsSettingsPanelOpen(false);
                  void signOut();
                }}
                style={styles.signOutButton}
              >
                <Text style={styles.signOutButtonText}>Sign out</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={isTransactionsPanelOpen}
        animationType="slide"
        onRequestClose={() => setIsTransactionsPanelOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <Text style={styles.modalTitle}>Today&apos;s Transactions</Text>
                <Text style={styles.modalDescription}>
                  Sales summary and transaction lines for the day.
                </Text>
              </View>
              <Pressable
                onPress={() => setIsTransactionsPanelOpen(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.settingsModalBody}
              contentContainerStyle={styles.settingsModalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.settingsSection}>
                <View style={styles.settingsSectionHeader}>
                  <Text style={styles.settingsSectionTitle}>
                    {currentCashierName}
                  </Text>
                  <Text style={styles.settingsSectionMeta}>
                    {formatDisplayDate(cashierDaySummary.date || todayDate)}
                  </Text>
                </View>

                {isLoadingCashierDaySummary ? (
                  <Text style={styles.settingsSectionHint}>
                    Loading transactions…
                  </Text>
                ) : cashierDaySummaryError ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{cashierDaySummaryError}</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.settingsSummaryRow}>
                      <View style={styles.settingsSummaryCard}>
                        <Text style={styles.settingsSummaryLabel}>Total Sales</Text>
                        <Text style={styles.settingsSummaryValue}>
                          {formatCurrency(cashierDaySummary.totalAmount)}
                        </Text>
                      </View>
                      <View style={styles.settingsSummaryCard}>
                        <Text style={styles.settingsSummaryLabel}>Transactions</Text>
                        <Text style={styles.settingsSummaryValue}>
                          {cashierDaySummary.totalTransactions.toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    {cashierDaySummary.records.length === 0 ? (
                      <Text style={styles.settingsSectionHint}>
                        No cashier transactions recorded today.
                      </Text>
                    ) : (
                      <>
                        <View style={styles.settingsTransactionsList}>
                          {cashierDaySummary.records.map((record) => (
                            <View key={record.id} style={styles.settingsTransactionItem}>
                              <View style={styles.settingsTransactionTop}>
                                <View style={styles.settingsTransactionCopy}>
                                  <Text style={styles.settingsTransactionTitle}>
                                    {record.itemSummary || record.receiptNumber || "Transaction"}
                                  </Text>
                                  <Text style={styles.settingsTransactionMeta}>
                                    {formatTimeOnly(record.saleDate)} ·{" "}
                                    {Number(record.itemCount || 0).toLocaleString()} item
                                    {Number(record.itemCount || 0) === 1 ? "" : "s"} ·{" "}
                                    {record.paymentMethod || "Payment"}
                                  </Text>
                                  {record.customerName || record.customerPhone ? (
                                    <Text style={styles.settingsTransactionMeta}>
                                      {record.customerName || "Walk-in Customer"}
                                      {record.customerPhone ? ` · ${record.customerPhone}` : ""}
                                    </Text>
                                  ) : null}
                                  {record.receiptNumber ? (
                                    <Text style={styles.settingsTransactionMeta}>
                                      {record.receiptNumber}
                                    </Text>
                                  ) : null}
                                </View>
                                <View style={styles.settingsTransactionRight}>
                                  <Text style={styles.settingsTransactionAmount}>
                                    {formatCurrency(record.amount)}
                                  </Text>
                                  {canReverseTransactions ? (
                                    <Pressable
                                      onPress={() => handleReverseTransaction(record)}
                                      disabled={
                                        reversingReceiptNumber === record.receiptNumber ||
                                        pendingReversalReceiptIds.has(
                                          `${record.receiptNumber || ""}`.trim(),
                                        )
                                      }
                                      style={[
                                        styles.transactionActionButton,
                                        reversingReceiptNumber === record.receiptNumber ||
                                        pendingReversalReceiptIds.has(
                                          `${record.receiptNumber || ""}`.trim(),
                                        )
                                          ? styles.transactionActionButtonDisabled
                                          : null,
                                      ]}
                                    >
                                      <Text style={styles.transactionActionButtonText}>
                                        {pendingReversalReceiptIds.has(
                                          `${record.receiptNumber || ""}`.trim(),
                                        )
                                          ? "Queued"
                                          : reversingReceiptNumber === record.receiptNumber
                                            ? "Reversing..."
                                            : "Reverse"}
                                      </Text>
                                    </Pressable>
                                  ) : null}
                                </View>
                              </View>
                            </View>
                          ))}
                        </View>

                        <View style={styles.paginationRow}>
                          <Pressable
                            onPress={handlePreviousTransactionsPage}
                            disabled={transactionsCursorHistory.length === 0}
                            style={[
                              styles.paginationButton,
                              transactionsCursorHistory.length === 0
                                ? styles.paginationButtonDisabled
                                : null,
                            ]}
                          >
                            <Text style={styles.paginationButtonText}>Previous</Text>
                          </Pressable>
                          <Text style={styles.paginationMeta}>
                            Page {transactionsPage} · {transactionRangeStart}-{transactionRangeEnd} of{" "}
                            {cashierDaySummary.totalTransactions.toLocaleString()}
                          </Text>
                          <Pressable
                            onPress={handleNextTransactionsPage}
                            disabled={!cashierDaySummary.hasMore || !cashierDaySummary.nextCursor}
                            style={[
                              styles.paginationButton,
                              !cashierDaySummary.hasMore || !cashierDaySummary.nextCursor
                                ? styles.paginationButtonDisabled
                                : null,
                            ]}
                          >
                            <Text style={styles.paginationButtonText}>Next</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={isSyncPanelOpen}
        animationType="slide"
        onRequestClose={() => setIsSyncPanelOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <Text style={styles.modalTitle}>POS Sync Queue</Text>
                <Text style={styles.modalDescription}>
                  Pending sales are stored locally first and synced to the HQ system when possible.
                </Text>
              </View>
              <Pressable
                onPress={() => setIsSyncPanelOpen(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.syncStatsRow}>
              <Text style={styles.syncStatText}>
                {syncPanel.queuedSales.length} queued · Last synced {formatLastSyncedAt(syncStatus.lastSyncedAt)}
              </Text>
              <Text
                style={[
                  styles.syncStatBadge,
                  syncStatus.isOnline ? styles.syncStatOnline : styles.syncStatOffline,
                ]}
              >
                {syncStatus.isOnline ? "Online" : "Offline"}
              </Text>
            </View>

            <View style={styles.modalActionRow}>
              <Pressable onPress={handleRetrySync} style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>Retry Sync</Text>
              </Pressable>
              <Pressable
                onPress={handleClearResolvedEntries}
                style={styles.secondaryAction}
              >
                <Text style={styles.secondaryActionText}>Clear Synced</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {syncPanel.queuedSales.length === 0 ? (
                <Text style={styles.emptySyncText}>No queued items.</Text>
              ) : (
                syncPanel.queuedSales.map((entry) => {
                  const entryStatus = `${entry?.status || ""}`.trim().toLowerCase();
                  const isFlaggedForReview = entryStatus === "needs_review";

                  return (
                    <View key={entry.id} style={styles.syncEntry}>
                      <View style={styles.syncEntryTop}>
                        <Text style={styles.syncEntryTitle}>
                          {getQueuedEntryTypeLabel(entry)} ·{" "}
                          {entry.stationName || "Unknown Station"} · {formatCurrency(entry.amount)}
                        </Text>
                        <Pressable
                          disabled={isFlaggedForReview}
                          onPress={() => void handleFlagQueuedSale(entry.id)}
                        >
                          <Text
                            style={[
                              styles.syncReviewAction,
                              isFlaggedForReview ? styles.syncReviewActionDisabled : null,
                            ]}
                          >
                            {isFlaggedForReview ? "Flagged" : "Flag issue"}
                          </Text>
                        </Pressable>
                      </View>
                      <Text style={styles.syncEntryMeta}>
                        {entry.cashierName || "POS Counter"} · {formatLastSyncedAt(entry.saleDate || entry.queuedAt)}
                      </Text>
                      {entry.receiptNumber ? (
                        <Text style={styles.syncEntryMeta}>{entry.receiptNumber}</Text>
                      ) : null}
                      <Text style={styles.syncEntryStatus}>
                        Status: {entry.status}
                        {entry.lastAttemptAt
                          ? ` · Last attempt ${formatLastSyncedAt(entry.lastAttemptAt)}`
                          : ""}
                      </Text>
                      {entry.lastError ? (
                        <Text style={styles.syncEntryError}>{entry.lastError}</Text>
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {Platform.OS === "android" && activeDatePicker ? (
        <DateTimePicker
          value={datePickerValue}
          mode="date"
          display="default"
          onChange={handleNativeDateChange}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal
          visible={Boolean(activeDatePicker)}
          transparent
          animationType="slide"
          onRequestClose={closeDatePicker}
        >
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={closeDatePicker} />
            <View style={styles.datePickerCard}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>Select date</Text>
                <View style={styles.datePickerActions}>
                  <Pressable
                    onPress={clearCurrentDatePickerValue}
                    style={styles.datePickerActionButton}
                  >
                    <Text style={styles.datePickerActionText}>Clear</Text>
                  </Pressable>
                  <Pressable
                    onPress={applyCurrentDatePickerValue}
                    style={styles.datePickerActionButton}
                  >
                    <Text style={styles.datePickerActionText}>Done</Text>
                  </Pressable>
                </View>
              </View>
              <DateTimePicker
                value={datePickerValue}
                mode="date"
                display="spinner"
                onChange={handleNativeDateChange}
                style={styles.datePicker}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const createStyles = (palette) => {
  const styles = StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.background,
    },
    scrollContent: {
      paddingBottom: 32,
    },
    stickyHeaderContainer: {
      paddingHorizontal: 0,
      paddingTop: 30,
      paddingBottom: 0,
      backgroundColor: palette.background,
    },
    bodyContent: {
      paddingHorizontal: 18,
      paddingTop: 16,
      gap: 16,
    },
    primaryPanels: {
      gap: 16,
    },
    primaryPanelsTablet: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    headerCard: {
      paddingHorizontal: 18,
      paddingTop: 24,
      paddingBottom: 14,
      backgroundColor: palette.surface,
      borderBottomWidth: 0.6,
      borderBottomColor: palette.border,
      gap: 10,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    headerCopy: {
      flex: 1,
      gap: 2,
    },
    headerEyebrow: {
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 2,
      textTransform: "uppercase",
      color: palette.accent,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: palette.text,
    },
    headerDescription: {
      fontSize: 12,
      lineHeight: 18,
      color: palette.mutedText,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    syncButton: {
      width: 48,
      height: 48,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    syncButtonOnline: {
      borderColor: "#86efac",
      backgroundColor: palette.mode === "dark" ? "#052e16" : "#f0fdf4",
    },
    syncButtonOffline: {
      borderColor: "#fcd34d",
      backgroundColor: palette.mode === "dark" ? "#422006" : "#fffbeb",
    },
    syncButtonStatusDot: {
      position: "absolute",
      top: 9,
      right: 9,
      width: 9,
      height: 9,
      borderRadius: 999,
      borderWidth: 2,
      borderColor: palette.surface,
    },
    syncButtonStatusDotOnline: {
      backgroundColor: palette.success,
    },
    syncButtonStatusDotOffline: {
      backgroundColor: palette.warning,
    },
    iconActionButton: {
      width: 48,
      height: 48,
      borderRadius: 999,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    iconActionText: {
      fontSize: 18,
    },
    settingsModalBody: {
      maxHeight: 520,
    },
    settingsModalBodyContent: {
      gap: 16,
      paddingBottom: 4,
    },
    settingsList: {
      gap: 12,
    },
    settingsItem: {
      borderRadius: 18,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
    },
    settingsToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    settingsToggleCopy: {
      flex: 1,
      gap: 6,
    },
    settingsLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: palette.mutedText,
    },
    settingsValue: {
      fontSize: 14,
      color: palette.text,
      fontWeight: "700",
    },
    settingsSection: {
      gap: 12,
    },
    settingsSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    settingsSectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: palette.text,
    },
    settingsSectionMeta: {
      fontSize: 12,
      color: palette.mutedText,
    },
    settingsSectionHint: {
      fontSize: 13,
      lineHeight: 20,
      color: palette.mutedText,
    },
    settingsSummaryRow: {
      flexDirection: "row",
      gap: 10,
    },
    settingsSummaryCard: {
      flex: 1,
      borderRadius: 18,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
    },
    settingsSummaryLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: palette.mutedText,
    },
    settingsSummaryValue: {
      fontSize: 18,
      fontWeight: "800",
      color: palette.text,
    },
    settingsTransactionsList: {
      gap: 8,
    },
    settingsTransactionItem: {
      borderRadius: 16,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 4,
      gap: 2,
    },
    settingsTransactionTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 8,
    },
    settingsTransactionCopy: {
      flex: 1,
      gap: 2,
    },
    settingsTransactionRight: {
      alignItems: "flex-end",
      gap: 6,
    },
    settingsTransactionTitle: {
      fontSize: 10,
      fontWeight: "700",
      color: palette.text,
    },
    settingsTransactionAmount: {
      fontSize: 10,
      fontWeight: "800",
      color: palette.text,
    },
    settingsTransactionMeta: {
      fontSize: 10,
      lineHeight: 16,
      color: palette.mutedText,
    },
    transactionActionButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.mode === "dark" ? "#fb7185" : "#fda4af",
      backgroundColor: palette.mode === "dark" ? "#3f0d12" : "#fff1f2",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    transactionActionButtonDisabled: {
      opacity: 0.55,
    },
    transactionActionButtonText: {
      fontSize: 11,
      fontWeight: "700",
      color: palette.mode === "dark" ? "#fecdd3" : "#be123c",
    },
    paginationRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    paginationButton: {
      minWidth: 84,
      borderRadius: 14,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    paginationButtonDisabled: {
      opacity: 0.45,
    },
    paginationButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: palette.text,
    },
    paginationMeta: {
      flex: 1,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
      color: palette.mutedText,
    },
    signOutButton: {
      borderRadius: 18,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.primary,
    },
    signOutButtonText: {
      fontSize: 15,
      fontWeight: "700",
      color: "#ffffff",
    },
    noticeBanner: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: palette.primaryMuted,
      borderWidth: 1,
      borderColor: palette.primaryBorder,
    },
    noticeText: {
      fontSize: 12,
      lineHeight: 18,
      color: palette.text,
    },
    errorBanner: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: palette.mode === "dark" ? "#3f0d1b" : "#fff1f2",
      borderWidth: 1,
      borderColor: "#fecdd3",
    },
    errorText: {
      fontSize: 12,
      lineHeight: 18,
      color: palette.mode === "dark" ? "#fecdd3" : "#be123c",
    },
    toast: {
      position: "absolute",
      top: 48,
      right: 16,
      left: 16,
      zIndex: 20,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
    },
    toastSuccess: {
      borderColor: "#bbf7d0",
      backgroundColor: palette.mode === "dark" ? "#052e16" : "#f0fdf4",
    },
    toastWarning: {
      borderColor: "#fde68a",
      backgroundColor: palette.mode === "dark" ? "#422006" : "#fffbeb",
    },
    toastError: {
      borderColor: "#fecdd3",
      backgroundColor: palette.mode === "dark" ? "#3f0d1b" : "#fff1f2",
    },
    toastText: {
      fontSize: 13,
      lineHeight: 20,
      color: palette.text,
    },
    catalogCard: {
      gap: 16,
    },
    catalogCardTablet: {
      flex: 5,
    },
    sectionHeader: {
      gap: 6,
    },
    sectionEyebrow: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: palette.accent,
    },
    sectionTitle: {
      fontSize: 23,
      fontWeight: "700",
      color: palette.text,
    },
    sectionDescription: {
      fontSize: 13,
      lineHeight: 20,
      color: palette.mutedText,
    },
    sectionDescriptionPhone: {
      fontSize: 12,
      lineHeight: 18,
    },
    productGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      justifyContent: "space-between",
    },
    productCard: {
      width: "47.5%",
      minWidth: 0,
      borderRadius: 20,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      padding: 12,
      gap: 12,
    },
    productCardFuelSales: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    productCardPhone: {
      borderRadius: 16,
      paddingHorizontal: 8,
      paddingVertical: 9,
      gap: 7,
    },
    productVisualRow: {
      alignItems: "center",
    },
    productVisualRowFuelSales: {
      alignItems: "flex-start",
      justifyContent: "center",
    },
    productCopy: {
      gap: 3,
      alignItems: "center",
    },
    productCopyFuelSales: {
      flex: 1,
      gap: 2,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    productName: {
      fontSize: 20,
      fontWeight: "600",
      color: palette.text,
      textAlign: "center",
    },
    productNameFuelSales: {
      textAlign: "left",
    },
    productNamePhone: {
      fontSize: 13,
      lineHeight: 18,
    },
    productUnit: {
      fontSize: 18,
      color: palette.mutedText,
      textAlign: "center",
    },
    productUnitFuelSales: {
      textAlign: "left",
    },
    productUnitPhone: {
      fontSize: 9,
      lineHeight: 15,
    },
    productIconWrap: {
      width: 98,
      height: 98,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.primaryMuted,
    },
    productIconWrapPhone: {
      width: 68,
      height: 68,
      borderRadius: 15,
    },
    productIcon: {
      fontSize: 18,
    },
    productIconImage: {
      width: 78,
      height: 78,
    },
    productIconImagePhone: {
      width: 52,
      height: 52,
    },
    productPrice: {
      fontSize: 18,
      fontWeight: "600",
      color: palette.text,
      textAlign: "center",
    },
    productPriceFuelSales: {
      textAlign: "left",
    },
    productPricePhone: {
      fontSize: 10,
      lineHeight: 17,
    },
    checkoutCard: {
      gap: 16,
      backgroundColor: palette.surface,
    },
    checkoutCardPhone: {
      gap: 14,
    },
    checkoutCardTablet: {
      flex: 5,
    },
    checkoutHeader: {
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 18,
      backgroundColor: palette.mode === "dark" ? "#020617" : "#0f172a",
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    checkoutCopy: {
      flex: 1,
      gap: 6,
    },
    checkoutEyebrow: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: "#bae6fd",
    },
    checkoutTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: "#f8fafc",
    },
    checkoutDescription: {
      fontSize: 12,
      lineHeight: 18,
      color: "#cbd5e1",
    },
    checkoutBadge: {
      width: 42,
      height: 42,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    checkoutBadgeText: {
      fontSize: 22,
    },
    fieldSection: {
      gap: 10,
    },
    fieldLabel: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: palette.mutedText,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    selectionChip: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
    },
    selectionChipPhone: {
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    selectionChipActive: {
      borderColor: palette.primaryBorder,
      backgroundColor: palette.primaryMuted,
    },
    selectionChipText: {
      fontSize: 12,
      fontWeight: "700",
      color: palette.text,
    },
    selectionChipTextPhone: {
      fontSize: 11,
    },
    selectionChipTextActive: {
      color: palette.text,
    },
    inputGrid: {
      gap: 12,
    },
    inputBlock: {
      gap: 8,
    },
    infoHintCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.primaryBorder,
      backgroundColor: palette.primaryMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    infoHintText: {
      fontSize: 12,
      lineHeight: 18,
      color: palette.primary,
    },
    inlineActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    inlinePrimaryButton: {
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.primary,
    },
    inlinePrimaryButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#ffffff",
    },
    inlineSecondaryButton: {
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    inlineSecondaryButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: palette.text,
    },
    appliedGiftCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.success,
      backgroundColor:
        palette.mode === "dark" ? "rgba(34, 197, 94, 0.12)" : "#ecfdf5",
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
    },
    appliedGiftTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: palette.success,
    },
    appliedGiftMeta: {
      fontSize: 12,
      lineHeight: 18,
      color: palette.success,
    },
    textInput: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.inputBorder,
      backgroundColor: palette.inputBackground,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 14,
      color: palette.text,
    },
    dateFieldButton: {
      justifyContent: "center",
    },
    dateFieldText: {
      fontSize: 14,
      color: palette.text,
    },
    dateFieldPlaceholder: {
      color: palette.placeholder,
    },
    dateFieldActionButton: {
      alignSelf: "flex-start",
      marginTop: 4,
    },
    dateFieldActionText: {
      fontSize: 11,
      fontWeight: "700",
      color: palette.accent,
    },
    textInputPhone: {
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 13,
    },
    textInputFuel: {
      fontSize: 18,
      fontWeight: '600',
    },
    textInputDisabled: {
      opacity: 0.65,
    },
    emptyCart: {
      borderRadius: 24,
      borderWidth: 0.6,
      borderStyle: "dashed",
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 20,
      paddingVertical: 28,
      alignItems: "center",
      gap: 10,
    },
    emptyCartPhone: {
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 22,
      gap: 8,
    },
    emptyCartIcon: {
      fontSize: 28,
    },
    emptyCartIconPhone: {
      fontSize: 24,
    },
    emptyCartTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: palette.text,
    },
    emptyCartTitlePhone: {
      fontSize: 16,
    },
    emptyCartDescription: {
      textAlign: "center",
      fontSize: 13,
      lineHeight: 20,
      color: palette.mutedText,
    },
    emptyCartDescriptionPhone: {
      fontSize: 12,
      lineHeight: 18,
    },
    cartList: {
      gap: 10,
    },
    cartItem: {
      borderRadius: 22,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      padding: 14,
      gap: 12,
    },
    cartItemPhone: {
      borderRadius: 18,
      padding: 12,
      gap: 10,
    },
    cartItemHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    cartItemCopy: {
      flex: 1,
      gap: 3,
    },
    cartItemName: {
      fontSize: 13,
      fontWeight: "700",
      color: palette.text,
    },
    cartItemNamePhone: {
      fontSize: 12,
    },
    cartItemMeta: {
      fontSize: 11,
      color: palette.mutedText,
    },
    cartItemMetaPhone: {
      fontSize: 10,
    },
    removeChip: {
      borderRadius: 999,
      backgroundColor: palette.surface,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    removeChipText: {
      fontSize: 12,
      color: palette.text,
    },
    cartItemRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12,
    },
    smallInput: {
      minWidth: 100,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginTop: 4,
    },
    smallInputPhone: {
      minWidth: 88,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginTop: 2,
    },
    helperLabel: {
      marginTop: 6,
      fontSize: 11,
      color: palette.mutedText,
    },
    helperLabelPhone: {
      marginTop: 4,
      fontSize: 10,
    },
    helperLabelInput: {
      fontSize: 14,
      fontWeight: "700",
    },
    helperLabelInputPhone: {
      fontSize: 12,
    },
    lineTotalWrap: {
      alignItems: "flex-end",
      gap: 4,
    },
    lineTotalLabel: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: palette.mutedText,
    },
    lineTotalLabelPhone: {
      fontSize: 9,
      letterSpacing: 0.8,
    },
    lineTotalValue: {
      fontSize: 15,
      fontWeight: "700",
      color: palette.text,
    },
    lineTotalValuePhone: {
      fontSize: 13,
    },
    totalPanel: {
      borderRadius: 24,
      borderWidth: 0.6,
      borderColor: palette.border,
      padding: 16,
      backgroundColor: palette.mode === "dark" ? "#020617" : palette.surfaceMuted,
      gap: 12,
    },
    totalPanelPhone: {
      borderRadius: 20,
      padding: 14,
      gap: 10,
    },
    totalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    totalDivider: {
      height: 1,
      backgroundColor: palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    },
    totalLabel: {
      fontSize: 12,
      color: palette.text,
    },
    totalLabelPhone: {
      fontSize: 11,
    },
    totalLabelStrong: {
      fontSize: 12,
      fontWeight: "700",
      color: palette.mutedText,
    },
    totalValueSmall: {
      fontSize: 12,
      color: palette.text,
      fontWeight: "700",
    },
    totalValueSmallPhone: {
      fontSize: 11,
    },
    totalValue: {
      fontSize: 24,
      fontWeight: "800",
      color: palette.mutedText,
    },
    totalValuePhone: {
      fontSize: 20,
    },
    printRow: {
      borderRadius: 18,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    printRowPhone: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    printLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: palette.text,
    },
    printLabelPhone: {
      fontSize: 12,
    },
    offlineHint: {
      fontSize: 12,
      lineHeight: 18,
      color: palette.mutedText,
    },
    offlineHintPhone: {
      fontSize: 11,
      lineHeight: 16,
    },
    primaryButton: {
      borderRadius: 18,
      paddingVertical: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.primary,
    },
    primaryButtonPhone: {
      borderRadius: 16,
      paddingVertical: 13,
    },
    primaryButtonDisabled: {
      opacity: 0.55,
    },
    primaryButtonText: {
      fontSize: 15,
      fontWeight: "700",
      color: "#ffffff",
    },
    primaryButtonTextPhone: {
      fontSize: 14,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(2, 6, 23, 0.75)",
      justifyContent: "flex-end",
    },
    sheetOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(2, 6, 23, 0.35)",
    },
    sheetBackdrop: {
      flex: 1,
    },
    datePickerCard: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 24,
      backgroundColor: palette.surface,
      gap: 14,
    },
    datePickerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    datePickerTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: palette.text,
    },
    datePickerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    datePickerActionButton: {
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    datePickerActionText: {
      fontSize: 13,
      fontWeight: "700",
      color: palette.accent,
    },
    datePicker: {
      alignSelf: "stretch",
    },
    modalCard: {
      maxHeight: "82%",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 28,
      backgroundColor: palette.surface,
      gap: 16,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    modalHeaderContent: {
      flex: 1,
      paddingRight: 8,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: palette.text,
    },
    modalDescription: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 18,
      color: palette.mutedText,
    },
    modalCloseButton: {
      width: 36,
      height: 36,
      flexShrink: 0,
      alignSelf: "flex-start",
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.surfaceMuted,
      borderWidth: 0.6,
      borderColor: palette.border,
    },
    modalClose: {
      fontSize: 18,
      lineHeight: 18,
      color: palette.text,
    },
    syncStatsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    syncStatText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 18,
      color: palette.mutedText,
    },
    syncStatBadge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      fontSize: 12,
      fontWeight: "700",
    },
    syncStatOnline: {
      color: palette.text,
      backgroundColor: palette.primaryMuted,
    },
    syncStatOffline: {
      color: palette.text,
      backgroundColor: palette.mode === "dark" ? "#422006" : "#fef3c7",
    },
    modalActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    secondaryAction: {
      borderRadius: 16,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    secondaryActionText: {
      fontSize: 12,
      fontWeight: "700",
      color: palette.text,
    },
    modalList: {
      maxHeight: 420,
    },
    emptySyncText: {
      fontSize: 13,
      color: palette.mutedText,
    },
    syncEntry: {
      borderRadius: 18,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      padding: 14,
      gap: 6,
      marginBottom: 10,
    },
    syncEntryTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    syncEntryTitle: {
      flex: 1,
      fontSize: 13,
      fontWeight: "700",
      color: palette.text,
    },
    syncReviewAction: {
      fontSize: 12,
      fontWeight: "700",
      color: palette.primary,
    },
    syncReviewActionDisabled: {
      color: palette.mutedText,
    },
    syncEntryMeta: {
      fontSize: 12,
      color: palette.mutedText,
    },
    syncEntryStatus: {
      fontSize: 12,
      color: palette.text,
    },
    syncEntryError: {
      fontSize: 12,
      lineHeight: 18,
      color: palette.warning,
    },
  });

  return {
    ...styles,
    $palette: palette,
  };
};
