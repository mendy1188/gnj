import "server-only";

import { Client, Databases, ID, Query } from "appwrite";

import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  clientUsers: "client_users",
  rewardSettings: "reward_settings",
  rewardAccounts: "client_reward_accounts",
  rewardMovements: "client_reward_movements",
  fuelGiftCodes: "fuel_gift_codes",
  fuelGiftPurchases: "fuel_gift_purchases",
};

const DEFAULT_REWARD_SETTINGS = {
  settingKey: "default",
  cashBackPercent: 1,
  status: "active",
  updatedAt: "",
  updatedByUserId: "",
  updatedByName: "",
};

function createDatabasesClient() {
  if (!hasServerAppwriteConfig()) {
    throw new Error("Missing Appwrite server configuration.");
  }

  const config = getServerAppwriteConfig();
  const client = new Client()
    .setEndpoint(config.apiBaseUrl)
    .setProject(config.projectId);

  client.headers["X-Appwrite-Key"] = config.apiKey;

  return {
    databases: new Databases(client),
    databaseId: config.databaseId,
  };
}

function normalizeUserType(value) {
  return `${value || ""}`.trim().toLowerCase() === "company"
    ? "company"
    : "individual";
}

function normalizeProviderCode(value) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();

  return ["wave", "qmoney", "afrimoney"].includes(normalizedValue)
    ? normalizedValue
    : "wave";
}

function normalizeClientUserDocument(document) {
  return {
    id: document.$id,
    fullName: document.full_name || "",
    email: document.email || "",
    phone: document.phone || "",
    passwordHash: document.password_hash || "",
    userType: normalizeUserType(document.user_type),
    companyName: document.company_name || "",
    preferredProvider: normalizeProviderCode(document.preferred_provider),
    providerNumbers: {
      wave: document.wave_number || "",
      qmoney: document.qmoney_number || "",
      afrimoney: document.afrimoney_number || "",
    },
    mustChangePassword: Boolean(document.must_change_password),
    status: document.status || "active",
    createdAt: document.created_at || "",
    updatedAt: document.updated_at || "",
  };
}

function normalizeRewardSettingsDocument(document) {
  if (!document) {
    return { ...DEFAULT_REWARD_SETTINGS };
  }

  return {
    settingKey: document.setting_key || "default",
    cashBackPercent: Number(document.cashback_percent || 0),
    status: document.status || "active",
    updatedAt: document.updated_at || "",
    updatedByUserId: document.updated_by_user_id || "",
    updatedByName: document.updated_by_name || "",
  };
}

function normalizeRewardAccountDocument(document) {
  if (!document) {
    return null;
  }

  return {
    id: document.$id,
    clientUserId: document.client_user_id || "",
    clientName: document.client_name || "",
    clientPhone: document.client_phone || "",
    balanceAmount: Number(document.balance_amount || 0),
    totalEarned: Number(document.total_earned || 0),
    totalRedeemed: Number(document.total_redeemed || 0),
    status: document.status || "active",
    createdAt: document.created_at || "",
    updatedAt: document.updated_at || "",
  };
}

function normalizeRewardMovementDocument(document) {
  if (!document) {
    return null;
  }

  return {
    id: document.$id,
    accountId: document.account_id || "",
    clientUserId: document.client_user_id || "",
    clientName: document.client_name || "",
    clientPhone: document.client_phone || "",
    receiptId: document.receipt_id || "",
    receiptNumber: document.receipt_number || "",
    stationId: document.station_id || "",
    stationName: document.station_name || "",
    direction: document.direction || "",
    movementType: document.movement_type || "",
    amountDelta: Number(document.amount_delta || 0),
    balanceAfter: Number(document.balance_after || 0),
    actorUserId: document.actor_user_id || "",
    actorName: document.actor_name || "",
    referenceCode: document.reference_code || "",
    notes: document.notes || "",
    movementDate: document.movement_date || "",
  };
}

function normalizeFuelGiftCodeDocument(document) {
  return {
    id: document.$id,
    code: document.code || "",
    clientUserId: document.client_user_id || "",
    clientName: document.client_name || "",
    clientPhone: document.client_phone || "",
    productCode: document.product_code || "",
    productName: document.product_name || "",
    amount: Number(document.amount || 0),
    recipientName: document.recipient_name || "",
    status: document.status || "active",
    cashierUserId: document.cashier_user_id || "",
    cashierName: document.cashier_name || "",
    stationId: document.station_id || "",
    stationName: document.station_name || "",
    receiptId: document.receipt_id || "",
    receiptNumber: document.receipt_number || "",
    notes: document.notes || "",
    createdAt: document.created_at || "",
    redeemedAt: document.redeemed_at || "",
  };
}

function normalizeFuelGiftPurchaseDocument(document) {
  return {
    id: document.$id,
    giftCodeId: document.gift_code_id || "",
    giftCode: document.gift_code || "",
    clientUserId: document.client_user_id || "",
    clientName: document.client_name || "",
    clientPhone: document.client_phone || "",
    productCode: document.product_code || "",
    productName: document.product_name || "",
    amount: Number(document.amount || 0),
    recipientName: document.recipient_name || "",
    status: document.status || "active",
    cashierUserId: document.cashier_user_id || "",
    cashierName: document.cashier_name || "",
    stationId: document.station_id || "",
    stationName: document.station_name || "",
    receiptId: document.receipt_id || "",
    receiptNumber: document.receipt_number || "",
    notes: document.notes || "",
    createdAt: document.created_at || "",
    updatedAt: document.updated_at || "",
    redeemedAt: document.redeemed_at || "",
    cancelledAt: document.cancelled_at || "",
  };
}

function isMissingCollectionError(error) {
  return `${error?.message || ""}`.toLowerCase().includes("not found");
}

function appendNote(existingNotes, nextNote) {
  const normalizedExisting = `${existingNotes || ""}`.trim();
  const normalizedNext = `${nextNote || ""}`.trim();

  if (!normalizedNext) {
    return normalizedExisting;
  }

  if (!normalizedExisting) {
    return normalizedNext;
  }

  if (normalizedExisting.includes(normalizedNext)) {
    return normalizedExisting;
  }

  return `${normalizedExisting} ${normalizedNext}`.trim();
}

function normalizeClientUserPayload(payload = {}) {
  return {
    fullName: `${payload.fullName || ""}`.trim(),
    email: `${payload.email || ""}`.trim().toLowerCase(),
    phone: `${payload.phone || ""}`.trim(),
    userType: normalizeUserType(payload.userType),
    companyName: `${payload.companyName || ""}`.trim(),
    preferredProvider: normalizeProviderCode(payload.preferredProvider),
    providerNumbers: {
      wave: `${payload.providerNumbers?.wave || payload.waveNumber || ""}`.trim(),
      qmoney: `${payload.providerNumbers?.qmoney || payload.qmoneyNumber || ""}`.trim(),
      afrimoney: `${payload.providerNumbers?.afrimoney || payload.afrimoneyNumber || ""}`.trim(),
    },
    mustChangePassword: Boolean(payload.mustChangePassword),
    status: `${payload.status || "active"}`.trim().toLowerCase() === "inactive"
      ? "inactive"
      : "active",
  };
}

export async function listClientUsers() {
  const { databases, databaseId } = createDatabasesClient();
  const response = await databases.listDocuments(databaseId, COLLECTIONS.clientUsers, [
    Query.limit(200),
    Query.orderAsc("full_name"),
  ]);

  return (response.documents || []).map(normalizeClientUserDocument);
}

export async function findClientUserByEmail(email) {
  const normalizedEmail = `${email || ""}`.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const { databases, databaseId } = createDatabasesClient();
  const response = await databases.listDocuments(databaseId, COLLECTIONS.clientUsers, [
    Query.equal("email", normalizedEmail),
    Query.limit(1),
  ]);

  return response.documents?.[0]
    ? normalizeClientUserDocument(response.documents[0])
    : null;
}

export async function findClientUserByPhone(phone) {
  const normalizedPhone = `${phone || ""}`.trim();

  if (!normalizedPhone) {
    return null;
  }

  const { databases, databaseId } = createDatabasesClient();
  const response = await databases.listDocuments(databaseId, COLLECTIONS.clientUsers, [
    Query.equal("phone", normalizedPhone),
    Query.limit(1),
  ]);

  return response.documents?.[0]
    ? normalizeClientUserDocument(response.documents[0])
    : null;
}

export async function getClientUserById(userId) {
  if (!userId) {
    return null;
  }

  const { databases, databaseId } = createDatabasesClient();
  const document = await databases.getDocument(databaseId, COLLECTIONS.clientUsers, userId);
  return normalizeClientUserDocument(document);
}

export async function createClientUserRecord({
  fullName,
  email,
  phone,
  passwordHash,
  userType = "individual",
  companyName = "",
  preferredProvider = "wave",
  providerNumbers = {},
  mustChangePassword = false,
  status = "active",
}) {
  const payload = normalizeClientUserPayload({
    fullName,
    email,
    phone,
    userType,
    companyName,
    preferredProvider,
    providerNumbers,
    mustChangePassword,
    status,
  });

  const { databases, databaseId } = createDatabasesClient();
  const timestamp = new Date().toISOString();
  const document = await databases.createDocument(
    databaseId,
    COLLECTIONS.clientUsers,
    ID.unique(),
    {
      full_name: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      password_hash: passwordHash,
      user_type: payload.userType,
      company_name: payload.companyName,
      preferred_provider: payload.preferredProvider,
      wave_number: payload.providerNumbers.wave,
      qmoney_number: payload.providerNumbers.qmoney,
      afrimoney_number: payload.providerNumbers.afrimoney,
      must_change_password: payload.mustChangePassword,
      status: payload.status,
      created_at: timestamp,
      updated_at: timestamp,
    },
  );

  const user = normalizeClientUserDocument(document);
  await ensureClientRewardAccount({
    clientUserId: user.id,
    clientName: user.fullName,
    clientPhone: user.phone,
  });

  return user;
}

export async function updateClientUserProfile(userId, payload = {}) {
  if (!userId) {
    throw new Error("Client user ID is required.");
  }

  const values = normalizeClientUserPayload(payload);
  const { databases, databaseId } = createDatabasesClient();
  const document = await databases.updateDocument(
    databaseId,
    COLLECTIONS.clientUsers,
    userId,
    {
      full_name: values.fullName,
      phone: values.phone,
      company_name: values.companyName,
      preferred_provider: values.preferredProvider,
      wave_number: values.providerNumbers.wave,
      qmoney_number: values.providerNumbers.qmoney,
      afrimoney_number: values.providerNumbers.afrimoney,
      updated_at: new Date().toISOString(),
    },
  );

  const user = normalizeClientUserDocument(document);
  await ensureClientRewardAccount({
    clientUserId: user.id,
    clientName: user.fullName,
    clientPhone: user.phone,
  });

  return user;
}

export async function getRewardSettings() {
  try {
    const { databases, databaseId } = createDatabasesClient();
    const response = await databases.listDocuments(databaseId, COLLECTIONS.rewardSettings, [
      Query.equal("setting_key", "default"),
      Query.limit(1),
    ]);

    return normalizeRewardSettingsDocument(response.documents?.[0] || null);
  } catch (error) {
    if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
      return { ...DEFAULT_REWARD_SETTINGS };
    }

    throw error;
  }
}

export async function saveRewardSettings({
  cashBackPercent,
  status = "active",
  updatedByUserId = "",
  updatedByName = "",
}) {
  const numericPercent = Number(cashBackPercent ?? 0);

  if (!Number.isFinite(numericPercent) || numericPercent < 0) {
    throw new Error("Cash back percent must be zero or greater.");
  }

  const currentSettings = await getRewardSettings();
  const { databases, databaseId } = createDatabasesClient();
  const timestamp = new Date().toISOString();

  const existingResponse = await databases.listDocuments(
    databaseId,
    COLLECTIONS.rewardSettings,
    [Query.equal("setting_key", "default"), Query.limit(1)],
  );

  const document = existingResponse.documents?.[0]
    ? await databases.updateDocument(
        databaseId,
        COLLECTIONS.rewardSettings,
        existingResponse.documents[0].$id,
        {
          cashback_percent: Number(numericPercent.toFixed(4)),
          status: `${status || "active"}`.trim().toLowerCase() === "inactive"
            ? "inactive"
            : "active",
          updated_by_user_id: updatedByUserId,
          updated_by_name: updatedByName,
          updated_at: timestamp,
        },
      )
    : await databases.createDocument(
        databaseId,
        COLLECTIONS.rewardSettings,
        ID.unique(),
        {
          setting_key: currentSettings.settingKey || "default",
          cashback_percent: Number(numericPercent.toFixed(4)),
          status: `${status || "active"}`.trim().toLowerCase() === "inactive"
            ? "inactive"
            : "active",
          updated_by_user_id: updatedByUserId,
          updated_by_name: updatedByName,
          updated_at: timestamp,
        },
      );

  return normalizeRewardSettingsDocument(document);
}

export async function getClientRewardAccountByClientUserId(clientUserId) {
  if (!clientUserId) {
    return null;
  }

  try {
    const { databases, databaseId } = createDatabasesClient();
    const response = await databases.listDocuments(databaseId, COLLECTIONS.rewardAccounts, [
      Query.equal("client_user_id", clientUserId),
      Query.limit(1),
    ]);

    return normalizeRewardAccountDocument(response.documents?.[0] || null);
  } catch (error) {
    if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
      return null;
    }

    throw error;
  }
}

export async function ensureClientRewardAccount({
  clientUserId,
  clientName,
  clientPhone,
}) {
  if (!clientUserId) {
    throw new Error("Client user ID is required.");
  }

  const existingAccount = await getClientRewardAccountByClientUserId(clientUserId);

  if (existingAccount) {
    const { databases, databaseId } = createDatabasesClient();
    const updatedDocument = await databases.updateDocument(
      databaseId,
      COLLECTIONS.rewardAccounts,
      existingAccount.id,
      {
        client_name: clientName || existingAccount.clientName,
        client_phone: clientPhone || existingAccount.clientPhone,
        updated_at: new Date().toISOString(),
      },
    );

    return normalizeRewardAccountDocument(updatedDocument);
  }

  const { databases, databaseId } = createDatabasesClient();
  const timestamp = new Date().toISOString();
  const document = await databases.createDocument(
    databaseId,
    COLLECTIONS.rewardAccounts,
    ID.unique(),
    {
      client_user_id: clientUserId,
      client_name: clientName || "",
      client_phone: clientPhone || "",
      balance_amount: 0,
      total_earned: 0,
      total_redeemed: 0,
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    },
  );

  return normalizeRewardAccountDocument(document);
}

async function createRewardMovement({
  accountId,
  clientUserId,
  clientName,
  clientPhone,
  receiptId = "",
  receiptNumber = "",
  stationId = "",
  stationName = "",
  direction,
  movementType,
  amountDelta,
  balanceAfter,
  actorUserId = "",
  actorName = "",
  referenceCode = "",
  notes = "",
}) {
  const { databases, databaseId } = createDatabasesClient();
  await databases.createDocument(databaseId, COLLECTIONS.rewardMovements, ID.unique(), {
    account_id: accountId,
    client_user_id: clientUserId,
    client_name: clientName,
    client_phone: clientPhone,
    receipt_id: receiptId,
    receipt_number: receiptNumber,
    station_id: stationId,
    station_name: stationName,
    direction,
    movement_type: movementType,
    amount_delta: Number(amountDelta.toFixed(2)),
    balance_after: Number(balanceAfter.toFixed(2)),
    actor_user_id: actorUserId,
    actor_name: actorName,
    reference_code: referenceCode,
    notes,
    movement_date: new Date().toISOString(),
  });
}

async function findRewardMovementByReferenceCode(referenceCode, movementType = "") {
  const normalizedReferenceCode = `${referenceCode || ""}`.trim();

  if (!normalizedReferenceCode) {
    return null;
  }

  const { databases, databaseId } = createDatabasesClient();
  const queries = [Query.equal("reference_code", normalizedReferenceCode), Query.limit(1)];

  if (`${movementType || ""}`.trim()) {
    queries.unshift(Query.equal("movement_type", `${movementType || ""}`.trim()));
  }

  const response = await databases.listDocuments(databaseId, COLLECTIONS.rewardMovements, queries);
  return normalizeRewardMovementDocument(response.documents?.[0] || null);
}

async function getRewardAccountById(accountId) {
  const normalizedAccountId = `${accountId || ""}`.trim();

  if (!normalizedAccountId) {
    return null;
  }

  const { databases, databaseId } = createDatabasesClient();

  try {
    const document = await databases.getDocument(
      databaseId,
      COLLECTIONS.rewardAccounts,
      normalizedAccountId,
    );

    return normalizeRewardAccountDocument(document);
  } catch (error) {
    if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
      return null;
    }

    throw error;
  }
}

export async function getClientRewardEarnReversalCandidate({
  receiptId = "",
  receiptNumber = "",
} = {}) {
  const referenceBase = `${receiptNumber || receiptId || ""}`.trim();

  if (!referenceBase) {
    return {
      status: "not-applicable",
      amount: 0,
      rewardAccount: null,
      earnMovement: null,
      reversalMovement: null,
      reversalReferenceCode: "",
    };
  }

  const earnReferenceCode = `${referenceBase}-cashback-earn`;
  const reversalReferenceCode = `${referenceBase}-cashback-reversal`;
  const [earnMovement, reversalMovement] = await Promise.all([
    findRewardMovementByReferenceCode(earnReferenceCode, "earn"),
    findRewardMovementByReferenceCode(reversalReferenceCode, "reversal"),
  ]);

  if (!earnMovement) {
    return {
      status: "not-applicable",
      amount: 0,
      rewardAccount: null,
      earnMovement: null,
      reversalMovement,
      reversalReferenceCode,
    };
  }

  const rewardAccount =
    (await getRewardAccountById(earnMovement.accountId)) ||
    (earnMovement.clientUserId
      ? await getClientRewardAccountByClientUserId(earnMovement.clientUserId)
      : null);

  return {
    status: reversalMovement ? "already-reversed" : "ready",
    amount: Number(earnMovement.amountDelta || 0),
    rewardAccount,
    earnMovement,
    reversalMovement,
    reversalReferenceCode,
  };
}

export async function reverseClientRewardEarnForReceipt({
  receiptId = "",
  receiptNumber = "",
  actorUserId = "",
  actorName = "",
  notes = "",
} = {}) {
  const candidate = await getClientRewardEarnReversalCandidate({
    receiptId,
    receiptNumber,
  });

  if (candidate.status !== "ready") {
    return {
      reversedCashBack: 0,
      rewardAccount: candidate.rewardAccount || null,
      status: candidate.status,
    };
  }

  const rewardAccount = candidate.rewardAccount;
  const earnMovement = candidate.earnMovement;
  const reversalAmount = Number(candidate.amount || 0);

  if (!rewardAccount || !earnMovement || reversalAmount <= 0) {
    return {
      reversedCashBack: 0,
      rewardAccount: rewardAccount || null,
      status: "not-applicable",
    };
  }

  const currentBalance = Number(rewardAccount.balanceAmount || 0);

  if (currentBalance + 0.009 < reversalAmount) {
    throw new Error(
      "This sale already granted cash back that has since been used. Restore the client's reward balance before reversing the sale.",
    );
  }

  const nextBalance = Number((currentBalance - reversalAmount).toFixed(2));
  const nextTotalEarned = Number(
    Math.max(0, Number(rewardAccount.totalEarned || 0) - reversalAmount).toFixed(2),
  );
  const { databases, databaseId } = createDatabasesClient();
  const updatedDocument = await databases.updateDocument(
    databaseId,
    COLLECTIONS.rewardAccounts,
    rewardAccount.id,
    {
      client_name: earnMovement.clientName || rewardAccount.clientName,
      client_phone: earnMovement.clientPhone || rewardAccount.clientPhone,
      balance_amount: nextBalance,
      total_earned: nextTotalEarned,
      total_redeemed: Number(rewardAccount.totalRedeemed || 0),
      updated_at: new Date().toISOString(),
    },
  );

  await createRewardMovement({
    accountId: rewardAccount.id,
    clientUserId: earnMovement.clientUserId,
    clientName: earnMovement.clientName || rewardAccount.clientName,
    clientPhone: earnMovement.clientPhone || rewardAccount.clientPhone,
    receiptId: earnMovement.receiptId || receiptId,
    receiptNumber: earnMovement.receiptNumber || receiptNumber,
    stationId: earnMovement.stationId || "",
    stationName: earnMovement.stationName || "",
    direction: "debit",
    movementType: "reversal",
    amountDelta: reversalAmount,
    balanceAfter: nextBalance,
    actorUserId,
    actorName,
    referenceCode: candidate.reversalReferenceCode,
    notes: notes || "Cash back reversed because the underlying sale was voided.",
  });

  return {
    reversedCashBack: reversalAmount,
    rewardAccount: normalizeRewardAccountDocument(updatedDocument),
    status: "reversed",
  };
}

export async function applyClientRewardMovement({
  clientUserId,
  clientName,
  clientPhone,
  direction,
  movementType,
  amount,
  receiptId = "",
  receiptNumber = "",
  stationId = "",
  stationName = "",
  actorUserId = "",
  actorName = "",
  referenceCode = "",
  notes = "",
}) {
  const normalizedAmount = Number(amount || 0);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return getClientRewardAccountByClientUserId(clientUserId);
  }

  if (referenceCode) {
    const { databases, databaseId } = createDatabasesClient();
    const duplicateMovementResponse = await databases.listDocuments(
      databaseId,
      COLLECTIONS.rewardMovements,
      [
        Query.equal("client_user_id", clientUserId),
        Query.equal("reference_code", referenceCode),
        Query.equal("movement_type", movementType),
        Query.limit(1),
      ],
    );

    if (duplicateMovementResponse.documents?.[0]) {
      return getClientRewardAccountByClientUserId(clientUserId);
    }
  }

  const account = await ensureClientRewardAccount({
    clientUserId,
    clientName,
    clientPhone,
  });
  const { databases, databaseId } = createDatabasesClient();
  const signedDelta =
    direction === "debit"
      ? -Math.abs(normalizedAmount)
      : Math.abs(normalizedAmount);
  const nextBalance = Number((Number(account.balanceAmount || 0) + signedDelta).toFixed(2));

  if (nextBalance < 0) {
    throw new Error("Reward balance is not enough for this redemption.");
  }

  const totalEarned =
    direction === "credit"
      ? Number((Number(account.totalEarned || 0) + Math.abs(normalizedAmount)).toFixed(2))
      : Number(account.totalEarned || 0);
  const totalRedeemed =
    direction === "debit"
      ? Number((Number(account.totalRedeemed || 0) + Math.abs(normalizedAmount)).toFixed(2))
      : Number(account.totalRedeemed || 0);

  const updatedDocument = await databases.updateDocument(
    databaseId,
    COLLECTIONS.rewardAccounts,
    account.id,
    {
      client_name: clientName || account.clientName,
      client_phone: clientPhone || account.clientPhone,
      balance_amount: nextBalance,
      total_earned: totalEarned,
      total_redeemed: totalRedeemed,
      updated_at: new Date().toISOString(),
    },
  );

  await createRewardMovement({
    accountId: account.id,
    clientUserId,
    clientName: clientName || account.clientName,
    clientPhone: clientPhone || account.clientPhone,
    receiptId,
    receiptNumber,
    stationId,
    stationName,
    direction,
    movementType,
    amountDelta: Math.abs(normalizedAmount),
    balanceAfter: nextBalance,
    actorUserId,
    actorName,
    referenceCode,
    notes,
  });

  return normalizeRewardAccountDocument(updatedDocument);
}

export async function creditClientRewardForSale({
  clientUserId,
  clientName,
  clientPhone,
  amount,
  cashBackPercent,
  receiptId = "",
  receiptNumber = "",
  stationId = "",
  stationName = "",
  actorUserId = "",
  actorName = "",
  notes = "",
}) {
  const normalizedAmount = Number(amount || 0);
  const normalizedPercent = Number(cashBackPercent || 0);

  if (
    !clientUserId ||
    !Number.isFinite(normalizedAmount) ||
    normalizedAmount <= 0 ||
    !Number.isFinite(normalizedPercent) ||
    normalizedPercent <= 0
  ) {
    return {
      earnedCashBack: 0,
      rewardAccount: clientUserId
        ? await getClientRewardAccountByClientUserId(clientUserId)
        : null,
    };
  }

  const earnedCashBack = Number(
    ((normalizedAmount * normalizedPercent) / 100).toFixed(2),
  );

  if (!Number.isFinite(earnedCashBack) || earnedCashBack <= 0) {
    return {
      earnedCashBack: 0,
      rewardAccount: await getClientRewardAccountByClientUserId(clientUserId),
    };
  }

  const rewardAccount = await applyClientRewardMovement({
    clientUserId,
    clientName,
    clientPhone,
    direction: "credit",
    movementType: "earn",
    amount: earnedCashBack,
    receiptId,
    receiptNumber,
    stationId,
    stationName,
    actorUserId,
    actorName,
    referenceCode: `${receiptNumber || receiptId || "sale"}-cashback-earn`,
    notes: notes || "Earned from sale.",
  });

  return {
    earnedCashBack,
    rewardAccount,
  };
}

export async function listClientRewardMovementsByClientUserId(clientUserId) {
  if (!clientUserId) {
    return [];
  }

  try {
    const { databases, databaseId } = createDatabasesClient();
    const response = await databases.listDocuments(databaseId, COLLECTIONS.rewardMovements, [
      Query.equal("client_user_id", clientUserId),
      Query.limit(100),
      Query.orderDesc("movement_date"),
    ]);

    return (response.documents || []).map((document) => ({
      id: document.$id,
      accountId: document.account_id || "",
      clientUserId: document.client_user_id || "",
      clientName: document.client_name || "",
      clientPhone: document.client_phone || "",
      receiptId: document.receipt_id || "",
      receiptNumber: document.receipt_number || "",
      stationId: document.station_id || "",
      stationName: document.station_name || "",
      direction: document.direction || "",
      movementType: document.movement_type || "",
      amountDelta: Number(document.amount_delta || 0),
      balanceAfter: Number(document.balance_after || 0),
      actorUserId: document.actor_user_id || "",
      actorName: document.actor_name || "",
      referenceCode: document.reference_code || "",
      notes: document.notes || "",
      movementDate: document.movement_date || "",
    }));
  } catch (error) {
    if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
      return [];
    }

    throw error;
  }
}

export async function listFuelGiftCodesByClientUserId(clientUserId) {
  if (!clientUserId) {
    return [];
  }

  try {
    const { databases, databaseId } = createDatabasesClient();
    const response = await databases.listDocuments(databaseId, COLLECTIONS.fuelGiftCodes, [
      Query.equal("client_user_id", clientUserId),
      Query.limit(100),
      Query.orderDesc("created_at"),
    ]);

    return (response.documents || []).map(normalizeFuelGiftCodeDocument);
  } catch (error) {
    if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
      return [];
    }

    throw error;
  }
}

export async function listFuelGiftPurchasesByClientUserId(clientUserId) {
  const normalizedClientUserId = `${clientUserId || ""}`.trim();

  if (!normalizedClientUserId) {
    return [];
  }

  try {
    const { databases, databaseId } = createDatabasesClient();
    const response = await databases.listDocuments(databaseId, COLLECTIONS.fuelGiftPurchases, [
      Query.equal("client_user_id", normalizedClientUserId),
      Query.limit(100),
      Query.orderDesc("created_at"),
    ]);

    return (response.documents || []).map(normalizeFuelGiftPurchaseDocument);
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return [];
    }

    throw error;
  }
}

export async function findFuelGiftCodeByCode(code) {
  const normalizedCode = `${code || ""}`.trim().toUpperCase();

  if (!normalizedCode) {
    return null;
  }

  try {
    const { databases, databaseId } = createDatabasesClient();
    const response = await databases.listDocuments(databaseId, COLLECTIONS.fuelGiftCodes, [
      Query.equal("code", normalizedCode),
      Query.limit(1),
    ]);

    return response.documents?.[0]
      ? normalizeFuelGiftCodeDocument(response.documents[0])
      : null;
  } catch (error) {
    if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
      return null;
    }

    throw error;
  }
}

export async function createFuelGiftCode({
  clientUserId,
  clientName,
  clientPhone,
  productCode,
  productName,
  amount,
  recipientName,
  notes = "",
}) {
  const normalizedAmount = Number(amount || 0);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("Gift amount must be greater than zero.");
  }

  const code = `FG-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  const { databases, databaseId } = createDatabasesClient();
  const document = await databases.createDocument(
    databaseId,
    COLLECTIONS.fuelGiftCodes,
    ID.unique(),
    {
      code,
      client_user_id: clientUserId,
      client_name: clientName,
      client_phone: clientPhone,
      product_code: productCode,
      product_name: productName,
      amount: Number(normalizedAmount.toFixed(2)),
      recipient_name: `${recipientName || ""}`.trim() || "Recipient",
      status: "active",
      cashier_user_id: "",
      cashier_name: "",
      station_id: "",
      station_name: "",
      receipt_id: "",
      receipt_number: "",
      notes,
      created_at: new Date().toISOString(),
    },
  );

  return normalizeFuelGiftCodeDocument(document);
}

export async function createFuelGiftPurchase({
  giftCodeId,
  giftCode,
  clientUserId,
  clientName,
  clientPhone,
  productCode,
  productName,
  amount,
  recipientName,
  status = "active",
  createdAt = "",
  notes = "",
}) {
  const normalizedAmount = Number(amount || 0);

  if (!giftCodeId || !giftCode) {
    throw new Error("Fuel gift purchase could not be recorded because the gift code is missing.");
  }

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("Fuel gift purchase amount must be greater than zero.");
  }

  try {
    const { databases, databaseId } = createDatabasesClient();
    const timestamp = createdAt || new Date().toISOString();
    const document = await databases.createDocument(
      databaseId,
      COLLECTIONS.fuelGiftPurchases,
      ID.unique(),
      {
        gift_code_id: giftCodeId,
        gift_code: giftCode,
        client_user_id: clientUserId,
        client_name: clientName,
        client_phone: clientPhone,
        product_code: productCode,
        product_name: productName,
        amount: Number(normalizedAmount.toFixed(2)),
        recipient_name: `${recipientName || ""}`.trim() || "Recipient",
        status: `${status || "active"}`.trim().toLowerCase() || "active",
        cashier_user_id: "",
        cashier_name: "",
        station_id: "",
        station_name: "",
        receipt_id: "",
        receipt_number: "",
        notes,
        created_at: timestamp,
        updated_at: timestamp,
      },
    );

    return normalizeFuelGiftPurchaseDocument(document);
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return null;
    }

    throw error;
  }
}

export async function syncFuelGiftPurchaseByGiftCodeId({
  giftCodeId,
  status,
  cashierUserId = "",
  cashierName = "",
  stationId = "",
  stationName = "",
  receiptId = "",
  receiptNumber = "",
  redeemedAt = "",
  cancelledAt = "",
  notes = "",
}) {
  const normalizedGiftCodeId = `${giftCodeId || ""}`.trim();

  if (!normalizedGiftCodeId) {
    return null;
  }

  try {
    const { databases, databaseId } = createDatabasesClient();
    const response = await databases.listDocuments(databaseId, COLLECTIONS.fuelGiftPurchases, [
      Query.equal("gift_code_id", normalizedGiftCodeId),
      Query.limit(1),
    ]);
    const purchaseDocument = response.documents?.[0] || null;

    if (!purchaseDocument) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const updatedDocument = await databases.updateDocument(
      databaseId,
      COLLECTIONS.fuelGiftPurchases,
      purchaseDocument.$id,
      {
        status: `${status || purchaseDocument.status || "active"}`
          .trim()
          .toLowerCase(),
        cashier_user_id: cashierUserId || "",
        cashier_name: cashierName || "",
        station_id: stationId || "",
        station_name: stationName || "",
        receipt_id: receiptId || "",
        receipt_number: receiptNumber || "",
        notes: appendNote(purchaseDocument.notes, notes),
        updated_at: timestamp,
        redeemed_at: redeemedAt || null,
        cancelled_at: cancelledAt || null,
      },
    );

    return normalizeFuelGiftPurchaseDocument(updatedDocument);
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return null;
    }

    throw error;
  }
}

export async function cancelFuelGiftCode({
  giftId,
  clientUserId,
  actorName = "",
}) {
  const normalizedGiftId = `${giftId || ""}`.trim();
  const normalizedClientUserId = `${clientUserId || ""}`.trim();

  if (!normalizedGiftId) {
    throw new Error("Gift code could not be found.");
  }

  if (!normalizedClientUserId) {
    throw new Error("Client account could not be found.");
  }

  const { databases, databaseId } = createDatabasesClient();
  const document = await databases.getDocument(
    databaseId,
    COLLECTIONS.fuelGiftCodes,
    normalizedGiftId,
  );
  const normalizedDocument = normalizeFuelGiftCodeDocument(document);

  if (!normalizedDocument) {
    throw new Error("Gift code could not be found.");
  }

  if (`${normalizedDocument.clientUserId || ""}`.trim() !== normalizedClientUserId) {
    throw new Error("You cannot cancel this gift code.");
  }

  if (`${normalizedDocument.status || ""}`.trim().toLowerCase() !== "active") {
    throw new Error("Only active gift codes can be cancelled.");
  }

  if (normalizedDocument.receiptId || normalizedDocument.redeemedAt) {
    throw new Error("This gift code has already been redeemed and cannot be cancelled.");
  }

  const cancellationNote = `Cancelled from the client app${
    actorName ? ` by ${actorName}` : ""
  } on ${new Date().toISOString()}.`;
  const nextNotes = [normalizedDocument.notes, cancellationNote]
    .filter(Boolean)
    .join(" ");

  const updatedDocument = await databases.updateDocument(
    databaseId,
    COLLECTIONS.fuelGiftCodes,
    normalizedGiftId,
    {
      status: "cancelled",
      notes: nextNotes,
    },
  );

  return normalizeFuelGiftCodeDocument(updatedDocument);
}

export { COLLECTIONS as CLIENT_USER_COLLECTIONS };
