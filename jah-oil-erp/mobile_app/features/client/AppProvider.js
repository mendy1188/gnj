import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { clientAppSettings } from "../../config/clientAppSettings";
import {
  cancelFuelGiftCode as cancelFuelGiftCodeRequest,
  confirmClientPayment,
  createBulkFuelPurchase,
  createFuelGiftCode,
  getClientSession,
  loadClientBootstrap,
  loginClient,
  signupClient,
  updateClientProfile,
} from "./api";

const ClientAppContext = createContext(null);
const CLIENT_SESSION_TOKEN_KEY = "jah_client_session_token";
const CLIENT_RECENT_ACTIVITIES_CACHE_KEY = "jah_client_recent_activities";
const CLIENT_RECENT_ACTIVITIES_CACHE_LIMIT = 25;

const DEFAULT_PROFILE = {
  fullName: "",
  email: "",
  phone: "",
  userType: "individual",
  companyName: "",
  preferredProvider: "wave",
  providerNumbers: {
    wave: "",
    qmoney: "",
    afrimoney: "",
  },
};

function buildDefaultBootstrapData() {
  return {
    session: null,
    profile: DEFAULT_PROFILE,
    rewardSettings: {
      cashBackPercent: 1,
    },
    rewardAccount: {
      balanceAmount: 0,
      totalEarned: 0,
      totalRedeemed: 0,
    },
    fuelProducts: clientAppSettings.buyFuel.fuelProducts,
    mobileMoneyProviders: clientAppSettings.buyFuel.mobileMoneyProviders,
    bulkBalances: [],
    activeGiftCodes: [],
    recentActivities: [],
    couponSummary: {
      purchaseCount: 0,
      activeCouponCount: 0,
      remainingValue: 0,
    },
  };
}

function buildRecentActivitiesCacheKey(userId) {
  return `${CLIENT_RECENT_ACTIVITIES_CACHE_KEY}:${userId}`;
}

function normalizeRecentActivities(activities) {
  return (Array.isArray(activities) ? activities : [])
    .filter((activity) => activity && activity.id)
    .map((activity) => ({
      ...activity,
      amount: Number(activity.amount || 0),
      createdAt: activity.createdAt || "",
    }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || "") || 0;
      const rightTime = Date.parse(right.createdAt || "") || 0;
      return rightTime - leftTime;
    });
}

function normalizeActiveGiftCodes(giftCodes) {
  return (Array.isArray(giftCodes) ? giftCodes : []).filter((gift) => {
    const normalizedStatus = `${gift?.status || ""}`.trim().toLowerCase();
    return (
      normalizedStatus === "active" &&
      !`${gift?.redeemedAt || ""}`.trim() &&
      !`${gift?.receiptId || ""}`.trim()
    );
  });
}

function mergeBootstrapDataWithLocalCache(nextBootstrapData, cachedRecentActivities = []) {
  const normalizedRecentActivities = normalizeRecentActivities(
    nextBootstrapData?.recentActivities,
  );

  return {
    ...buildDefaultBootstrapData(),
    ...nextBootstrapData,
    activeGiftCodes: normalizeActiveGiftCodes(nextBootstrapData?.activeGiftCodes),
    recentActivities:
      normalizedRecentActivities.length > 0
        ? normalizedRecentActivities
        : normalizeRecentActivities(cachedRecentActivities),
  };
}

async function readRecentActivitiesCache(userId) {
  if (!userId) {
    return [];
  }

  try {
    const cachedValue = await SecureStore.getItemAsync(
      buildRecentActivitiesCacheKey(userId),
    );

    if (!cachedValue) {
      return [];
    }

    return normalizeRecentActivities(JSON.parse(cachedValue));
  } catch {
    return [];
  }
}

async function persistRecentActivitiesCache(userId, recentActivities) {
  if (!userId) {
    return;
  }

  try {
    await SecureStore.setItemAsync(
      buildRecentActivitiesCacheKey(userId),
      JSON.stringify(
        normalizeRecentActivities(recentActivities).slice(
          0,
          CLIENT_RECENT_ACTIVITIES_CACHE_LIMIT,
        ),
      ),
    );
  } catch {}
}

async function persistSessionToken(token) {
  if (!token) {
    await SecureStore.deleteItemAsync(CLIENT_SESSION_TOKEN_KEY);
    return;
  }

  await SecureStore.setItemAsync(CLIENT_SESSION_TOKEN_KEY, token);
}

async function readStoredSessionToken() {
  return SecureStore.getItemAsync(CLIENT_SESSION_TOKEN_KEY);
}

export function ClientAppProvider({ children }) {
  const [authStatus, setAuthStatus] = useState("loading");
  const [sessionToken, setSessionToken] = useState("");
  const [session, setSession] = useState(null);
  const [bootstrapData, setBootstrapData] = useState(buildDefaultBootstrapData);
  const [hiddenBalance, setHiddenBalance] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const applyAuthenticatedState = useCallback((token, nextSession, nextBootstrapData) => {
    setSessionToken(token);
    setSession(nextSession);
    setBootstrapData((current) => ({
      ...current,
      ...nextBootstrapData,
      session: nextSession,
    }));
    setAuthStatus("authenticated");
    setAuthError("");
  }, []);

  const clearAuthenticatedState = useCallback(async () => {
    setSessionToken("");
    setSession(null);
    setBootstrapData(buildDefaultBootstrapData());
    setAuthStatus("unauthenticated");
    await persistSessionToken("");
  }, []);

  const refreshBootstrap = useCallback(
    async (tokenOverride = sessionToken) => {
      if (!tokenOverride) {
        return buildDefaultBootstrapData();
      }

      setIsRefreshing(true);

      try {
        const bootstrapResponse = await loadClientBootstrap({
          token: tokenOverride,
        });
        const cacheUserId = bootstrapResponse?.session?.userId || session?.userId;
        const cachedRecentActivities = await readRecentActivitiesCache(cacheUserId);
        const mergedBootstrapData = mergeBootstrapDataWithLocalCache(
          bootstrapResponse,
          cachedRecentActivities,
        );

        setBootstrapData(mergedBootstrapData);
        await persistRecentActivitiesCache(
          cacheUserId,
          mergedBootstrapData.recentActivities,
        );
        return mergedBootstrapData;
      } finally {
        setIsRefreshing(false);
      }
    },
    [session?.userId, sessionToken],
  );

  const restoreSession = useCallback(async () => {
    setAuthStatus("loading");

    try {
      const storedToken = await readStoredSessionToken();

      if (!storedToken) {
        setAuthStatus("unauthenticated");
        return;
      }

      const sessionResponse = await getClientSession({ token: storedToken });
      const cacheUserId = sessionResponse?.session?.userId || "";
      const cachedRecentActivities = await readRecentActivitiesCache(cacheUserId);
      const bootstrapResponse = await loadClientBootstrap({ token: storedToken });
      const mergedBootstrapData = mergeBootstrapDataWithLocalCache(
        bootstrapResponse,
        cachedRecentActivities,
      );

      await persistRecentActivitiesCache(
        cacheUserId,
        mergedBootstrapData.recentActivities,
      );

      applyAuthenticatedState(
        storedToken,
        sessionResponse.session || bootstrapResponse.session,
        mergedBootstrapData,
      );
    } catch (error) {
      setAuthError(error?.message || "Unable to restore your session.");
      await clearAuthenticatedState();
    }
  }, [applyAuthenticatedState, clearAuthenticatedState]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const signIn = useCallback(
    async ({ email, password }) => {
      const loginResponse = await loginClient({ email, password });
      const token = loginResponse.token || "";

      if (!token) {
        throw new Error("Authentication token was not returned.");
      }

      await persistSessionToken(token);
      const bootstrapResponse = await loadClientBootstrap({ token });
      const cacheUserId =
        loginResponse.session?.userId || bootstrapResponse.session?.userId || "";
      const cachedRecentActivities = await readRecentActivitiesCache(cacheUserId);
      const mergedBootstrapData = mergeBootstrapDataWithLocalCache(
        bootstrapResponse,
        cachedRecentActivities,
      );

      await persistRecentActivitiesCache(
        cacheUserId,
        mergedBootstrapData.recentActivities,
      );
      applyAuthenticatedState(
        token,
        loginResponse.session || bootstrapResponse.session,
        mergedBootstrapData,
      );
    },
    [applyAuthenticatedState],
  );

  const signUp = useCallback(
    async (payload) => {
      const signupResponse = await signupClient(payload);
      const token = signupResponse.token || "";

      if (!token) {
        throw new Error("Authentication token was not returned.");
      }

      await persistSessionToken(token);
      const bootstrapResponse = await loadClientBootstrap({ token });
      const cacheUserId =
        signupResponse.session?.userId || bootstrapResponse.session?.userId || "";
      const cachedRecentActivities = await readRecentActivitiesCache(cacheUserId);
      const mergedBootstrapData = mergeBootstrapDataWithLocalCache(
        bootstrapResponse,
        cachedRecentActivities,
      );

      await persistRecentActivitiesCache(
        cacheUserId,
        mergedBootstrapData.recentActivities,
      );
      applyAuthenticatedState(
        token,
        signupResponse.session || bootstrapResponse.session,
        mergedBootstrapData,
      );
    },
    [applyAuthenticatedState],
  );

  const signOut = useCallback(async () => {
    await clearAuthenticatedState();
  }, [clearAuthenticatedState]);

  const saveProfile = useCallback(
    async (profile) => {
      if (!sessionToken) {
        throw new Error("Sign in again before updating your profile.");
      }

      const response = await updateClientProfile({
        token: sessionToken,
        payload: profile,
      });

      setBootstrapData((current) => ({
        ...current,
        profile: {
          ...current.profile,
          ...response.profile,
        },
      }));

      return response.profile;
    },
    [sessionToken],
  );

  const purchaseFuel = useCallback(
    async ({
      qrCode,
      productCode,
      providerCode,
      amount,
      cashbackAmountToRedeem = 0,
    }) => {
      if (!sessionToken) {
        throw new Error("Sign in again before recording this sale.");
      }

      const response = await confirmClientPayment({
        token: sessionToken,
        payload: {
          checkoutType: "fuel_purchase",
          providerCode,
          providerStatus: "confirmed",
          productCode,
          amount: Number(amount || 0),
          cashbackAmountToRedeem: Number(cashbackAmountToRedeem || 0),
          cashierQrCode: qrCode,
          currency: "GMD",
        },
      });

      try {
        await refreshBootstrap(sessionToken);
      } catch {}

      const product =
        bootstrapData.fuelProducts.find((entry) => entry.code === productCode) ||
        clientAppSettings.buyFuel.fuelProducts.find(
          (entry) => entry.code === productCode,
        ) ||
        clientAppSettings.buyFuel.fuelProducts[0];
      const redeemedValue = Number(cashbackAmountToRedeem || 0);
      const payableAmount = Math.max(0, Number(amount || 0) - redeemedValue);

      return {
        ...response,
        product,
        providerCode,
        payableAmount,
        litres: Number(
          (Number(amount || 0) / Number(product?.pricePerLitre || 1)).toFixed(2),
        ),
        earnedCashBack: Number(response?.confirmation?.earnedCashBack || 0),
      };
    },
    [bootstrapData.fuelProducts, refreshBootstrap, sessionToken],
  );

  const fundBulkFuel = useCallback(
    async ({ productCode, providerCode, amount }) => {
      if (!sessionToken) {
        throw new Error("Sign in again before creating a bulk purchase.");
      }

      const response = await createBulkFuelPurchase({
        token: sessionToken,
        payload: {
          productCode,
          providerCode,
          amount: Number(amount || 0),
        },
      });

      try {
        await refreshBootstrap(sessionToken);
      } catch {}
      return response.purchase;
    },
    [refreshBootstrap, sessionToken],
  );

  const redeemBulkFuel = useCallback(
    async ({ qrCode, productCode, amount }) => {
      if (!sessionToken) {
        throw new Error("Sign in again before redeeming bulk fuel.");
      }

      const response = await confirmClientPayment({
        token: sessionToken,
        payload: {
          checkoutType: "bulk_redeem",
          providerCode: "bulk-redeem",
          providerStatus: "confirmed",
          productCode,
          amount: Number(amount || 0),
          cashierQrCode: qrCode,
          currency: "GMD",
        },
      });

      try {
        await refreshBootstrap(sessionToken);
      } catch {}

      return {
        ...response,
        productLabel:
          bootstrapData.bulkBalances.find((entry) => entry.productCode === productCode)
            ?.productName || productCode,
        quantity:
          Number(amount || 0) /
          Number(
            bootstrapData.fuelProducts.find((entry) => entry.code === productCode)
              ?.pricePerLitre || 1,
          ),
      };
    },
    [bootstrapData.bulkBalances, bootstrapData.fuelProducts, refreshBootstrap, sessionToken],
  );

  const generateGiftFuelCode = useCallback(
    async ({ productCode, amount, recipientName }) => {
      if (!sessionToken) {
        throw new Error("Sign in again before creating a fuel gift.");
      }

      const response = await createFuelGiftCode({
        token: sessionToken,
        payload: {
          productCode,
          amount: Number(amount || 0),
          recipientName,
        },
      });

      try {
        await refreshBootstrap(sessionToken);
      } catch {}
      return response.gift;
    },
    [refreshBootstrap, sessionToken],
  );

  const cancelFuelGiftCode = useCallback(
    async (giftId) => {
      if (!sessionToken) {
        throw new Error("Sign in again before cancelling a fuel gift.");
      }

      const response = await cancelFuelGiftCodeRequest({
        token: sessionToken,
        giftId,
      });

      try {
        await refreshBootstrap(sessionToken);
      } catch {}
      return response.gift;
    },
    [refreshBootstrap, sessionToken],
  );

  const rewardBalanceAmount = Number(
    bootstrapData.rewardAccount?.balanceAmount || 0,
  );
  const totalBulkAvailable = Number(
    (bootstrapData.bulkBalances || []).reduce(
      (sum, balance) => sum + Number(balance.availableAmount || 0),
      0,
    ),
  );

  const value = useMemo(
    () => ({
      authStatus,
      isAuthenticated: authStatus === "authenticated",
      isBootstrapping: authStatus === "loading",
      isRefreshing,
      authError,
      session,
      sessionToken,
      hiddenBalance,
      setHiddenBalance,
      fuelProducts: bootstrapData.fuelProducts || clientAppSettings.buyFuel.fuelProducts,
      providers:
        bootstrapData.mobileMoneyProviders ||
        clientAppSettings.buyFuel.mobileMoneyProviders,
      profile: bootstrapData.profile || DEFAULT_PROFILE,
      rewardSettings: bootstrapData.rewardSettings || {
        cashBackPercent: 1,
      },
      rewardBalanceAmount,
      totalBulkAvailable,
      bulkBalanceRows: bootstrapData.bulkBalances || [],
      activeGiftCodes: normalizeActiveGiftCodes(bootstrapData.activeGiftCodes),
      recentActivities: normalizeRecentActivities(bootstrapData.recentActivities),
      couponSummary: bootstrapData.couponSummary || {
        purchaseCount: 0,
        activeCouponCount: 0,
        remainingValue: 0,
      },
      signIn,
      signUp,
      signOut,
      refreshBootstrap,
      updateProfile: saveProfile,
      purchaseFuel,
      fundBulkFuel,
      redeemBulkFuel,
      generateGiftFuelCode,
      cancelFuelGiftCode,
    }),
    [
      authError,
      authStatus,
      bootstrapData.activeGiftCodes,
      bootstrapData.bulkBalances,
      bootstrapData.couponSummary,
      bootstrapData.fuelProducts,
      bootstrapData.mobileMoneyProviders,
      bootstrapData.profile,
      bootstrapData.recentActivities,
      bootstrapData.rewardSettings,
      cancelFuelGiftCode,
      generateGiftFuelCode,
      hiddenBalance,
      isRefreshing,
      purchaseFuel,
      redeemBulkFuel,
      refreshBootstrap,
      rewardBalanceAmount,
      saveProfile,
      session,
      sessionToken,
      signIn,
      signUp,
      signOut,
      totalBulkAvailable,
      fundBulkFuel,
    ],
  );

  return (
    <ClientAppContext.Provider value={value}>
      {children}
    </ClientAppContext.Provider>
  );
}

export function useClientApp() {
  const context = useContext(ClientAppContext);

  if (!context) {
    throw new Error("useClientApp must be used within ClientAppProvider.");
  }

  return context;
}
