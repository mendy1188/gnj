"use server";

import { Client, Databases } from "appwrite";
import { revalidatePath } from "next/cache";

import { requireModuleAccess } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { invalidateAppwriteCollectionCache } from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  posTransactionEnvelopes: "pos_transaction_envelopes",
};

export async function markPosTransactionEnvelopeAppliedAction(formData) {
  if (!hasServerAppwriteConfig()) {
    return {
      success: false,
      message: "Server configuration is missing.",
    };
  }

  await requireModuleAccess("admin");

  const envelopeId = `${formData?.get("envelopeId") || ""}`.trim();

  if (!envelopeId) {
    return {
      success: false,
      message: "Select a POS repair record first.",
    };
  }

  const config = getServerAppwriteConfig();
  const databases = createServerDatabases();

  try {
    await databases.updateDocument(
      config.databaseId,
      COLLECTIONS.posTransactionEnvelopes,
      envelopeId,
      {
        status: "applied",
        updated_at: new Date().toISOString(),
      },
    );

    invalidateAppwriteCollectionCache([COLLECTIONS.posTransactionEnvelopes]);
    revalidatePath("/admin/pos-repairs");

    return {
      success: true,
      message: "POS repair record marked as applied.",
    };
  } catch (error) {
    return {
      success: false,
      message: getUserFacingErrorMessage(error, {
        moduleName: "POS Repairs",
        genericLabel: "update this repair record",
        fallbackMessage: "Failed to update repair record.",
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
