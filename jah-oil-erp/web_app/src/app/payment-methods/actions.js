"use server";

import { Client, Databases, Query } from "appwrite";
import { revalidatePath } from "next/cache";

import { requireModuleAccess } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import {
  buildPaymentMethodCodeFromLabel,
  getDefaultPaymentMethodByCode,
  normalizePaymentMethodCode,
} from "@/features/payments/constants";
import {
  getPaymentMethodSettingsData,
  invalidateAppwriteCollectionCache,
} from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  paymentMethods: "payment_methods",
};

export async function savePaymentMethodAction(payload) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  await requireModuleAccess("payment-methods");

  const label = `${payload?.label || ""}`.trim();
  const code = normalizePaymentMethodCode(
    payload?.code || buildPaymentMethodCodeFromLabel(label),
  );
  const defaultMethod = getDefaultPaymentMethodByCode(code);
  const description = `${payload?.description || ""}`.trim();
  const isEnabled = Boolean(payload?.isEnabled);
  const currentMethods = await getPaymentMethodSettingsData();
  const currentMethod =
    currentMethods.find((method) => method.code === code) || null;
  const sortOrder = Number(
    payload?.sortOrder ??
      currentMethod?.sortOrder ??
      defaultMethod?.sortOrder ??
      0,
  );

  if (!code) {
    return {
      success: false,
      message: "Payment method code is required.",
    };
  }

  if (!label) {
    return {
      success: false,
      message: "Label is required.",
    };
  }

  if (!Number.isFinite(sortOrder) || sortOrder < 0) {
    return {
      success: false,
      message: "Sort order must be a valid non-negative number.",
    };
  }

  const enabledCount = currentMethods.filter((method) => method.isEnabled).length;
  const currentlyEnabled = currentMethod ? Boolean(currentMethod.isEnabled) : false;

  if (!isEnabled && currentlyEnabled && enabledCount <= 1) {
    return {
      success: false,
      message: "At least one payment method must remain enabled.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    const existingDocument = await findPaymentMethodDocumentByCode(
      databases,
      config.databaseId,
      code,
    );
    const documentId = existingDocument?.$id || `pmt_${code}`.slice(0, 36);
    const payloadToSave = {
      code,
      label,
      description,
      is_enabled: isEnabled,
      sort_order: Math.trunc(sortOrder),
    };

    if (existingDocument) {
      await databases.updateDocument(
        config.databaseId,
        COLLECTIONS.paymentMethods,
        existingDocument.$id,
        payloadToSave,
      );
    } else {
      await databases.createDocument(
        config.databaseId,
        COLLECTIONS.paymentMethods,
        documentId,
        payloadToSave,
      );
    }

    invalidateAppwriteCollectionCache([COLLECTIONS.paymentMethods]);
    revalidatePath("/payment-methods");
    revalidatePath("/pos");

    return {
      success: true,
      message: `${label} updated successfully.`,
      paymentMethodCode: code,
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "Payment Methods",
        genericLabel: "save this payment method",
        fallbackMessage: "Failed to save payment method.",
      }),
    };
  }
}

function createServerDatabases() {
  const config = getServerAppwriteConfig();
  const client = new Client()
    .setEndpoint(config.apiBaseUrl)
    .setProject(config.projectId);
  client.headers["X-Appwrite-Key"] = config.apiKey;
  return new Databases(client);
}

async function findPaymentMethodDocumentByCode(databases, databaseId, code) {
  try {
    const response = await databases.listDocuments(
      databaseId,
      COLLECTIONS.paymentMethods,
      [Query.equal("code", code), Query.limit(1)],
    );

    return response.documents?.[0] || null;
  } catch (error) {
    if (`${error?.message || ""}`.toLowerCase().includes("not found")) {
      throw new Error(
        "Payment methods storage is not ready yet. Run the latest database schema update first.",
      );
    }

    throw error;
  }
}
