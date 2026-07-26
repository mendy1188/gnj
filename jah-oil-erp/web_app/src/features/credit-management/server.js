import "server-only";

import { Client, Databases, Query } from "appwrite";

import { getServerAppwriteConfig } from "@/lib/env";

export const CREDIT_MANAGEMENT_COLLECTIONS = {
  accounts: "customer_balances",
  guarantors: "credit_guarantors",
  documents: "credit_account_documents",
  notificationDeliveries: "notification_deliveries",
};

function createServerDatabases() {
  const config = getServerAppwriteConfig();
  const client = new Client()
    .setEndpoint(config.apiBaseUrl)
    .setProject(config.projectId);
  client.headers["X-Appwrite-Key"] = config.apiKey;
  return new Databases(client);
}

export async function getCreditAccountRecord(accountId) {
  const normalizedAccountId = `${accountId || ""}`.trim();

  if (!normalizedAccountId) {
    throw new Error("A credit account is required.");
  }

  const config = getServerAppwriteConfig();
  const account = await createServerDatabases().getDocument(
    config.databaseId,
    CREDIT_MANAGEMENT_COLLECTIONS.accounts,
    normalizedAccountId,
  );

  if (account.account_type !== "credit") {
    throw new Error("The selected account is not a credit account.");
  }

  const addresses = parseCreditAddressNotes(account.notes);

  return {
    id: account.$id,
    customerName: account.customer_name || "",
    customerPhone: account.customer_phone || "",
    physicalAddress: account.physical_address || addresses.physicalAddress,
    digitalAddress: account.digital_address || addresses.digitalAddress,
    referenceCode: account.reference_code || "",
    stationName: account.station_name || "",
    balanceAmount: Number(account.balance_amount || 0),
    status: account.status || "",
  };
}

function parseCreditAddressNotes(notes) {
  const result = {
    physicalAddress: "",
    digitalAddress: "",
  };

  for (const line of `${notes || ""}`.split(/\r?\n/)) {
    const normalizedLine = line.trim();

    if (normalizedLine.startsWith("Physical address:")) {
      result.physicalAddress = normalizedLine
        .slice("Physical address:".length)
        .trim();
    } else if (normalizedLine.startsWith("Digital address:")) {
      result.digitalAddress = normalizedLine
        .slice("Digital address:".length)
        .trim();
    }
  }

  return result;
}

export async function getCreditAccountSupportData(
  accountId,
  { mode = "" } = {},
) {
  const normalizedAccountId = `${accountId || ""}`.trim();
  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();
  const shouldLoadGuarantors = mode === "guarantor";
  const shouldLoadDocuments = ["agreement", "documents"].includes(mode);
  const shouldLoadFollowUps = mode === "follow-ups";
  const [account, guarantorDocuments, documentDocuments, deliveryDocuments] =
    await Promise.all([
      getCreditAccountRecord(normalizedAccountId),
      shouldLoadGuarantors
        ? listAllAccountRecords(databases, {
            databaseId: config.databaseId,
            collectionId: CREDIT_MANAGEMENT_COLLECTIONS.guarantors,
            accountId: normalizedAccountId,
            orderAttribute: "updated_at",
          })
        : Promise.resolve([]),
      shouldLoadDocuments
        ? listAllAccountRecords(databases, {
            databaseId: config.databaseId,
            collectionId: CREDIT_MANAGEMENT_COLLECTIONS.documents,
            accountId: normalizedAccountId,
            orderAttribute: "uploaded_at",
            filterQueries:
              mode === "agreement"
                ? [Query.equal("document_category", "agreement")]
                : [
                    Query.equal("document_category", [
                      "creditor_identity",
                      "collateral",
                    ]),
                  ],
          })
        : Promise.resolve([]),
      shouldLoadFollowUps
        ? listAllCreditorFollowUps(
            databases,
            config.databaseId,
            normalizedAccountId,
          )
        : Promise.resolve([]),
    ]);

  return {
    account,
    guarantors: guarantorDocuments.map(mapGuarantorDocument),
    documents: documentDocuments.map(mapCreditDocument),
    followUps: deliveryDocuments.map(mapCreditorFollowUp),
  };
}

async function listAllCreditorFollowUps(databases, databaseId, accountId) {
  const documents = [];
  let offset = 0;

  while (true) {
    const result = await databases.listDocuments(
      databaseId,
      CREDIT_MANAGEMENT_COLLECTIONS.notificationDeliveries,
      [
        Query.equal("reference_type", "credit_account"),
        Query.equal("reference_id", accountId),
        Query.limit(100),
        Query.offset(offset),
      ],
    );
    const batch = result.documents || [];
    documents.push(
      ...batch.filter((document) => document.recipient_type === "creditor"),
    );

    const total = Number(result.total);

    if (
      batch.length < 100 ||
      (Number.isFinite(total) && offset + batch.length >= total)
    ) {
      break;
    }

    offset += batch.length;
  }

  return documents.sort((left, right) =>
    `${right.created_at || right.sent_at || right.$createdAt || ""}`.localeCompare(
      `${left.created_at || left.sent_at || left.$createdAt || ""}`,
    ),
  );
}

async function listAllAccountRecords(
  databases,
  { databaseId, collectionId, accountId, orderAttribute, filterQueries = [] },
) {
  const documents = [];
  let offset = 0;

  while (true) {
    const result = await databases.listDocuments(databaseId, collectionId, [
      Query.equal("account_id", accountId),
      ...filterQueries,
      Query.orderDesc(orderAttribute),
      Query.limit(100),
      Query.offset(offset),
    ]);
    const batch = result.documents || [];
    documents.push(...batch);

    const total = Number(result.total);

    if (
      batch.length < 100 ||
      (Number.isFinite(total) && documents.length >= total)
    ) {
      break;
    }

    offset += batch.length;
  }

  return documents;
}

export async function getCreditFileDescriptor(recordType, recordId, fileKind) {
  const normalizedRecordType = `${recordType || ""}`.trim();
  const normalizedRecordId = `${recordId || ""}`.trim();
  const normalizedFileKind = `${fileKind || ""}`.trim();
  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  if (normalizedRecordType === "guarantor") {
    if (!["photo", "identity"].includes(normalizedFileKind)) {
      throw new Error("The requested guarantor file type is invalid.");
    }

    const guarantor = await databases.getDocument(
      config.databaseId,
      CREDIT_MANAGEMENT_COLLECTIONS.guarantors,
      normalizedRecordId,
    );
    const prefix = normalizedFileKind;
    const descriptor = {
      accountId: guarantor.account_id || "",
      bucketId: guarantor[`${prefix}_bucket_id`] || "",
      fileId: guarantor[`${prefix}_file_id`] || "",
      fileName: guarantor[`${prefix}_file_name`] || "credit-file",
      mimeType: guarantor[`${prefix}_mime_type`] || "application/octet-stream",
    };

    if (!descriptor.bucketId || !descriptor.fileId) {
      throw new Error("The requested guarantor file does not exist.");
    }

    return descriptor;
  }

  if (normalizedRecordType === "document") {
    if (normalizedFileKind !== "file") {
      throw new Error("The requested credit document file type is invalid.");
    }

    const document = await databases.getDocument(
      config.databaseId,
      CREDIT_MANAGEMENT_COLLECTIONS.documents,
      normalizedRecordId,
    );

    return {
      accountId: document.account_id || "",
      bucketId: document.bucket_id || "",
      fileId: document.file_id || "",
      fileName: document.file_name || "credit-file",
      mimeType: document.mime_type || "application/octet-stream",
    };
  }

  throw new Error("The requested credit file type is invalid.");
}

function mapGuarantorDocument(document) {
  if (!document) {
    return null;
  }

  return {
    id: document.$id,
    accountId: document.account_id || "",
    fullName: document.full_name || "",
    phone: document.phone || "",
    email: document.email || "",
    residentialAddress: document.residential_address || "",
    digitalAddress: document.digital_address || "",
    identityType: document.identity_type || "",
    identityNumber: document.identity_number || "",
    photoFileName: document.photo_file_name || "",
    identityFileName: document.identity_file_name || "",
    createdByName: document.created_by_name || "",
    createdAt: document.created_at || document.$createdAt || "",
    updatedAt: document.updated_at || document.$updatedAt || "",
  };
}

function mapCreditDocument(document) {
  return {
    id: document.$id,
    accountId: document.account_id || "",
    documentCategory: document.document_category || "",
    identityType: document.identity_type || "",
    title: document.title || "",
    notes: document.notes || "",
    collateralInfo: document.collateral_info || "",
    fileName: document.file_name || "",
    mimeType: document.mime_type || "",
    fileSize: Number(document.file_size || 0),
    uploadedByName: document.uploaded_by_name || "",
    uploadedAt: document.uploaded_at || document.$createdAt || "",
  };
}

function mapCreditorFollowUp(document) {
  return {
    id: document.$id,
    eventType: document.event_type || "",
    channel: document.channel || "",
    recipientName: document.recipient_name || "",
    recipientContact: document.recipient_contact || "",
    subject: document.subject || "",
    message: document.message || "",
    status: document.status || "",
    lastError: document.last_error || "",
    sentAt: document.sent_at || "",
    createdAt: document.created_at || document.$createdAt || "",
    updatedAt: document.updated_at || document.$updatedAt || "",
  };
}
