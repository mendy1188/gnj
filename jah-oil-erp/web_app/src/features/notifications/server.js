import "server-only";

import { Client, Databases, ID, Query } from "appwrite";

import { listUsers } from "@/features/auth/data";
import { ROLE_NAMES } from "@/features/auth/session";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  customerBalances: "customer_balances",
  notifications: "notifications",
  notificationDeliveries: "notification_deliveries",
  notificationSettings: "notification_settings",
};

const DEFAULT_CREDIT_DUE_LOOKAHEAD_DAYS = Number.parseInt(
  process.env.CREDIT_DUE_NOTIFICATION_DAYS_BEFORE || "3",
  10,
);

const DEFAULT_NOTIFICATION_SETTINGS = {
  settingKey: "default",
  creditDueLookaheadDays: Number.isFinite(DEFAULT_CREDIT_DUE_LOOKAHEAD_DAYS)
    ? Math.max(0, DEFAULT_CREDIT_DUE_LOOKAHEAD_DAYS)
    : 3,
  popupEnabled: true,
  emailEnabled: false,
  smsEnabled: false,
  dailyRunHour: 8,
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

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function toDateOnly(value) {
  const parsedDate = value ? new Date(value) : new Date();

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toISOString().slice(0, 10);
}

function formatCurrency(value) {
  return `D${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDisplayDate(value) {
  const parsedDate = value ? new Date(`${value}T00:00:00.000Z`) : null;

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return "not set";
  }

  return parsedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function normalizeNotificationDocument(document) {
  return {
    id: document.$id,
    title: document.title || "",
    message: document.message || "",
    type: document.type || "system",
    priority: document.priority || "info",
    status: document.status || "unread",
    referenceType: document.reference_type || "",
    referenceId: document.reference_id || "",
    createdAt: document.created_at || "",
    readAt: document.read_at || "",
  };
}

function normalizeNotificationSettingsDocument(document) {
  if (!document) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  const lookaheadDays = Number.parseInt(
    document.credit_due_lookahead_days ?? DEFAULT_NOTIFICATION_SETTINGS.creditDueLookaheadDays,
    10,
  );
  const dailyRunHour = Number.parseInt(
    document.daily_run_hour ?? DEFAULT_NOTIFICATION_SETTINGS.dailyRunHour,
    10,
  );

  return {
    settingKey: document.setting_key || "default",
    creditDueLookaheadDays: Number.isFinite(lookaheadDays)
      ? Math.max(0, lookaheadDays)
      : DEFAULT_NOTIFICATION_SETTINGS.creditDueLookaheadDays,
    popupEnabled: document.popup_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.popupEnabled,
    emailEnabled: document.email_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.emailEnabled,
    smsEnabled: document.sms_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.smsEnabled,
    dailyRunHour: Number.isFinite(dailyRunHour)
      ? Math.min(23, Math.max(0, dailyRunHour))
      : DEFAULT_NOTIFICATION_SETTINGS.dailyRunHour,
    status: document.status || "active",
    updatedAt: document.updated_at || "",
    updatedByUserId: document.updated_by_user_id || "",
    updatedByName: document.updated_by_name || "",
  };
}

function buildCreditNotificationCopy(account, bucket) {
  const customerName = account.customer_name || "Credit customer";
  const stationName = account.station_name || "Unassigned station";
  const dueDate = account.due_date || "";
  const balanceAmount = Number(account.balance_amount || 0);
  const formattedAmount = formatCurrency(balanceAmount);
  const formattedDueDate = formatDisplayDate(dueDate);

  if (bucket === "overdue") {
    return {
      title: `Overdue credit: ${customerName}`,
      message: `${customerName} has an overdue credit balance of ${formattedAmount} for ${stationName}. Due date was ${formattedDueDate}.`,
      priority: "critical",
      type: "credit_overdue",
    };
  }

  if (bucket === "due_today") {
    return {
      title: `Credit due today: ${customerName}`,
      message: `${customerName} has a credit balance of ${formattedAmount} due today for ${stationName}.`,
      priority: "warning",
      type: "credit_due",
    };
  }

  return {
    title: `Credit due soon: ${customerName}`,
    message: `${customerName} has a credit balance of ${formattedAmount} due on ${formattedDueDate} for ${stationName}.`,
    priority: "info",
    type: "credit_due",
  };
}

function getCreditNotificationBucket(dueDate, todayDateString) {
  if (dueDate < todayDateString) {
    return "overdue";
  }

  if (dueDate === todayDateString) {
    return "due_today";
  }

  return "due_soon";
}

function canReceiveCreditNotification(user, account) {
  const roleName = user.roleName || "";

  if (
    [ROLE_NAMES.ADMIN, ROLE_NAMES.GENERAL_MANAGER, ROLE_NAMES.FINANCE].includes(
      roleName,
    )
  ) {
    return true;
  }

  if (roleName !== ROLE_NAMES.BRANCH_MANAGER) {
    return false;
  }

  return Boolean(
    (user.branchId && user.branchId === account.station_id) ||
      (user.branchName && user.branchName === account.station_name),
  );
}

async function listCreditAccountsDueSoon(
  databases,
  databaseId,
  todayDateString,
  lookaheadDays,
) {
  const endDateString = toDateOnly(
    addDays(new Date(`${todayDateString}T00:00:00.000Z`), lookaheadDays),
  );
  const documents = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await databases.listDocuments(
      databaseId,
      COLLECTIONS.customerBalances,
      [
        Query.equal("account_type", "credit"),
        Query.equal("status", "active"),
        Query.lessThanEqual("due_date", endDateString),
        Query.limit(limit),
        Query.offset(offset),
      ],
    );
    const batch = response.documents || [];

    documents.push(...batch);

    if (batch.length < limit) {
      break;
    }

    offset += limit;
  }

  return documents.filter(
    (document) =>
      document.due_date &&
      Number(document.balance_amount || 0) > 0,
  );
}

function isMissingCollectionError(error) {
  return `${error?.message || ""}`.toLowerCase().includes("not found");
}

export async function getNotificationSettings() {
  try {
    const { databases, databaseId } = createDatabasesClient();
    const response = await databases.listDocuments(
      databaseId,
      COLLECTIONS.notificationSettings,
      [Query.equal("setting_key", "default"), Query.limit(1)],
    );

    return normalizeNotificationSettingsDocument(response.documents?.[0] || null);
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }

    throw error;
  }
}

export async function saveNotificationSettings({
  creditDueLookaheadDays,
  popupEnabled,
  emailEnabled,
  smsEnabled,
  dailyRunHour,
  status = "active",
  updatedByUserId = "",
  updatedByName = "",
}) {
  const normalizedLookaheadDays = Number.parseInt(creditDueLookaheadDays, 10);
  const normalizedDailyRunHour = Number.parseInt(dailyRunHour, 10);

  if (!Number.isFinite(normalizedLookaheadDays) || normalizedLookaheadDays < 0) {
    throw new Error("Credit due lookahead days must be zero or greater.");
  }

  if (
    !Number.isFinite(normalizedDailyRunHour) ||
    normalizedDailyRunHour < 0 ||
    normalizedDailyRunHour > 23
  ) {
    throw new Error("Daily run hour must be between 0 and 23.");
  }

  const { databases, databaseId } = createDatabasesClient();
  const timestamp = new Date().toISOString();
  const payload = {
    setting_key: "default",
    credit_due_lookahead_days: Math.trunc(normalizedLookaheadDays),
    popup_enabled: Boolean(popupEnabled),
    email_enabled: Boolean(emailEnabled),
    sms_enabled: Boolean(smsEnabled),
    daily_run_hour: Math.trunc(normalizedDailyRunHour),
    status: `${status || "active"}`.trim().toLowerCase() === "inactive"
      ? "inactive"
      : "active",
    updated_by_user_id: updatedByUserId,
    updated_by_name: updatedByName,
    updated_at: timestamp,
  };

  const response = await databases.listDocuments(
    databaseId,
    COLLECTIONS.notificationSettings,
    [Query.equal("setting_key", "default"), Query.limit(1)],
  );
  const document = response.documents?.[0]
    ? await databases.updateDocument(
        databaseId,
        COLLECTIONS.notificationSettings,
        response.documents[0].$id,
        payload,
      )
    : await databases.createDocument(
        databaseId,
        COLLECTIONS.notificationSettings,
        "notification_settings_default",
        payload,
      );

  return normalizeNotificationSettingsDocument(document);
}

async function createNotificationIfNeeded(databases, databaseId, payload) {
  try {
    const document = await databases.createDocument(
      databaseId,
      COLLECTIONS.notifications,
      ID.unique(),
      {
        user_id: payload.userId,
        user_name: payload.userName,
        role_name: payload.roleName,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        reference_type: payload.referenceType,
        reference_id: payload.referenceId,
        status: "unread",
        priority: payload.priority,
        idempotency_key: payload.idempotencyKey,
        created_at: payload.createdAt,
        read_at: "",
      },
    );

    return { created: true, document };
  } catch (error) {
    if (error?.code === 409) {
      return { created: false, document: null };
    }

    throw error;
  }
}

async function createDeliveryRecord(databases, databaseId, payload) {
  try {
    await databases.createDocument(
      databaseId,
      COLLECTIONS.notificationDeliveries,
      ID.unique(),
      {
        notification_id: payload.notificationId || "",
        event_type: payload.eventType,
        reference_type: payload.referenceType,
        reference_id: payload.referenceId,
        channel: payload.channel,
        recipient_type: payload.recipientType,
        recipient_name: payload.recipientName || "",
        recipient_contact: payload.recipientContact || "",
        subject: payload.subject || "",
        message: payload.message || "",
        status: payload.status,
        last_error: payload.lastError || "",
        idempotency_key: payload.idempotencyKey,
        sent_at: payload.sentAt || "",
        created_at: payload.createdAt,
        updated_at: payload.updatedAt,
      },
    );

    return true;
  } catch (error) {
    if (error?.code === 409) {
      return false;
    }

    throw error;
  }
}

async function sendProviderWebhook({ url, token, payload }) {
  if (!url) {
    return {
      status: "skipped",
      error: "Provider URL is not configured.",
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        status: "failed",
        error: body || `Provider returned HTTP ${response.status}.`,
      };
    }

    return { status: "sent", error: "" };
  } catch (error) {
    return {
      status: "failed",
      error: error?.message || "Provider request failed.",
    };
  }
}

async function sendCreditorDelivery({
  databases,
  databaseId,
  account,
  copy,
  channel,
  runDate,
  createdAt,
}) {
  const isEmail = channel === "email";
  const recipientContact = isEmail
    ? `${account.customer_email || ""}`.trim()
    : `${account.customer_phone || ""}`.trim();
  const webhookUrl = isEmail
    ? process.env.CREDIT_NOTIFICATION_EMAIL_WEBHOOK_URL
    : process.env.CREDIT_NOTIFICATION_SMS_WEBHOOK_URL;
  const token = process.env.CREDIT_NOTIFICATION_WEBHOOK_TOKEN || "";
  const idempotencyKey = `credit-due:${account.$id}:${runDate}:creditor:${channel}`;

  let deliveryStatus = "skipped";
  let lastError = recipientContact ? "" : `Creditor ${channel} contact is missing.`;
  let sentAt = "";

  if (recipientContact) {
    const providerResult = await sendProviderWebhook({
      url: webhookUrl,
      token,
      payload: {
        to: recipientContact,
        channel,
        subject: copy.title,
        message: copy.message,
        customerName: account.customer_name || "",
        customerPhone: account.customer_phone || "",
        accountId: account.$id,
        dueDate: account.due_date || "",
        balanceAmount: Number(account.balance_amount || 0),
        stationName: account.station_name || "",
      },
    });

    deliveryStatus = providerResult.status;
    lastError = providerResult.error || "";
    sentAt = providerResult.status === "sent" ? new Date().toISOString() : "";
  }

  await createDeliveryRecord(databases, databaseId, {
    eventType: copy.type,
    referenceType: "credit_account",
    referenceId: account.$id,
    channel,
    recipientType: "creditor",
    recipientName: account.customer_name || "",
    recipientContact,
    subject: copy.title,
    message: copy.message,
    status: deliveryStatus,
    lastError,
    idempotencyKey,
    sentAt,
    createdAt,
    updatedAt: createdAt,
  });

  return deliveryStatus;
}

export async function listUserNotifications(userId, { limit = 20 } = {}) {
  if (!userId) {
    return { notifications: [], unreadCount: 0 };
  }

  const { databases, databaseId } = createDatabasesClient();
  const [notificationResponse, unreadResponse] = await Promise.all([
    databases.listDocuments(databaseId, COLLECTIONS.notifications, [
      Query.equal("user_id", userId),
      Query.orderDesc("created_at"),
      Query.limit(limit),
    ]),
    databases.listDocuments(databaseId, COLLECTIONS.notifications, [
      Query.equal("user_id", userId),
      Query.equal("status", "unread"),
      Query.limit(1),
    ]),
  ]);

  return {
    notifications: (notificationResponse.documents || []).map(
      normalizeNotificationDocument,
    ),
    unreadCount: unreadResponse.total || 0,
  };
}

export async function markUserNotificationRead(userId, notificationId) {
  if (!userId || !notificationId) {
    return null;
  }

  const { databases, databaseId } = createDatabasesClient();
  const document = await databases.getDocument(
    databaseId,
    COLLECTIONS.notifications,
    notificationId,
  );

  if (document.user_id !== userId) {
    throw new Error("Notification not found.");
  }

  const updatedDocument = await databases.updateDocument(
    databaseId,
    COLLECTIONS.notifications,
    notificationId,
    {
      status: "read",
      read_at: new Date().toISOString(),
    },
  );

  return normalizeNotificationDocument(updatedDocument);
}

export async function markAllUserNotificationsRead(userId) {
  const { notifications } = await listUserNotifications(userId, { limit: 100 });
  const unreadNotifications = notifications.filter(
    (notification) => notification.status === "unread",
  );

  await Promise.all(
    unreadNotifications.map((notification) =>
      markUserNotificationRead(userId, notification.id),
    ),
  );

  return unreadNotifications.length;
}

export async function runCreditDueNotificationCheck({ runAt = new Date() } = {}) {
  const todayDateString = toDateOnly(runAt);
  const createdAt = new Date().toISOString();
  const { databases, databaseId } = createDatabasesClient();
  const settings = await getNotificationSettings();
  const summary = {
    accountsChecked: 0,
    popupCreated: 0,
    emailSent: 0,
    emailSkipped: 0,
    emailFailed: 0,
    smsSent: 0,
    smsSkipped: 0,
    smsFailed: 0,
    settingsStatus: settings.status,
    lookaheadDays: settings.creditDueLookaheadDays,
  };

  if (settings.status !== "active") {
    return summary;
  }

  const [accounts, users] = await Promise.all([
    listCreditAccountsDueSoon(
      databases,
      databaseId,
      todayDateString,
      settings.creditDueLookaheadDays,
    ),
    listUsers(),
  ]);
  const activeUsers = users.filter((user) => user.status === "active");

  summary.accountsChecked = accounts.length;

  for (const account of accounts) {
    const bucket = getCreditNotificationBucket(account.due_date, todayDateString);
    const copy = buildCreditNotificationCopy(account, bucket);
    const recipients = activeUsers.filter((user) =>
      canReceiveCreditNotification(user, account),
    );

    if (settings.popupEnabled) {
      for (const user of recipients) {
        const result = await createNotificationIfNeeded(databases, databaseId, {
          userId: user.id,
          userName: user.fullName || "",
          roleName: user.roleName || "",
          title: copy.title,
          message: copy.message,
          type: copy.type,
          priority: copy.priority,
          referenceType: "credit_account",
          referenceId: account.$id,
          idempotencyKey: `credit-due:${account.$id}:${todayDateString}:${user.id}`,
          createdAt,
        });

        if (result.created) {
          summary.popupCreated += 1;
        }
      }
    }

    const enabledChannels = [
      settings.emailEnabled ? "email" : null,
      settings.smsEnabled ? "sms" : null,
    ].filter(Boolean);

    for (const channel of enabledChannels) {
      const status = await sendCreditorDelivery({
        databases,
        databaseId,
        account,
        copy,
        channel,
        runDate: todayDateString,
        createdAt,
      });
      const key = `${channel}${status[0].toUpperCase()}${status.slice(1)}`;

      if (key in summary) {
        summary[key] += 1;
      }
    }
  }

  return summary;
}
