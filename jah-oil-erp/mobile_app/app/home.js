import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";

import AuthTextInput from "../components/auth/AuthTextInput";
import InfoCard from "../components/ui/InfoCard";
import PrimaryButton from "../components/ui/PrimaryButton";
import SectionHeader from "../components/ui/SectionHeader";
import { verifyClientCashierQrCode } from "../features/client/api";
import { useClientApp } from "../features/client/AppProvider";
import { useAppTheme, useThemedStyles } from "../theme/ThemeProvider";

function formatMoney(value) {
  return `D${Number(value || 0).toLocaleString()}`;
}

function formatTimeLabel(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatActivityDateTimeLabel(value) {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

const DEFAULT_SCANNER_MESSAGE = "Align the cashier QR code inside the frame.";
const RECENT_ACTIVITY_VISIBLE_LIMIT = 10;

function extractCashierQrCodeFromScan(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "object") {
    return extractCashierQrCodeFromScan(
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
      return extractCashierQrCodeFromScan(parsed);
    } catch {}
  }

  try {
    const parsedUrl = new URL(rawValue);
    return extractCashierQrCodeFromScan(
      parsedUrl.searchParams.get("qrCode") ||
        parsedUrl.searchParams.get("cashierQrCode") ||
        parsedUrl.searchParams.get("cashierCode") ||
        parsedUrl.searchParams.get("code"),
    );
  } catch {}

  return rawValue;
}

function buildGiftCodeShareMessage(gift) {
  return [
    "Jah Oil Fuel Gift",
    `Code: ${gift.code}`,
    `Recipient: ${gift.recipientName || "Recipient"}`,
    `Product: ${gift.productName || gift.productLabel || "Fuel"}`,
    `Value: ${formatMoney(gift.amount)}`,
    "Present this code at the station to redeem this fuel gift.",
  ].join("\n");
}

function parseDateFilterValue(value, endOfDay = false) {
  const normalizedValue = `${value || ""}`.trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedDate = new Date(
    `${normalizedValue}${endOfDay ? "T23:59:59.999" : "T00:00:00.000"}`,
  );

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateFilterLabel(value) {
  const parsedDate = parseDateFilterValue(value);

  if (!parsedDate) {
    return "Select date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsedDate);
}

export default function HomeScreen() {
  const { palette, mode, setMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const {
    authStatus,
    isAuthenticated,
    isBootstrapping,
    sessionToken,
    fuelProducts,
    providers,
    hiddenBalance,
    setHiddenBalance,
    rewardBalanceAmount,
    rewardSettings,
    bulkBalanceRows,
    couponSummary,
    activeGiftCodes,
    recentActivities,
    profile,
    updateProfile,
    purchaseFuel,
    fundBulkFuel,
    redeemBulkFuel,
    generateGiftFuelCode,
    cancelFuelGiftCode,
    signOut,
  } = useClientApp();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const hasRequestedCameraPermissionRef = useRef(false);
  const scannerLockRef = useRef(false);
  const giftCreationLockRef = useRef(false);
  const [activeSheet, setActiveSheet] = useState("");
  const [scannerTarget, setScannerTarget] = useState("");
  const [isCameraAvailable, setIsCameraAvailable] = useState(null);
  const [scannerState, setScannerState] = useState({
    status: "idle",
    message: DEFAULT_SCANNER_MESSAGE,
  });
  const [verifiedCashiers, setVerifiedCashiers] = useState({
    buy: null,
    redeem: null,
  });
  const [toast, setToast] = useState(null);
  const [buyForm, setBuyForm] = useState({
    qrCode: "",
    productCode: fuelProducts[0]?.code || "",
    providerCode: profile.preferredProvider || providers[0]?.code || "",
    amount: "2000",
    cashbackAmountToRedeem: "0",
  });
  const [bulkForm, setBulkForm] = useState({
    productCode: fuelProducts[0]?.code || "",
    providerCode: profile.preferredProvider || providers[0]?.code || "",
    amount: "10000",
  });
  const [redeemForm, setRedeemForm] = useState({
    qrCode: "",
    productCode: bulkBalanceRows[0]?.productCode || fuelProducts[0]?.code || "",
    amount: "3000",
  });
  const [giftForm, setGiftForm] = useState({
    productCode: fuelProducts[0]?.code || "",
    amount: "2500",
    recipientName: "",
  });
  const [isGeneratingGiftCode, setIsGeneratingGiftCode] = useState(false);
  const [isSharingGiftId, setIsSharingGiftId] = useState("");
  const [isCancellingGiftId, setIsCancellingGiftId] = useState("");
  const [isCopyingGiftId, setIsCopyingGiftId] = useState("");
  const [isSubmittingFuelPurchase, setIsSubmittingFuelPurchase] = useState(false);
  const [isSubmittingBulkPurchase, setIsSubmittingBulkPurchase] = useState(false);
  const [isSubmittingBulkRedeem, setIsSubmittingBulkRedeem] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityFromDate, setActivityFromDate] = useState("");
  const [activityToDate, setActivityToDate] = useState("");
  const [activeDatePicker, setActiveDatePicker] = useState("");
  const [datePickerValue, setDatePickerValue] = useState(new Date());
  const [settingsDraft, setSettingsDraft] = useState(profile);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setToast(null);
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    setSettingsDraft(profile);
    setBuyForm((current) => ({
      ...current,
      providerCode: profile.preferredProvider || current.providerCode,
    }));
    setBulkForm((current) => ({
      ...current,
      providerCode: profile.preferredProvider || current.providerCode,
    }));
  }, [profile]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace("/login");
    }
  }, [authStatus]);

  useEffect(() => {
    if (activeSheet !== "scanner") {
      return;
    }

    scannerLockRef.current = false;
    setIsCameraAvailable(null);
    setScannerState({
      status: "idle",
      message: DEFAULT_SCANNER_MESSAGE,
    });
  }, [activeSheet, scannerTarget]);

  useEffect(() => {
    if (
      activeSheet === "scanner" &&
      !cameraPermission?.granted &&
      cameraPermission?.canAskAgain &&
      !hasRequestedCameraPermissionRef.current
    ) {
      hasRequestedCameraPermissionRef.current = true;
      requestCameraPermission().catch(() => {});
    }
  }, [
    activeSheet,
    cameraPermission?.granted,
    cameraPermission?.canAskAgain,
    requestCameraPermission,
  ]);

  useEffect(() => {
    if (activeSheet !== "scanner" || !cameraPermission?.granted) {
      return;
    }

    let isMounted = true;

    CameraView.isAvailableAsync()
      .then((available) => {
        if (!isMounted) {
          return;
        }

        setIsCameraAvailable(Boolean(available));

        if (!available) {
          setScannerState({
            status: "error",
            message:
              "This simulator does not provide a camera feed. Use a physical device or enter a cashier code manually for testing.",
          });
        }
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setIsCameraAvailable(false);
        setScannerState({
          status: "error",
          message:
            "Camera is not available in this environment. Use a physical device or enter a cashier code manually for testing.",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [activeSheet, cameraPermission?.granted]);

  const selectedBuyProduct = useMemo(
    () =>
      fuelProducts.find((product) => product.code === buyForm.productCode) ||
      fuelProducts[0],
    [buyForm.productCode, fuelProducts],
  );
  const buyPreview = useMemo(() => {
    const amount = Number(buyForm.amount || 0);
    const cashbackAmountToRedeem = Math.min(
      Number(rewardBalanceAmount || 0),
      Math.max(0, Number(buyForm.cashbackAmountToRedeem || 0)),
    );
    const redeemedValue = cashbackAmountToRedeem;
    const payableAmount = Math.max(0, amount - redeemedValue);
    const litres = amount / Number(selectedBuyProduct?.pricePerLitre || 1);

    return {
      cashbackAmountToRedeem,
      redeemedValue,
      payableAmount,
      litres,
    };
  }, [
    buyForm.amount,
    buyForm.cashbackAmountToRedeem,
    rewardBalanceAmount,
    selectedBuyProduct,
  ]);

  const rewardSummary = useMemo(() => {
    const cashBackPercent = Number(rewardSettings?.cashBackPercent || 0);

    return {
      earnLabel: `${cashBackPercent.toFixed(1)}% cash back on eligible fuel sales`,
      redeemLabel: "Redeem during a fuel purchase",
    };
  }, [rewardSettings]);

  const selectedBuyCashier = verifiedCashiers.buy;
  const selectedRedeemCashier = verifiedCashiers.redeem;
  const visibleBulkBalanceRows = useMemo(
    () =>
      bulkBalanceRows.filter(
        (balance) => Number(balance?.availableAmount || 0) > 0,
      ),
    [bulkBalanceRows],
  );
  const bulkAvailableByProductCode = useMemo(
    () =>
      (Array.isArray(bulkBalanceRows) ? bulkBalanceRows : []).reduce(
        (accumulator, balance) => {
          const productCode = `${balance?.productCode || ""}`.trim();

          if (!productCode) {
            return accumulator;
          }

          accumulator[productCode] = Number(balance?.availableAmount || 0);
          return accumulator;
        },
        {},
      ),
    [bulkBalanceRows],
  );
  const fuelProductLabelByCode = useMemo(
    () =>
      fuelProducts.reduce((accumulator, product) => {
        const productCode = `${product?.code || ""}`.trim();

        if (!productCode) {
          return accumulator;
        }

        accumulator[productCode] = product?.label || productCode;
        return accumulator;
      }, {}),
    [fuelProducts],
  );
  const visibleRecentActivities = useMemo(() => {
    const normalizedSearch = activitySearch.trim().toLowerCase();
    const fromDate = parseDateFilterValue(activityFromDate);
    const toDate = parseDateFilterValue(activityToDate, true);

    return recentActivities
      .filter((activity) => {
        const activityTimestamp = Date.parse(activity?.createdAt || "");
        const hasValidActivityDate = Number.isFinite(activityTimestamp);

        if (normalizedSearch) {
          const searchableValue = [
            activity?.title || "",
            activity?.subtitle || "",
            activity?.type || "",
          ]
            .join(" ")
            .toLowerCase();

          if (!searchableValue.includes(normalizedSearch)) {
            return false;
          }
        }

        if (fromDate && (!hasValidActivityDate || activityTimestamp < fromDate.getTime())) {
          return false;
        }

        if (toDate && (!hasValidActivityDate || activityTimestamp > toDate.getTime())) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftTime = Date.parse(left?.createdAt || "") || 0;
        const rightTime = Date.parse(right?.createdAt || "") || 0;
        return rightTime - leftTime;
      })
      .slice(0, RECENT_ACTIVITY_VISIBLE_LIMIT);
  }, [activityFromDate, activitySearch, activityToDate, recentActivities]);

  function showToast(type, message) {
    setToast({ type, message });
  }

  function getCombinedRedeemableAmount(productCode) {
    return (
      Number(bulkAvailableByProductCode[`${productCode || ""}`.trim()] || 0) +
      Number(rewardBalanceAmount || 0)
    );
  }

  function buildInsufficientBalanceMessage(productCode, requestedAmount, actionLabel) {
    const productLabel =
      fuelProductLabelByCode[`${productCode || ""}`.trim()] || "fuel";
    const availableAmount = getCombinedRedeemableAmount(productCode);

    return `You need ${formatMoney(requestedAmount)} for ${productLabel}, but only ${formatMoney(
      availableAmount,
    )} is available from bulk fuel plus cash back. Top up or reduce the amount before you ${actionLabel}.`;
  }

  function closeSheet() {
    setActiveSheet("");
    setScannerTarget("");
    setIsCameraAvailable(null);
    setScannerState({
      status: "idle",
      message: DEFAULT_SCANNER_MESSAGE,
    });
  }

  function setActivityDateValue(target, nextValue) {
    if (target === "from") {
      setActivityFromDate(nextValue);
      return;
    }

    setActivityToDate(nextValue);
  }

  function openActivityDatePicker(target) {
    const currentValue =
      parseDateFilterValue(target === "from" ? activityFromDate : activityToDate) ||
      new Date();
    setDatePickerValue(currentValue);
    setActiveDatePicker(target);
  }

  function closeActivityDatePicker() {
    setActiveDatePicker("");
  }

  function applyCurrentDatePickerValue() {
    if (!activeDatePicker) {
      return;
    }

    setActivityDateValue(activeDatePicker, formatDateInputValue(datePickerValue));
    closeActivityDatePicker();
  }

  function clearCurrentDatePickerValue() {
    if (!activeDatePicker) {
      return;
    }

    setActivityDateValue(activeDatePicker, "");
    closeActivityDatePicker();
  }

  function handleNativeDateChange(event, selectedDate) {
    if (Platform.OS === "android") {
      if (event?.type === "dismissed") {
        closeActivityDatePicker();
        return;
      }

      if (selectedDate && activeDatePicker) {
        setActivityDateValue(activeDatePicker, formatDateInputValue(selectedDate));
      }

      closeActivityDatePicker();
      return;
    }

    if (selectedDate) {
      setDatePickerValue(selectedDate);
    }
  }

  function openScannerFor(target) {
    setScannerTarget(target);
    setActiveSheet("scanner");
  }

  function updateScannerCode(value) {
    if (scannerTarget === "redeem") {
      setRedeemForm((current) => ({ ...current, qrCode: value }));
      return;
    }

    setBuyForm((current) => ({ ...current, qrCode: value }));
  }

  function resetScannerState() {
    scannerLockRef.current = false;
    setScannerState({
      status: "idle",
      message: DEFAULT_SCANNER_MESSAGE,
    });
  }

  function applyVerifiedCashier(target, qrCode, cashier) {
    if (target === "redeem") {
      setRedeemForm((current) => ({ ...current, qrCode }));
      setVerifiedCashiers((current) => ({ ...current, redeem: cashier }));
      return;
    }

    setBuyForm((current) => ({ ...current, qrCode }));
    setVerifiedCashiers((current) => ({ ...current, buy: cashier }));
  }

  async function handleCashierQrScanned(scannedData) {
    if (activeSheet !== "scanner" || scannerLockRef.current) {
      return;
    }

    const qrCode = extractCashierQrCodeFromScan(scannedData);

    if (!qrCode) {
      setScannerState({
        status: "error",
        message: "The scanned QR code does not contain a cashier code.",
      });
      return;
    }

    scannerLockRef.current = true;
    setScannerState({
      status: "verifying",
      message: "Verifying cashier QR code...",
    });

    try {
      const verificationResponse = await verifyClientCashierQrCode({
        token: sessionToken,
        qrCode,
        requestedFlow: scannerTarget === "redeem" ? "bulk_redeem" : "fuel_purchase",
      });
      const cashier = verificationResponse?.cashier || null;

      if (!cashier) {
        throw new Error("The scanned cashier QR code is not recognized.");
      }

      applyVerifiedCashier(scannerTarget, qrCode, cashier);
      setScannerState({
        status: "verified",
        message: `${cashier.name} verified at ${cashier.stationName}. Opening checkout...`,
      });
      setActiveSheet(scannerTarget === "redeem" ? "redeem" : "buy");
    } catch (error) {
      scannerLockRef.current = false;
      setScannerState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not verify this cashier QR code.",
      });
    }
  }

  async function handleFuelPurchase() {
    if (isSubmittingFuelPurchase) {
      return;
    }

    setIsSubmittingFuelPurchase(true);

    try {
      const result = await purchaseFuel(buyForm);
      closeSheet();
      showToast(
        "success",
        `${result.product.label} paid successfully with ${capitalize(result.providerCode)}.`,
      );
    } catch (error) {
      showToast("error", error?.message || "Fuel purchase failed.");
    } finally {
      setIsSubmittingFuelPurchase(false);
    }
  }

  async function handleBulkPurchase() {
    if (isSubmittingBulkPurchase) {
      return;
    }

    setIsSubmittingBulkPurchase(true);

    try {
      const result = await fundBulkFuel(bulkForm);
      closeSheet();
      showToast(
        "success",
        `${result.productName || bulkForm.productCode} bulk balance increased by ${formatMoney(
          result.amount,
        )}.`,
      );
    } catch (error) {
      showToast("error", error?.message || "Bulk purchase failed.");
    } finally {
      setIsSubmittingBulkPurchase(false);
    }
  }

  async function handleBulkRedeem() {
    if (isSubmittingBulkRedeem) {
      return;
    }

    const requestedAmount = Number(redeemForm.amount || 0);

    if (
      Number.isFinite(requestedAmount) &&
      requestedAmount > 0 &&
      getCombinedRedeemableAmount(redeemForm.productCode) < requestedAmount
    ) {
      showToast(
        "error",
        buildInsufficientBalanceMessage(
          redeemForm.productCode,
          requestedAmount,
          "redeem fuel",
        ),
      );
      return;
    }

    setIsSubmittingBulkRedeem(true);

    try {
      const result = await redeemBulkFuel(redeemForm);
      closeSheet();
      showToast(
        "success",
        `${result.productLabel} redeemed at ${result.cashier.stationName}.`,
      );
    } catch (error) {
      showToast("error", error?.message || "Bulk redemption failed.");
    } finally {
      setIsSubmittingBulkRedeem(false);
    }
  }

  async function handleGiftCodeCreation() {
    if (giftCreationLockRef.current || isGeneratingGiftCode) {
      return;
    }

    const requestedAmount = Number(giftForm.amount || 0);

    if (
      Number.isFinite(requestedAmount) &&
      requestedAmount > 0 &&
      getCombinedRedeemableAmount(giftForm.productCode) < requestedAmount
    ) {
      showToast(
        "error",
        buildInsufficientBalanceMessage(
          giftForm.productCode,
          requestedAmount,
          "create this gift",
        ),
      );
      return;
    }

    giftCreationLockRef.current = true;
    setIsGeneratingGiftCode(true);

    try {
      const result = await generateGiftFuelCode(giftForm);
      closeSheet();
      showToast("success", `Gift code ${result.code} is ready to share.`);
    } catch (error) {
      showToast("error", error?.message || "Gift code generation failed.");
    } finally {
      giftCreationLockRef.current = false;
      setIsGeneratingGiftCode(false);
    }
  }

  async function handleShareGiftCode(gift) {
    if (!gift?.id) {
      return;
    }

    setIsSharingGiftId(gift.id);

    try {
      await Share.share({
        title: "Jah Oil Fuel Gift",
        message: buildGiftCodeShareMessage(gift),
      });
    } catch (error) {
      showToast("error", error?.message || "Gift code could not be shared.");
    } finally {
      setIsSharingGiftId("");
    }
  }

  async function handleCopyGiftCode(gift) {
    if (!gift?.id || !gift?.code) {
      return;
    }

    setIsCopyingGiftId(gift.id);

    try {
      await Clipboard.setStringAsync(gift.code);
      showToast("success", `Gift code ${gift.code} copied.`);
    } catch (error) {
      showToast("error", error?.message || "Gift code could not be copied.");
    } finally {
      setIsCopyingGiftId("");
    }
  }

  async function confirmCancelGiftCode(gift) {
    if (!gift?.id) {
      return;
    }

    setIsCancellingGiftId(gift.id);

    try {
      await cancelFuelGiftCode(gift.id);
      showToast("success", `Gift code ${gift.code} was cancelled.`);
    } catch (error) {
      showToast("error", error?.message || "Gift code could not be cancelled.");
    } finally {
      setIsCancellingGiftId("");
    }
  }

  function handleCancelGiftCode(gift) {
    Alert.alert(
      "Cancel gift code?",
      "This gift code will no longer be redeemable at the station.",
      [
        {
          text: "Keep",
          style: "cancel",
        },
        {
          text: "Cancel code",
          style: "destructive",
          onPress: () => {
            void confirmCancelGiftCode(gift);
          },
        },
      ],
    );
  }

  async function handleSaveSettings() {
    if (isSavingSettings) {
      return;
    }

    setIsSavingSettings(true);

    try {
      await updateProfile(settingsDraft);
      closeSheet();
      showToast("success", "Settings updated.");
    } catch (error) {
      showToast("error", error?.message || "Settings update failed.");
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  if (authStatus === "loading" || isBootstrapping) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>Loading your client dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.balanceHero}>
          <View style={styles.heroTopRow}>
            <Pressable
              onPress={() => {
                setSettingsDraft(profile);
                setActiveSheet("settings");
              }}
              style={styles.iconButton}
            >
              <Ionicons name="settings-sharp" size={18} color={palette.text} />
            </Pressable>
            <View style={styles.heroLabelWrap}>
              <Text style={styles.balanceLabel}>Available Cash Back</Text>
              <Text style={styles.balanceSubLabel}>Client fuel rewards wallet</Text>
            </View>
            <Pressable
              onPress={() => setHiddenBalance((current) => !current)}
              style={styles.iconButton}
            >
              <Ionicons
                name={hiddenBalance ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={palette.text}
              />
            </Pressable>
          </View>

          <Text style={styles.balanceValue}>
            {hiddenBalance ? "••••" : formatMoney(rewardBalanceAmount)}
          </Text>
          <View style={styles.balanceWorthChip}>
            <Ionicons
              name="pricetag-outline"
              size={14}
              color={palette.primary}
            />
            <Text style={styles.balanceWorthText}>
              {hiddenBalance
                ? "Balance hidden"
                : rewardSummary.redeemLabel}
            </Text>
          </View>
          <Text style={styles.balanceMetaDesc}>
            {rewardSummary.earnLabel}
          </Text>
        </View>

        <InfoCard>
          <View style={styles.actionGrid}>
            <ActionTile
              icon="flash"
              title="Buy Fuel"
              subtitle="Scan, pay, collect cashback"
              onPress={() => openScannerFor("buy")}
              styles={styles}
              palette={palette}
            />
            <ActionTile
              icon="wallet"
              title="Bulk Fuel"
              subtitle="Pay now, redeem later"
              onPress={() => setActiveSheet("bulk")}
              styles={styles}
              palette={palette}
            />
            <ActionTile
              icon="qr-code"
              title="Redeem Bulk"
              subtitle="Use bulk balance at station"
              onPress={() => openScannerFor("redeem")}
              styles={styles}
              palette={palette}
            />
            <ActionTile
              icon="gift"
              title="Gift Fuel"
              subtitle="Buy a fuel gift for someone"
              onPress={() => setActiveSheet("gift")}
              styles={styles}
              palette={palette}
            />
          </View>
        </InfoCard>

        {/* <View style={styles.metricStrip}>
          <MetricPill
            label="Points"
            value={pointsBalance.toLocaleString()}
            styles={styles}
          />
          <MetricPill
            label="Active gift codes"
            value={activeGiftCodes.length.toLocaleString()}
            styles={styles}
          />
          <MetricPill
            label="Cashiers"
            value={cashiers.length.toLocaleString()}
            styles={styles}
          />
        </View> */}

        {visibleBulkBalanceRows.length > 0 ? (
          <InfoCard>
            <SectionHeader
              title="Bulk fuel balances"
              description="Available value per fuel product."
            />
            <View style={styles.balanceList}>
              {visibleBulkBalanceRows.map((balance) => (
                <View key={balance.productCode} style={styles.balanceRow}>
                  <View>
                    <Text style={styles.balanceRowTitle}>
                      {balance.productName || balance.productLabel}
                    </Text>
                    <Text style={styles.balanceRowSubtitle}>
                      {balance.availableQuantity.toFixed(1)} {balance.unit} available
                    </Text>
                  </View>
                  <Text style={styles.balanceRowAmount}>
                    {formatMoney(balance.availableAmount)}
                  </Text>
                </View>
              ))}
            </View>
          </InfoCard>
        ) : null}

        {profile.userType === "company" ? (
          <InfoCard>
            <SectionHeader
              title="Company coupons"
              description="Active company coupon purchases and remaining usable value."
            />
            <View style={styles.balanceList}>
              <View style={styles.balanceRow}>
                <View>
                  <Text style={styles.balanceRowTitle}>Available coupon value</Text>
                  <Text style={styles.balanceRowSubtitle}>
                    {couponSummary.activeCouponCount.toLocaleString()} active coupons
                  </Text>
                </View>
                <Text style={styles.balanceRowAmount}>
                  {formatMoney(couponSummary.remainingValue)}
                </Text>
              </View>
              <View style={styles.balanceRow}>
                <View>
                  <Text style={styles.balanceRowTitle}>Coupon purchases</Text>
                  <Text style={styles.balanceRowSubtitle}>
                    Total coupon purchase records linked to your organization
                  </Text>
                </View>
                <Text style={styles.balanceRowAmount}>
                  {couponSummary.purchaseCount.toLocaleString()}
                </Text>
              </View>
            </View>
          </InfoCard>
        ) : null}

        {activeGiftCodes.length > 0 ? (
          <InfoCard>
            <SectionHeader
              title="Active gift codes"
              description="Share these with someone before they redeem at the station."
            />
            <View style={styles.codeList}>
              {activeGiftCodes.map((gift) => (
                <View key={gift.id} style={styles.codeCard}>
                  <View style={styles.codeHeader}>
                    <View style={styles.codeCopy}>
                      <Text style={styles.codeValue}>{gift.code}</Text>
                      <View style={styles.codeMetaRow}>
                        <View style={styles.codeMetaCopy}>
                          <Text style={styles.codeMeta}>
                            {gift.productName || gift.productLabel} · {gift.recipientName}
                          </Text>
                          <Text style={styles.codeMetaSecondary}>
                            Created {formatTimeLabel(gift.createdAt)}
                          </Text>
                        </View>
                        <View style={styles.codeActionRow}>
                          <Pressable
                            onPress={() => void handleCopyGiftCode(gift)}
                            disabled={
                              isCopyingGiftId === gift.id ||
                              isCancellingGiftId === gift.id ||
                              isSharingGiftId === gift.id
                            }
                            style={styles.codeIconButton}
                          >
                            {isCopyingGiftId === gift.id ? (
                              <ActivityIndicator size="small" color={palette.text} />
                            ) : (
                              <Ionicons name="copy-outline" size={16} color={palette.text} />
                            )}
                          </Pressable>
                          <Pressable
                            onPress={() => handleCancelGiftCode(gift)}
                            disabled={
                              isCancellingGiftId === gift.id ||
                              isSharingGiftId === gift.id ||
                              isCopyingGiftId === gift.id
                            }
                            style={styles.codeIconButton}
                          >
                            {isCancellingGiftId === gift.id ? (
                              <ActivityIndicator size="small" color={palette.text} />
                            ) : (
                              <Ionicons
                                name="close-circle-outline"
                                size={16}
                                color={palette.text}
                              />
                            )}
                          </Pressable>
                          <Pressable
                            onPress={() => void handleShareGiftCode(gift)}
                            disabled={
                              isSharingGiftId === gift.id ||
                              isCancellingGiftId === gift.id ||
                              isCopyingGiftId === gift.id
                            }
                            style={styles.codeIconButton}
                          >
                            {isSharingGiftId === gift.id ? (
                              <ActivityIndicator size="small" color={palette.primary} />
                            ) : (
                              <Ionicons
                                name="share-social-outline"
                                size={16}
                                color={palette.primary}
                              />
                            )}
                          </Pressable>
                        </View>
                      </View>
                    </View>
                    <Text style={styles.codeAmount}>{formatMoney(gift.amount)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </InfoCard>
        ) : null}

        <InfoCard>
          <SectionHeader
            title="Recent activity"
            description="Latest rewards, bulk fuel, and gift code activity."
          />
          {recentActivities.length > 0 ? (
            <View style={styles.activityFilterPanel}>
              <View style={styles.activityFilterField}>
                <Text style={styles.activityFilterLabel}>Search</Text>
                <TextInput
                  value={activitySearch}
                  onChangeText={setActivitySearch}
                  placeholder="Search activity"
                  placeholderTextColor={palette.placeholder}
                  style={styles.activityFilterInput}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.activityFilterRow}>
                {Platform.OS === "web" ? (
                  <>
                    <View style={[styles.activityFilterField, styles.activityDateField]}>
                      <Text style={styles.activityFilterLabel}>From</Text>
                      <TextInput
                        value={activityFromDate}
                        onChangeText={setActivityFromDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={palette.placeholder}
                        style={styles.activityFilterInput}
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={[styles.activityFilterField, styles.activityDateField]}>
                      <Text style={styles.activityFilterLabel}>To</Text>
                      <TextInput
                        value={activityToDate}
                        onChangeText={setActivityToDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={palette.placeholder}
                        style={styles.activityFilterInput}
                        autoCapitalize="none"
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <View style={[styles.activityFilterField, styles.activityDateField]}>
                      <Text style={styles.activityFilterLabel}>From</Text>
                      <Pressable
                        onPress={() => openActivityDatePicker("from")}
                        style={styles.activityDateButton}
                      >
                        <Text
                          style={[
                            styles.activityDateButtonText,
                            !activityFromDate ? styles.activityDateButtonPlaceholder : null,
                          ]}
                        >
                          {formatDateFilterLabel(activityFromDate)}
                        </Text>
                        <Ionicons
                          name="calendar-outline"
                          size={16}
                          color={palette.mutedText}
                        />
                      </Pressable>
                    </View>
                    <View style={[styles.activityFilterField, styles.activityDateField]}>
                      <Text style={styles.activityFilterLabel}>To</Text>
                      <Pressable
                        onPress={() => openActivityDatePicker("to")}
                        style={styles.activityDateButton}
                      >
                        <Text
                          style={[
                            styles.activityDateButtonText,
                            !activityToDate ? styles.activityDateButtonPlaceholder : null,
                          ]}
                        >
                          {formatDateFilterLabel(activityToDate)}
                        </Text>
                        <Ionicons
                          name="calendar-outline"
                          size={16}
                          color={palette.mutedText}
                        />
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
              <Text style={styles.activityFilterHint}>
                Showing {visibleRecentActivities.length} of{" "}
                {recentActivities.length.toLocaleString()} recent activities
              </Text>
            </View>
          ) : null}
          <View style={styles.activityList}>
            {visibleRecentActivities.length === 0 ? (
              <Text style={styles.emptyText}>
                {recentActivities.length === 0
                  ? "No recent activity yet."
                  : "No activities match this filter."}
              </Text>
            ) : (
              visibleRecentActivities.map((activity) => {
                const activityDateLabel = formatActivityDateTimeLabel(activity.createdAt);

                return (
                  <View key={activity.id} style={styles.activityRow}>
                    <View style={styles.activityIconWrap}>
                      <Ionicons
                        name={getActivityIcon(activity.type)}
                        size={18}
                        color={palette.primary}
                      />
                    </View>
                    <View style={styles.activityCopy}>
                      <Text style={styles.activityTitle}>{activity.title}</Text>
                      {activity.subtitle ? (
                        <Text style={styles.activitySubtitle}>{activity.subtitle}</Text>
                      ) : null}
                      {activityDateLabel ? (
                        <Text style={styles.activityTime}>{activityDateLabel}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.activityAmount}>
                      {formatMoney(activity.amount)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </InfoCard>
      </ScrollView>

      {toast ? (
        <View
          style={[
            styles.toast,
            toast.type === "error" ? styles.toastError : styles.toastSuccess,
          ]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      ) : null}

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
          onRequestClose={closeActivityDatePicker}
        >
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={closeActivityDatePicker} />
            <View style={styles.datePickerCard}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>
                  {activeDatePicker === "from" ? "Select start date" : "Select end date"}
                </Text>
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

      <BottomSheet
        visible={activeSheet === "scanner"}
        title="Scan Cashier QR"
        subtitle={
          scannerTarget === "redeem"
            ? "Scan the cashier QR first, then continue to bulk redemption."
            : "Scan the cashier QR first, then continue to fuel purchase."
        }
        onClose={closeSheet}
      >
        {cameraPermission?.granted && isCameraAvailable !== false ? (
          <View style={styles.scannerCard}>
            <CameraView
              style={styles.cameraPreview}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onBarcodeScanned={({ data }) => handleCashierQrScanned(data)}
            />
            <View pointerEvents="none" style={styles.cameraOverlay}>
              <View style={styles.scannerFrame} />
            </View>
          </View>
        ) : (
          <View style={styles.scannerPermissionCard}>
            <Ionicons
              name="camera-outline"
              size={28}
              color={palette.primary}
            />
            <Text style={styles.scannerPermissionTitle}>
              Camera access is required
            </Text>
            <Text style={styles.scannerPermissionText}>
              {cameraPermission?.granted
                ? "A live camera feed is not available here. You can test with a manual cashier code or use a physical device."
                : "Allow camera access to scan a cashier QR code on a physical device."}
            </Text>
            {cameraPermission?.canAskAgain ? (
              <PrimaryButton
                label="Allow camera access"
                onPress={() => requestCameraPermission()}
              />
            ) : null}
          </View>
        )}
        {isCameraAvailable === false ? (
          <View style={styles.scannerManualEntry}>
            <AuthTextInput
              label="Cashier QR Code"
              value={scannerTarget === "redeem" ? redeemForm.qrCode : buyForm.qrCode}
              onChangeText={updateScannerCode}
              placeholder="Paste or enter cashier code"
              autoCapitalize="characters"
            />
            <PrimaryButton
              label="Verify entered code"
              onPress={() =>
                handleCashierQrScanned(
                  scannerTarget === "redeem" ? redeemForm.qrCode : buyForm.qrCode,
                )
              }
            />
          </View>
        ) : null}
        <View style={styles.scannerStatusRow}>
          {scannerState.status === "verifying" ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <Ionicons
              name={
                scannerState.status === "verified"
                  ? "checkmark-circle"
                  : scannerState.status === "error"
                    ? "alert-circle"
                    : "scan-outline"
              }
              size={18}
              color={
                scannerState.status === "error" ? "#ef4444" : palette.primary
              }
            />
          )}
          <Text
            style={[
              styles.scannerStatusText,
              scannerState.status === "error" ? styles.scannerStatusError : null,
            ]}
          >
            {scannerState.message}
          </Text>
        </View>
        <Pressable onPress={resetScannerState} style={styles.scannerResetButton}>
          <Text style={styles.scannerResetButtonText}>Scan again</Text>
        </Pressable>
      </BottomSheet>

      <BottomSheet
        visible={activeSheet === "buy"}
        title="Buy Fuel"
        subtitle="Choose wallet, amount, and complete payment."
        onClose={closeSheet}
      >
        {selectedBuyCashier ? (
          <PreviewList
            items={[
              ["Cashier", selectedBuyCashier.name],
              ["Station", selectedBuyCashier.stationName],
            ]}
            styles={styles}
          />
        ) : null}
        <ProductChoiceGrid
          products={fuelProducts}
          selectedCode={buyForm.productCode}
          onSelect={(productCode) =>
            setBuyForm((current) => ({ ...current, productCode }))
          }
          styles={styles}
        />
        <ProviderRow
          providers={providers}
          selectedCode={buyForm.providerCode}
          onSelect={(providerCode) =>
            setBuyForm((current) => ({ ...current, providerCode }))
          }
          styles={styles}
        />
        <AuthTextInput
          label="Fuel Amount"
          value={buyForm.amount}
          onChangeText={(amount) =>
            setBuyForm((current) => ({ ...current, amount }))
          }
          keyboardType="numeric"
          placeholder="Enter purchase amount"
        />
        <AuthTextInput
          label="Cash Back to Redeem"
          value={buyForm.cashbackAmountToRedeem}
          onChangeText={(cashbackAmountToRedeem) =>
            setBuyForm((current) => ({ ...current, cashbackAmountToRedeem }))
          }
          keyboardType="numeric"
          placeholder="0"
        />
        <PreviewList
          items={[
            ["Payable amount", formatMoney(buyPreview.payableAmount)],
            ["Estimated litres", `${buyPreview.litres.toFixed(2)} L`],
            ["Cash back used", formatMoney(buyPreview.redeemedValue)],
          ]}
          styles={styles}
        />
        <PrimaryButton
          label={isSubmittingFuelPurchase ? "Processing..." : "Pay and record sale"}
          onPress={handleFuelPurchase}
          disabled={isSubmittingFuelPurchase}
        />
      </BottomSheet>

      <BottomSheet
        visible={activeSheet === "bulk"}
        title="Bulk Fuel Purchase"
        subtitle="Fund fuel once and redeem in bits later."
        onClose={closeSheet}
      >
        <ProductChoiceGrid
          products={fuelProducts}
          selectedCode={bulkForm.productCode}
          onSelect={(productCode) =>
            setBulkForm((current) => ({ ...current, productCode }))
          }
          styles={styles}
        />
        <ProviderRow
          providers={providers}
          selectedCode={bulkForm.providerCode}
          onSelect={(providerCode) =>
            setBulkForm((current) => ({ ...current, providerCode }))
          }
          styles={styles}
        />
        <AuthTextInput
          label="Funding Amount"
          value={bulkForm.amount}
          onChangeText={(amount) =>
            setBulkForm((current) => ({ ...current, amount }))
          }
          keyboardType="numeric"
          placeholder="Enter bulk amount"
        />
        <PrimaryButton
          label={isSubmittingBulkPurchase ? "Processing..." : "Fund bulk balance"}
          onPress={handleBulkPurchase}
          disabled={isSubmittingBulkPurchase}
        />
      </BottomSheet>

      <BottomSheet
        visible={activeSheet === "redeem"}
        title="Redeem Bulk Fuel"
        subtitle="Redeem from your available bulk balance."
        onClose={closeSheet}
      >
        {selectedRedeemCashier ? (
          <PreviewList
            items={[
              ["Cashier", selectedRedeemCashier.name],
              ["Station", selectedRedeemCashier.stationName],
            ]}
            styles={styles}
          />
        ) : null}
        <ProductChoiceGrid
          products={bulkBalanceRows.map((balance) => ({
            code: balance.productCode,
            label: balance.productName || balance.productLabel,
            pricePerLitre:
              fuelProducts.find((product) => product.code === balance.productCode)
                ?.pricePerLitre || 0,
          }))}
          selectedCode={redeemForm.productCode}
          onSelect={(productCode) =>
            setRedeemForm((current) => ({ ...current, productCode }))
          }
          styles={styles}
        />
        <AuthTextInput
          label="Redeem Amount"
          value={redeemForm.amount}
          onChangeText={(amount) =>
            setRedeemForm((current) => ({ ...current, amount }))
          }
          keyboardType="numeric"
          placeholder="Enter amount to redeem"
        />
        <PrimaryButton
          label={isSubmittingBulkRedeem ? "Processing..." : "Redeem and record sale"}
          onPress={handleBulkRedeem}
          disabled={isSubmittingBulkRedeem}
        />
      </BottomSheet>

      <BottomSheet
        visible={activeSheet === "gift"}
        title="Buy Fuel for Someone"
        subtitle="Generate a code that someone can present at the station."
        onClose={closeSheet}
      >
        <ProductChoiceGrid
          products={fuelProducts}
          selectedCode={giftForm.productCode}
          onSelect={(productCode) =>
            setGiftForm((current) => ({ ...current, productCode }))
          }
          styles={styles}
        />
        <AuthTextInput
          label="Recipient Name"
          value={giftForm.recipientName}
          onChangeText={(recipientName) =>
            setGiftForm((current) => ({ ...current, recipientName }))
          }
          placeholder="Who is this for?"
        />
        <AuthTextInput
          label="Fuel Value"
          value={giftForm.amount}
          onChangeText={(amount) =>
            setGiftForm((current) => ({ ...current, amount }))
          }
          keyboardType="numeric"
          placeholder="Enter amount"
        />
        <PrimaryButton
          label={isGeneratingGiftCode ? "Generating..." : "Generate share code"}
          onPress={handleGiftCodeCreation}
          disabled={isGeneratingGiftCode}
        />
      </BottomSheet>

      <BottomSheet
        visible={activeSheet === "settings"}
        title="Settings"
        subtitle="Manage display and default payment options."
        onClose={closeSheet}
      >
        <View style={styles.themeRow}>
          <View style={styles.themeCopy}>
            <Text style={styles.themeTitle}>Light mode</Text>
            <Text style={styles.themeDescription}>
              Toggle the app between light and dark surfaces.
            </Text>
          </View>
          <Switch
            value={mode === "light"}
            onValueChange={(value) => setMode(value ? "light" : "dark")}
            trackColor={{ false: palette.switchTrackOff, true: palette.primary }}
            thumbColor={palette.switchThumb}
          />
        </View>

        <AuthTextInput
          label="Full Name"
          value={settingsDraft.fullName}
          onChangeText={(fullName) =>
            setSettingsDraft((current) => ({ ...current, fullName }))
          }
          placeholder="Enter your name"
        />
        <AuthTextInput
          label="Phone"
          value={settingsDraft.phone}
          onChangeText={(phone) =>
            setSettingsDraft((current) => ({ ...current, phone }))
          }
          placeholder="Enter your phone number"
          keyboardType="phone-pad"
        />

        <ProviderRow
          providers={providers}
          selectedCode={settingsDraft.preferredProvider}
          onSelect={(preferredProvider) =>
            setSettingsDraft((current) => ({ ...current, preferredProvider }))
          }
          styles={styles}
        />

        {providers.map((provider) => (
          <AuthTextInput
            key={provider.code}
            label={`${provider.label} Number`}
            value={settingsDraft.providerNumbers[provider.code]}
            onChangeText={(value) =>
              setSettingsDraft((current) => ({
                ...current,
                providerNumbers: {
                  ...current.providerNumbers,
                  [provider.code]: value,
                },
              }))
            }
            placeholder={provider.placeholder}
            keyboardType="phone-pad"
          />
        ))}

        <PrimaryButton
          label={isSavingSettings ? "Saving..." : "Save settings"}
          onPress={handleSaveSettings}
          disabled={isSavingSettings}
        />
        <Pressable
          onPress={handleSignOut}
          style={styles.signOutButton}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </BottomSheet>
    </SafeAreaView>
  );
}

function capitalize(value) {
  const normalizedValue = `${value || ""}`;
  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

function getActivityIcon(type) {
  if (type === "bulk-purchase") {
    return "wallet-outline";
  }
  if (type === "bulk-redeem") {
    return "qr-code-outline";
  }
  if (type === "cashback-reversed") {
    return "arrow-undo-outline";
  }
  if (type === "gift-code") {
    return "gift-outline";
  }

  return "flash-outline";
}

function ActionTile({ icon, title, subtitle, onPress, styles, palette }) {
  return (
    <Pressable onPress={onPress} style={styles.actionTile}>
      <View style={styles.actionIconBubble}>
        <Ionicons name={icon} size={22} color={palette.primary} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

function MetricPill({ label, value, styles }) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricPillLabel}>{label}</Text>
      <Text style={styles.metricPillValue}>{value}</Text>
    </View>
  );
}

function ProductChoiceGrid({ products, selectedCode, onSelect, styles }) {
  return (
    <View style={styles.choiceGrid}>
      {products.map((product) => (
        <Pressable
          key={product.code}
          onPress={() => onSelect(product.code)}
          style={[
            styles.choiceCard,
            selectedCode === product.code ? styles.choiceCardActive : null,
          ]}
        >
          <Text style={styles.choiceTitle}>{product.label}</Text>
          <Text style={styles.choiceMeta}>
            {formatMoney(product.pricePerLitre || product.pricePerUnit)} / L
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ProviderRow({ providers, selectedCode, onSelect, styles }) {
  return (
    <View style={styles.providerRow}>
      {providers.map((provider) => (
        <Pressable
          key={provider.code}
          onPress={() => onSelect(provider.code)}
          style={[
            styles.providerChip,
            selectedCode === provider.code ? styles.providerChipActive : null,
          ]}
        >
          <Text style={styles.providerText}>{provider.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PreviewList({ items, styles }) {
  return (
    <View style={styles.previewList}>
      {items.map(([label, value]) => (
        <View key={label} style={styles.previewRow}>
          <Text style={styles.previewLabel}>{label}</Text>
          <Text style={styles.previewValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function BottomSheet({ visible, title, subtitle, children, onClose }) {
  const styles = useThemedStyles(createStyles);
  const { palette } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={styles.sheetTitle}>{title}</Text>
              {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={styles.sheetCloseButton}>
              <Ionicons name="close" size={18} color={palette.text} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={styles.sheetBodyContent}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (palette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.background,
    },
    screen: {
      flex: 1,
      backgroundColor: palette.background,
    },
    loadingScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingHorizontal: 24,
      backgroundColor: palette.background,
    },
    loadingText: {
      fontSize: 14,
      fontWeight: "600",
      color: palette.mutedText,
      textAlign: "center",
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 120,
      gap: 16,
    },
    balanceHero: {
      borderRadius: 34,
      padding: 20,
      gap: 12,
      backgroundColor: palette.surfaceElevated,
      borderWidth: 0.6,
      borderColor: palette.border,
      shadowColor: palette.shadow,
      shadowOpacity: palette.mode === "dark" ? 0.2 : 0.08,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 6,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    heroLabelWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      gap: 2,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
    },
    balanceLabel: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: palette.accentSoft,
      textAlign: "center",
    },
    balanceSubLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: palette.mutedText,
      textAlign: "center",
    },
    balanceValue: {
      textAlign: "center",
      fontSize: 40,
      lineHeight: 46,
      fontWeight: "900",
      color: palette.text,
    },
    balanceWorthChip: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.primaryBorder,
      backgroundColor: palette.primaryMuted,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    balanceWorthText: {
      fontSize: 13,
      fontWeight: "700",
      color: palette.text,
    },
    balanceMetaDesc: {
      textAlign: "center",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500",
      color: palette.mutedText,
    },
    actionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    actionTile: {
      width: "47.5%",
      minWidth: 140,
      alignItems: "center",
      gap: 8,
      borderRadius: 24,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 18,
    },
    actionIconBubble: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.primaryMuted,
      borderWidth: 1,
      borderColor: palette.primaryBorder,
    },
    actionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: palette.text,
      textAlign: "center",
    },
    actionSubtitle: {
      fontSize: 12,
      lineHeight: 18,
      color: palette.mutedText,
      textAlign: "center",
    },
    metricStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    metricPill: {
      flex: 1,
      minWidth: 104,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: palette.surfaceMuted,
      borderWidth: 0.6,
      borderColor: palette.border,
      gap: 3,
    },
    metricPillLabel: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      color: palette.mutedText,
    },
    metricPillValue: {
      fontSize: 18,
      fontWeight: "800",
      color: palette.text,
    },
    balanceList: {
      gap: 12,
    },
    balanceRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    balanceRowTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: palette.text,
    },
    balanceRowSubtitle: {
      marginTop: 4,
      fontSize: 12,
      color: palette.mutedText,
    },
    balanceRowAmount: {
      fontSize: 16,
      fontWeight: "800",
      color: palette.text,
    },
    codeList: {
      gap: 12,
    },
    codeCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    codeHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    codeCopy: {
      flex: 1,
      gap: 4,
    },
    codeMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 4,
    },
    codeMetaCopy: {
      //flex: 1,
      gap: 3,
    },
    codeValue: {
      fontSize: 16,
      fontWeight: "800",
      color: palette.text,
    },
    codeMeta: {
      fontSize: 12,
      color: palette.mutedText,
    },
    codeMetaSecondary: {
      fontSize: 11,
      color: palette.mutedText,
    },
    codeAmount: {
      fontSize: 15,
      fontWeight: "800",
      color: palette.primary,
    },
    codeActionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
    },
    codeIconButton: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 17,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    emptyText: {
      fontSize: 13,
      color: palette.mutedText,
    },
    activityFilterPanel: {
      gap: 10,
      marginBottom: 12,
    },
    activityFilterRow: {
      flexDirection: "row",
      gap: 10,
    },
    activityFilterField: {
      gap: 6,
    },
    activityDateField: {
      flex: 1,
    },
    activityDateButton: {
      minHeight: 46,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.inputBorder,
      backgroundColor: palette.formSurface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    activityDateButtonText: {
      flex: 1,
      fontSize: 13,
      color: palette.text,
    },
    activityDateButtonPlaceholder: {
      color: palette.placeholder,
    },
    activityFilterLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: palette.label,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    activityFilterInput: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.inputBorder,
      backgroundColor: palette.formSurface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 13,
      color: palette.text,
    },
    activityFilterHint: {
      fontSize: 12,
      color: palette.mutedText,
    },
    activityList: {
      gap: 14,
    },
    activityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    activityIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.primaryMuted,
      borderWidth: 1,
      borderColor: palette.primaryBorder,
    },
    activityCopy: {
      flex: 1,
      gap: 3,
    },
    activityTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: palette.text,
    },
    activitySubtitle: {
      fontSize: 12,
      color: palette.mutedText,
    },
    activityTime: {
      fontSize: 11,
      color: palette.mutedText,
    },
    activityAmount: {
      fontSize: 14,
      fontWeight: "800",
      color: palette.text,
    },
    toast: {
      position: "absolute",
      left: 18,
      right: 18,
      top: 56,
      zIndex: 30,
      elevation: 30,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
    },
    toastSuccess: {
      backgroundColor: palette.surfaceElevated,
      borderColor: palette.success,
    },
    toastError: {
      backgroundColor: palette.surfaceElevated,
      borderColor: "#ef4444",
    },
    toastText: {
      fontSize: 13,
      fontWeight: "700",
      color: palette.text,
    },
    datePickerCard: {
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      backgroundColor: palette.surface,
      borderWidth: 0.6,
      borderColor: palette.border,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 28,
    },
    datePickerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 8,
    },
    datePickerTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: "800",
      color: palette.text,
    },
    datePickerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    datePickerActionButton: {
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    datePickerActionText: {
      fontSize: 14,
      fontWeight: "700",
      color: palette.primary,
    },
    datePicker: {
      alignSelf: "stretch",
    },
    sheetOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(2, 6, 23, 0.45)",
    },
    sheetBackdrop: {
      flex: 1,
    },
    sheetCard: {
      maxHeight: "86%",
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      backgroundColor: palette.surface,
      borderWidth: 0.6,
      borderColor: palette.border,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 20,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 10,
    },
    sheetHeaderCopy: {
      flex: 1,
      gap: 4,
    },
    sheetTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: palette.text,
    },
    sheetSubtitle: {
      fontSize: 13,
      lineHeight: 19,
      color: palette.mutedText,
    },
    sheetCloseButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
    },
    sheetBody: {
      flexGrow: 0,
    },
    sheetBodyContent: {
      gap: 14,
      paddingBottom: 12,
    },
    scannerCard: {
      position: "relative",
      overflow: "hidden",
      borderRadius: 24,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      minHeight: 280,
    },
    cameraPreview: {
      minHeight: 280,
    },
    cameraOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(2, 6, 23, 0.24)",
    },
    scannerFrame: {
      width: "72%",
      aspectRatio: 1,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: "#ffffff",
      backgroundColor: "transparent",
    },
    scannerPermissionCard: {
      gap: 12,
      alignItems: "center",
      borderRadius: 24,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 18,
      paddingVertical: 24,
    },
    scannerPermissionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: palette.text,
      textAlign: "center",
    },
    scannerPermissionText: {
      fontSize: 13,
      lineHeight: 19,
      color: palette.mutedText,
      textAlign: "center",
    },
    scannerManualEntry: {
      gap: 12,
    },
    scannerStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 18,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    scannerStatusText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "600",
      color: palette.text,
    },
    scannerStatusError: {
      color: "#ef4444",
    },
    scannerResetButton: {
      alignSelf: "center",
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    scannerResetButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: palette.primary,
    },
    choiceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    choiceCard: {
      flex: 1,
      minWidth: 135,
      borderRadius: 22,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 4,
    },
    choiceCardActive: {
      borderColor: palette.primaryBorder,
      backgroundColor: palette.primaryMuted,
    },
    choiceTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: palette.text,
    },
    choiceMeta: {
      fontSize: 12,
      color: palette.mutedText,
    },
    providerRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    providerChip: {
      borderRadius: 999,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    providerChipActive: {
      borderColor: palette.primaryBorder,
      backgroundColor: palette.primaryMuted,
    },
    providerText: {
      fontSize: 12,
      fontWeight: "700",
      color: palette.text,
    },
    previewList: {
      borderRadius: 22,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 8,
      gap: 10,
    },
    previewRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    previewLabel: {
      fontSize: 12,
      color: palette.mutedText,
    },
    previewValue: {
      fontSize: 13,
      fontWeight: "800",
      color: palette.text,
    },
    themeRow: {
      borderRadius: 22,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    themeCopy: {
      flex: 1,
      gap: 4,
    },
    themeTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: palette.text,
    },
    themeDescription: {
      fontSize: 12,
      lineHeight: 18,
      color: palette.mutedText,
    },
    signOutButton: {
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18,
      borderWidth: 0.6,
      borderColor: palette.border,
      backgroundColor: palette.surfaceMuted,
      paddingVertical: 14,
    },
    signOutText: {
      fontSize: 14,
      fontWeight: "800",
      color: palette.text,
    },
  });
