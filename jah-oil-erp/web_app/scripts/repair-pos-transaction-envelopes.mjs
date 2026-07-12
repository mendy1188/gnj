#!/usr/bin/env node

import process from "node:process";

import { Client, Databases, Query } from "appwrite";

import {
  createAdminConfig,
  loadEnvFiles,
  parseArgs,
  validateAdminConfig,
} from "./lib/appwrite-admin.mjs";

const COLLECTIONS = {
  posTransactionEnvelopes: "pos_transaction_envelopes",
  salesReceipts: "sales_receipts",
  salesReceiptItems: "sales_receipt_items",
  salesPayments: "sales_payments",
};

const VALID_STATUSES = new Set(["applying", "applied", "repair_needed", "all"]);

loadEnvFiles();

const cliArgs = parseArgs(process.argv.slice(2), {
  booleanFlags: ["dry-run", "help", "mark-applied"],
});
const config = createAdminConfig(cliArgs);

if (cliArgs.help) {
  printUsage();
  process.exit(0);
}

validateAdminConfig(config);

main().catch((error) => {
  console.error(`POS envelope repair failed: ${error.message}`);

  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }

  process.exit(1);
});

async function main() {
  const status = `${cliArgs.status || "repair_needed"}`.trim();
  const shouldMarkApplied = Boolean(cliArgs["mark-applied"]);
  const limit = Math.max(1, Math.min(Number(cliArgs.limit || 500), 5000));

  if (!VALID_STATUSES.has(status)) {
    throw new Error(
      `Invalid status "${status}". Use one of: ${Array.from(VALID_STATUSES).join(", ")}`,
    );
  }

  console.log(`Using Appwrite endpoint: ${config.apiBaseUrl}`);
  console.log(`Target database ID: ${config.databaseId}`);
  console.log(`Envelope status: ${status}`);
  console.log(
    shouldMarkApplied && !config.dryRun
      ? "Mode: mark valid envelopes as applied"
      : "Mode: dry run / audit only",
  );

  const databases = createDatabasesClient(config);
  const envelopes = await listEnvelopeDocuments(databases, {
    status,
    limit,
  });
  const results = [];

  for (const envelope of envelopes) {
    const inspection = await inspectEnvelope(databases, envelope);
    results.push(inspection);

    if (inspection.canMarkApplied && shouldMarkApplied && !config.dryRun) {
      await databases.updateDocument(
        config.databaseId,
        COLLECTIONS.posTransactionEnvelopes,
        envelope.$id,
        {
          status: "applied",
          error_message: "",
          updated_at: new Date().toISOString(),
        },
      );
    }
  }

  printSummary(results);
}

function createDatabasesClient(runtimeConfig) {
  const client = new Client()
    .setEndpoint(runtimeConfig.apiBaseUrl)
    .setProject(runtimeConfig.projectId);
  client.headers["X-Appwrite-Key"] = runtimeConfig.apiKey;
  return new Databases(client);
}

async function listEnvelopeDocuments(databases, { status, limit }) {
  const documents = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (documents.length < total && documents.length < limit) {
    const batchLimit = Math.min(100, limit - documents.length);
    const queries = [
      Query.select([
        "$id",
        "transaction_type",
        "status",
        "idempotency_key",
        "receipt_id",
        "receipt_number",
        "station_id",
        "station_name",
        "cashier_name",
        "total_amount",
        "error_message",
        "created_at",
        "updated_at",
      ]),
      Query.limit(batchLimit),
      Query.offset(offset),
      Query.orderDesc("updated_at"),
    ];

    if (status !== "all") {
      queries.unshift(Query.equal("status", status));
    }

    const response = await databases.listDocuments(
      config.databaseId,
      COLLECTIONS.posTransactionEnvelopes,
      queries,
    );
    const batch = response.documents || [];

    documents.push(...batch);
    total = response.total ?? batch.length;

    if (batch.length < batchLimit) {
      break;
    }

    offset += batchLimit;
  }

  return documents;
}

async function inspectEnvelope(databases, envelope) {
  const receiptId = `${envelope.receipt_id || ""}`.trim();
  const issues = [];
  let receipt = null;
  let receiptItemCount = 0;
  let paymentCount = 0;

  if (!receiptId) {
    issues.push("missing receipt_id");
  } else {
    receipt = await getDocumentOrNull(
      databases,
      COLLECTIONS.salesReceipts,
      receiptId,
    );

    if (!receipt) {
      issues.push("receipt not found");
    } else {
      receiptItemCount = await countDocuments(databases, COLLECTIONS.salesReceiptItems, [
        Query.equal("receipt_id", receiptId),
      ]);
      paymentCount = await countDocuments(databases, COLLECTIONS.salesPayments, [
        Query.equal("receipt_id", receiptId),
      ]);

      if (receiptItemCount <= 0) {
        issues.push("receipt has no line items");
      }

      if (paymentCount <= 0) {
        issues.push("receipt has no payment record");
      }

      if (
        envelope.transaction_type === "sale_create" &&
        receipt.status !== "completed"
      ) {
        issues.push(`sale receipt status is ${receipt.status || "blank"}`);
      }

      if (
        envelope.transaction_type === "sale_reverse" &&
        receipt.status !== "voided"
      ) {
        issues.push(`reversal receipt status is ${receipt.status || "blank"}`);
      }
    }
  }

  const canMarkApplied =
    issues.length === 0 && ["applying", "repair_needed"].includes(envelope.status);

  return {
    id: envelope.$id,
    type: envelope.transaction_type || "",
    status: envelope.status || "",
    receiptId,
    receiptNumber: envelope.receipt_number || receipt?.receipt_number || "",
    stationName: envelope.station_name || receipt?.station_name || "",
    receiptItemCount,
    paymentCount,
    canMarkApplied,
    issues,
  };
}

async function getDocumentOrNull(databases, collectionId, documentId) {
  try {
    return await databases.getDocument(config.databaseId, collectionId, documentId);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function countDocuments(databases, collectionId, queries = []) {
  const response = await databases.listDocuments(config.databaseId, collectionId, [
    ...queries,
    Query.select(["$id"]),
    Query.limit(1),
  ]);

  return Number(response.total || 0);
}

function isNotFoundError(error) {
  return error?.code === 404 || error?.status === 404;
}

function printSummary(results) {
  const canMarkApplied = results.filter((result) => result.canMarkApplied);
  const needsManualRepair = results.filter(
    (result) => !result.canMarkApplied && result.status !== "applied",
  );

  console.log(`envelopes inspected: ${results.length}`);
  console.log(`can mark applied: ${canMarkApplied.length}`);
  console.log(`needs manual repair: ${needsManualRepair.length}`);

  if (needsManualRepair.length > 0) {
    console.log("");
    console.log("Manual repair needed:");

    needsManualRepair.forEach((result) => {
      console.log(
        `- ${result.id} ${result.receiptNumber || result.receiptId || "no receipt"}: ${result.issues.join("; ") || "not eligible"}`,
      );
    });
  }
}

function printUsage() {
  console.log(`
Usage:
  node scripts/repair-pos-transaction-envelopes.mjs [options]

Options:
  --status <status>       applying, repair_needed, applied, all. Default: repair_needed
  --limit <number>        Max envelopes to inspect. Default: 500
  --dry-run               Audit only. Does not write any changes.
  --mark-applied          Mark fully consistent applying/repair_needed envelopes as applied.
  --help                  Show this help text.

Examples:
  npm run appwrite:repair-pos-envelopes -- --dry-run
  npm run appwrite:repair-pos-envelopes -- --status applying --mark-applied
`);
}
