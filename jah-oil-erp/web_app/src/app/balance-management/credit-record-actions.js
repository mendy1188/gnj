"use server";

import { createHash } from "node:crypto";

import { Client, Databases, ID, Storage } from "appwrite";

import { requireModuleAccess } from "@/features/auth/server";
import {
  CREDIT_MANAGEMENT_COLLECTIONS,
  getCreditAccountRecord,
} from "@/features/credit-management/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const CREDIT_DOCUMENTS_BUCKET_ID =
  process.env.APPWRITE_CREDIT_DOCUMENTS_BUCKET_ID || "credit-documents";
const AUDIT_LOGS_COLLECTION_ID = "audit_logs";
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BATCH_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_COLLATERAL_FILES = 10;
const PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DOCUMENT_TYPES = new Set([
  ...PHOTO_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const PHOTO_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const DOCUMENT_EXTENSIONS = new Set([
  ...PHOTO_EXTENSIONS,
  "pdf",
  "doc",
  "docx",
]);
const IDENTITY_TYPES = new Set(["id_card", "passport", "drivers_license"]);

export async function saveCreditGuarantorAction(formData) {
  if (!hasServerAppwriteConfig()) {
    return { success: false, message: "Server configuration is missing." };
  }

  const session = await requireModuleAccess("balance-management");
  const values = normalizeGuarantorForm(formData);

  if (
    !values.accountId ||
    !values.requestId ||
    !values.fullName ||
    !values.phone
  ) {
    return {
      success: false,
      message:
        "Guarantor name, phone number, credit account, and request ID are required.",
    };
  }

  if (!IDENTITY_TYPES.has(values.identityType)) {
    return {
      success: false,
      message: "Select a valid guarantor identity type.",
    };
  }

  const guarantorFieldError = getOversizedFieldError([
    ["Guarantor name", values.fullName, 255],
    ["Phone number", values.phone, 32],
    ["Email", values.email, 255],
    ["Residential address", values.residentialAddress, 500],
    ["Digital address", values.digitalAddress, 128],
    ["Identity number", values.identityNumber, 128],
  ]);

  if (guarantorFieldError) {
    return { success: false, message: guarantorFieldError };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();
  const storage = createServerStorage();
  const uploadedFiles = [];
  const guarantorId = buildCreditRecordId(
    "cgr",
    `${values.accountId}:${values.requestId}`,
  );

  try {
    await getCreditAccountRecord(values.accountId);
    const existing = await getDocumentOrNull(
      databases,
      CREDIT_MANAGEMENT_COLLECTIONS.guarantors,
      guarantorId,
    );

    if (existing) {
      return {
        success: true,
        message: "Guarantor information was already added.",
        guarantorId: existing.$id,
        guarantor: toClientGuarantor(existing),
      };
    }

    if (!isUploadFile(values.photo)) {
      return { success: false, message: "Upload a guarantor photo." };
    }

    if (!isUploadFile(values.identityFile)) {
      return {
        success: false,
        message: "Upload the guarantor identity document.",
      };
    }

    validateUploadBatch([values.photo, values.identityFile]);

    const uploadedPhoto = await uploadFile(storage, values.photo, {
      label: "Guarantor photo",
      validTypes: PHOTO_TYPES,
      validExtensions: PHOTO_EXTENSIONS,
      maxSizeBytes: MAX_PHOTO_SIZE_BYTES,
    });
    if (uploadedPhoto) {
      uploadedFiles.push(uploadedPhoto.$id);
    }

    const uploadedIdentity = await uploadFile(storage, values.identityFile, {
      label: "Guarantor identity document",
      validTypes: DOCUMENT_TYPES,
      validExtensions: DOCUMENT_EXTENSIONS,
      maxSizeBytes: MAX_DOCUMENT_SIZE_BYTES,
    });
    if (uploadedIdentity) {
      uploadedFiles.push(uploadedIdentity.$id);
    }

    const now = new Date().toISOString();
    const payload = {
      account_id: values.accountId,
      full_name: values.fullName,
      phone: values.phone,
      email: values.email,
      residential_address: values.residentialAddress,
      digital_address: values.digitalAddress,
      identity_type: values.identityType,
      identity_number: values.identityNumber,
      photo_bucket_id: CREDIT_DOCUMENTS_BUCKET_ID,
      photo_file_id: uploadedPhoto.$id,
      photo_file_name: values.photo.name,
      photo_mime_type: values.photo.type,
      identity_bucket_id: CREDIT_DOCUMENTS_BUCKET_ID,
      identity_file_id: uploadedIdentity.$id,
      identity_file_name: values.identityFile.name,
      identity_mime_type: values.identityFile.type,
      created_by_user_id: session.userId || "",
      created_by_name: session.fullName || "System",
      created_at: now,
      updated_at: now,
    };

    const saved = await databases.createDocument(
      config.databaseId,
      CREDIT_MANAGEMENT_COLLECTIONS.guarantors,
      guarantorId,
      payload,
    );
    await createCreditAuditLogSafe(databases, {
      session,
      action: "credit_guarantor_added",
      entityType: "credit_guarantor",
      entityId: saved.$id,
      newValue: JSON.stringify({ accountId: values.accountId }),
    });

    return {
      success: true,
      message: "Guarantor information added.",
      guarantorId: saved.$id,
      guarantor: toClientGuarantor(saved),
    };
  } catch (error) {
    await cleanupUploadedFiles(storage, uploadedFiles);

    if (isConflictError(error)) {
      const existing = await getDocumentOrNull(
        databases,
        CREDIT_MANAGEMENT_COLLECTIONS.guarantors,
        guarantorId,
      ).catch(() => null);

      if (existing) {
        return {
          success: true,
          message: "Guarantor information was already added.",
          guarantorId: existing.$id,
          guarantor: toClientGuarantor(existing),
        };
      }
    }

    return creditActionError(error, "save guarantor information");
  }
}

export async function uploadCreditAgreementAction(formData) {
  const session = await requireModuleAccess("balance-management");
  const accountId = `${formData?.get("accountId") || ""}`.trim();
  const requestId = `${formData?.get("requestId") || ""}`.trim();
  const title = `${formData?.get("title") || "Credit Agreement"}`.trim();
  const notes = `${formData?.get("notes") || ""}`.trim();
  const file = formData?.get("agreementFile");

  if (!accountId || !requestId || !isUploadFile(file)) {
    return {
      success: false,
      message: "Select a credit account and agreement file, then try again.",
    };
  }

  const agreementFieldError = getOversizedFieldError([
    ["Agreement title", title, 255],
    ["Agreement notes", notes, 2000],
  ]);

  if (agreementFieldError) {
    return { success: false, message: agreementFieldError };
  }

  return uploadCreditDocument({
    session,
    accountId,
    requestId,
    category: "agreement",
    title: title || "Credit Agreement",
    notes,
    file,
  });
}

export async function uploadCreditorDocumentsAction(formData) {
  if (!hasServerAppwriteConfig()) {
    return { success: false, message: "Server configuration is missing." };
  }

  const session = await requireModuleAccess("balance-management");
  const accountId = `${formData?.get("accountId") || ""}`.trim();
  const requestId = `${formData?.get("requestId") || ""}`.trim();
  const identityType = `${formData?.get("identityType") || ""}`.trim();
  const notes = `${formData?.get("notes") || ""}`.trim();
  const collateralInfo = `${formData?.get("collateralInfo") || ""}`.trim();
  const collateralRequired = formData?.get("collateralRequired") === "true";
  const identityFile = formData?.get("identityFile");
  const collateralFiles = (formData?.getAll("collateralFiles") || []).filter(
    isUploadFile,
  );

  if (
    !accountId ||
    !requestId ||
    !IDENTITY_TYPES.has(identityType) ||
    !isUploadFile(identityFile)
  ) {
    return {
      success: false,
      message: "Select an identity type and upload the creditor identity.",
    };
  }

  if (collateralRequired && (!collateralInfo || collateralFiles.length === 0)) {
    return {
      success: false,
      message:
        "Enter collateral information and upload at least one collateral document.",
    };
  }

  const creditorFieldError = getOversizedFieldError([
    ["Document notes", notes, 2000],
    ["Collateral information", collateralInfo, 2000],
  ]);

  if (creditorFieldError) {
    return { success: false, message: creditorFieldError };
  }

  if (collateralFiles.length > MAX_COLLATERAL_FILES) {
    return {
      success: false,
      message: `Upload no more than ${MAX_COLLATERAL_FILES} collateral documents at once.`,
    };
  }

  try {
    validateUploadBatch([identityFile, ...collateralFiles]);
  } catch (error) {
    return creditActionError(error, "upload creditor documents");
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();
  const storage = createServerStorage();
  const uploadedFileIds = [];
  const createdDocumentIds = [];
  const createdDocuments = [];

  try {
    await getCreditAccountRecord(accountId);
    const uploads = [
      {
        file: identityFile,
        category: "creditor_identity",
        title: `Creditor ${formatIdentityType(identityType)}`,
        identityType,
        collateralInfo: "",
      },
      ...collateralFiles.map((file) => ({
        file,
        category: "collateral",
        title: file.name,
        identityType: "",
        collateralInfo,
      })),
    ];

    for (const [index, upload] of uploads.entries()) {
      const documentId = buildCreditRecordId(
        "crd",
        `${accountId}:${requestId}:${index}:${upload.category}`,
      );
      const existing = await getDocumentOrNull(
        databases,
        CREDIT_MANAGEMENT_COLLECTIONS.documents,
        documentId,
      );

      if (existing) {
        createdDocuments.push(toClientCreditDocument(existing));
        continue;
      }

      await validateFile(upload.file, {
        label: "Credit document",
        validTypes: DOCUMENT_TYPES,
        validExtensions: DOCUMENT_EXTENSIONS,
        maxSizeBytes: MAX_DOCUMENT_SIZE_BYTES,
      });
      const uploaded = await storage.createFile(
        CREDIT_DOCUMENTS_BUCKET_ID,
        ID.unique(),
        upload.file,
      );
      uploadedFileIds.push(uploaded.$id);
      let created;
      let createdHere = true;

      try {
        created = await createCreditDocumentRecord(
          databases,
          config.databaseId,
          {
            accountId,
            category: upload.category,
            identityType: upload.identityType,
            title: upload.title,
            notes,
            collateralInfo: upload.collateralInfo,
            file: upload.file,
            uploadedFile: uploaded,
            session,
            documentId,
          },
        );
      } catch (error) {
        if (!isConflictError(error)) {
          throw error;
        }

        createdHere = false;
        await storage
          .deleteFile(CREDIT_DOCUMENTS_BUCKET_ID, uploaded.$id)
          .catch(() => {});
        const uploadedIndex = uploadedFileIds.indexOf(uploaded.$id);
        if (uploadedIndex >= 0) {
          uploadedFileIds.splice(uploadedIndex, 1);
        }
        created = await getDocumentOrNull(
          databases,
          CREDIT_MANAGEMENT_COLLECTIONS.documents,
          documentId,
        );

        if (!created) {
          throw error;
        }
      }

      if (createdHere) {
        createdDocumentIds.push(created.$id);
      }
      createdDocuments.push(toClientCreditDocument(created));
    }

    if (createdDocumentIds.length > 0) {
      await createCreditAuditLogSafe(databases, {
        session,
        action: "creditor_documents_uploaded",
        entityType: "customer_balance",
        entityId: accountId,
        newValue: JSON.stringify({
          documentCount: createdDocumentIds.length,
          categories: Array.from(
            new Set(
              createdDocuments.map((document) => document.documentCategory),
            ),
          ),
        }),
      });
    }

    return {
      success: true,
      message: "Creditor documents uploaded.",
      documents: createdDocuments,
    };
  } catch (error) {
    await Promise.all(
      createdDocumentIds.map((documentId) =>
        databases
          .deleteDocument(
            config.databaseId,
            CREDIT_MANAGEMENT_COLLECTIONS.documents,
            documentId,
          )
          .catch(() => {}),
      ),
    );
    await cleanupUploadedFiles(storage, uploadedFileIds);
    return creditActionError(error, "upload creditor documents");
  }
}

async function uploadCreditDocument({
  session,
  accountId,
  requestId,
  category,
  title,
  notes,
  file,
}) {
  if (!hasServerAppwriteConfig()) {
    return { success: false, message: "Server configuration is missing." };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();
  const storage = createServerStorage();
  let uploaded = null;
  const documentId = buildCreditRecordId(
    "crd",
    `${accountId}:${requestId}:${category}:agreement`,
  );

  try {
    await getCreditAccountRecord(accountId);
    const existing = await getDocumentOrNull(
      databases,
      CREDIT_MANAGEMENT_COLLECTIONS.documents,
      documentId,
    );

    if (existing) {
      return {
        success: true,
        message: "Credit agreement was already uploaded.",
        document: toClientCreditDocument(existing),
      };
    }

    validateUploadBatch([file]);
    await validateFile(file, {
      label: "Credit agreement",
      validTypes: DOCUMENT_TYPES,
      validExtensions: DOCUMENT_EXTENSIONS,
      maxSizeBytes: MAX_DOCUMENT_SIZE_BYTES,
    });
    uploaded = await storage.createFile(
      CREDIT_DOCUMENTS_BUCKET_ID,
      ID.unique(),
      file,
    );
    const created = await createCreditDocumentRecord(
      databases,
      config.databaseId,
      {
        accountId,
        category,
        identityType: "",
        title,
        notes,
        collateralInfo: "",
        file,
        uploadedFile: uploaded,
        session,
        documentId,
      },
    );
    await createCreditAuditLogSafe(databases, {
      session,
      action: "credit_agreement_uploaded",
      entityType: "credit_account_document",
      entityId: created.$id,
      newValue: JSON.stringify({ accountId }),
    });
    return {
      success: true,
      message: "Credit agreement uploaded.",
      document: toClientCreditDocument(created),
    };
  } catch (error) {
    if (uploaded?.$id) {
      await storage
        .deleteFile(CREDIT_DOCUMENTS_BUCKET_ID, uploaded.$id)
        .catch(() => {});
    }

    if (isConflictError(error)) {
      const existing = await getDocumentOrNull(
        databases,
        CREDIT_MANAGEMENT_COLLECTIONS.documents,
        documentId,
      ).catch(() => null);

      if (existing) {
        return {
          success: true,
          message: "Credit agreement was already uploaded.",
          document: toClientCreditDocument(existing),
        };
      }
    }

    return creditActionError(error, "upload the credit agreement");
  }
}

async function createCreditDocumentRecord(
  databases,
  databaseId,
  {
    accountId,
    category,
    identityType,
    title,
    notes,
    collateralInfo,
    file,
    uploadedFile,
    session,
    documentId,
  },
) {
  return databases.createDocument(
    databaseId,
    CREDIT_MANAGEMENT_COLLECTIONS.documents,
    documentId,
    {
      account_id: accountId,
      document_category: category,
      identity_type: identityType,
      title,
      notes,
      collateral_info: collateralInfo,
      bucket_id: CREDIT_DOCUMENTS_BUCKET_ID,
      file_id: uploadedFile.$id,
      file_name: file.name,
      mime_type: file.type || "",
      file_size: Number(file.size || 0),
      uploaded_by_user_id: session.userId || "",
      uploaded_by_name: session.fullName || "System",
      uploaded_at: new Date().toISOString(),
    },
  );
}

function createServerClient() {
  const config = getServerAppwriteConfig();
  const client = new Client()
    .setEndpoint(config.apiBaseUrl)
    .setProject(config.projectId);
  client.headers["X-Appwrite-Key"] = config.apiKey;
  return client;
}

function toClientGuarantor(document) {
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

function toClientCreditDocument(document) {
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

function createServerDatabases() {
  return new Databases(createServerClient());
}

function createServerStorage() {
  return new Storage(createServerClient());
}

async function createCreditAuditLogSafe(
  databases,
  { session, action, entityType, entityId, newValue = "" },
) {
  try {
    await databases.createDocument(
      getServerAppwriteConfig().databaseId,
      AUDIT_LOGS_COLLECTION_ID,
      ID.unique(),
      {
        actor_user_id: session.userId || "",
        actor_name: session.fullName || "System",
        action,
        entity_type: entityType,
        entity_id: entityId,
        station_id: "",
        station_name: "",
        old_value: "",
        new_value: `${newValue || ""}`.slice(0, 4000),
        created_at: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error("Failed to write credit-management audit log:", error);
  }
}

function normalizeGuarantorForm(formData) {
  const getValue = (key) => formData?.get(key);

  return {
    accountId: `${getValue("accountId") || ""}`.trim(),
    requestId: `${getValue("requestId") || ""}`.trim().slice(0, 128),
    fullName: `${getValue("fullName") || ""}`.trim(),
    phone: `${getValue("phone") || ""}`.trim(),
    email: `${getValue("email") || ""}`.trim().toLowerCase(),
    residentialAddress: `${getValue("residentialAddress") || ""}`.trim(),
    digitalAddress: `${getValue("digitalAddress") || ""}`.trim(),
    identityType: `${getValue("identityType") || ""}`.trim(),
    identityNumber: `${getValue("identityNumber") || ""}`.trim(),
    photo: getValue("photo"),
    identityFile: getValue("identityFile"),
  };
}

function isUploadFile(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.size === "number" &&
      value.size > 0 &&
      typeof value.name === "string",
  );
}

async function uploadFile(storage, file, validation) {
  if (!isUploadFile(file)) {
    return null;
  }

  await validateFile(file, validation);
  return storage.createFile(CREDIT_DOCUMENTS_BUCKET_ID, ID.unique(), file);
}

async function validateFile(
  file,
  { label, validTypes, validExtensions, maxSizeBytes },
) {
  if (!isUploadFile(file)) {
    throw new Error(`${label} is required.`);
  }

  if (file.size > maxSizeBytes) {
    throw new Error(
      `${label} must be ${Math.floor(maxSizeBytes / (1024 * 1024))}MB or smaller.`,
    );
  }

  if (`${file.name || ""}`.length > 255) {
    throw new Error(`${label} file name must be 255 characters or fewer.`);
  }

  const fileType = `${file.type || ""}`.trim().toLowerCase();
  const extension = `${file.name || ""}`.split(".").pop()?.toLowerCase();
  const genericMimeTypes = new Set(["", "application/octet-stream"]);

  if (
    !validExtensions.has(extension) ||
    (!genericMimeTypes.has(fileType) && !validTypes.has(fileType))
  ) {
    throw new Error(
      `${label} must be a PNG, JPG, WEBP, PDF, DOC, or DOCX file.`,
    );
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (!hasExpectedFileSignature(extension, header)) {
    throw new Error(
      `${label} content does not match its file extension or is corrupted.`,
    );
  }
}

function validateUploadBatch(files) {
  const uploadFiles = files.filter(isUploadFile);
  const totalSize = uploadFiles.reduce(
    (sum, file) => sum + Number(file.size || 0),
    0,
  );

  if (totalSize > MAX_UPLOAD_BATCH_SIZE_BYTES) {
    throw new Error("The combined upload size must be 20MB or smaller.");
  }
}

function hasExpectedFileSignature(extension, bytes) {
  const startsWith = (...signature) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (extension === "png") {
    return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  }

  if (["jpg", "jpeg"].includes(extension)) {
    return startsWith(0xff, 0xd8, 0xff);
  }

  if (extension === "webp") {
    return (
      startsWith(0x52, 0x49, 0x46, 0x46) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }

  if (extension === "pdf") {
    return startsWith(0x25, 0x50, 0x44, 0x46, 0x2d);
  }

  if (extension === "doc") {
    return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  }

  if (extension === "docx") {
    return startsWith(0x50, 0x4b, 0x03, 0x04);
  }

  return false;
}

function getOversizedFieldError(fields) {
  const oversizedField = fields.find(
    ([, value, maxLength]) => `${value || ""}`.length > maxLength,
  );

  return oversizedField
    ? `${oversizedField[0]} must be ${oversizedField[2]} characters or fewer.`
    : "";
}

function buildCreditRecordId(prefix, requestId) {
  return `${prefix}_${createHash("sha256")
    .update(`${requestId || ""}`)
    .digest("hex")
    .slice(0, 28)}`;
}

async function getDocumentOrNull(databases, collectionId, documentId) {
  try {
    return await databases.getDocument(
      getServerAppwriteConfig().databaseId,
      collectionId,
      documentId,
    );
  } catch (error) {
    if (error?.code === 404 || error?.status === 404) {
      return null;
    }

    throw error;
  }
}

function isConflictError(error) {
  return error?.code === 409 || error?.status === 409;
}

async function cleanupUploadedFiles(storage, fileIds) {
  await Promise.all(
    fileIds.map((fileId) =>
      storage.deleteFile(CREDIT_DOCUMENTS_BUCKET_ID, fileId).catch(() => {}),
    ),
  );
}

function formatIdentityType(identityType) {
  if (identityType === "id_card") {
    return "ID Card";
  }
  if (identityType === "drivers_license") {
    return "Driver's License";
  }
  return "Passport";
}

function creditActionError(error, genericLabel) {
  return {
    success: false,
    message: getUserFacingErrorMessage(error, {
      moduleName: "Credit / Debt Management",
      genericLabel,
      fallbackMessage: `Failed to ${genericLabel}.`,
    }),
  };
}
