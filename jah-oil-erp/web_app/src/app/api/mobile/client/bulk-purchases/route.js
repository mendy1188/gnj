import { NextResponse } from "next/server";
import { Client, Databases, ID } from "appwrite";

import { buildBulkFuelPurchaseReference } from "@/features/bulk-fuel/helpers";
import { getClientUserById } from "@/features/client-users/data";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import {
  getProductsData,
  invalidateAppwriteCollectionCache,
} from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

import { getClientRequestSession } from "../auth/_shared";

export const dynamic = "force-dynamic";

const COLLECTIONS = {
  customerBalances: "customer_balances",
  customerBalanceMovements: "customer_balance_movements",
};

function createDatabasesClient() {
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

function getBulkPurchaseErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Client Bulk Fuel Purchase",
    genericLabel: "create this bulk purchase",
    fallbackMessage:
      "We could not record this bulk purchase right now. Try again, and if the problem continues, contact support.",
  });
}

export async function POST(request) {
  try {
    if (!hasServerAppwriteConfig()) {
      return NextResponse.json(
        {
          success: false,
          message: "Server configuration is missing.",
        },
        { status: 500 },
      );
    }

    const session = await getClientRequestSession(request);

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        { status: 401 },
      );
    }

    const payload = await request.json().catch(() => null);
    const productCode = `${payload?.productCode || ""}`.trim().toLowerCase();
    const providerCode = `${payload?.providerCode || ""}`.trim().toLowerCase();
    const rawAmount = Number(payload?.amount ?? 0);
    const purchaseAmount = Number.isFinite(rawAmount)
      ? Number(rawAmount.toFixed(2))
      : Number.NaN;

    if (!productCode) {
      return NextResponse.json(
        {
          success: false,
          message: "Select a fuel product.",
        },
        { status: 400 },
      );
    }

    if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Purchase amount must be greater than zero.",
        },
        { status: 400 },
      );
    }

    const [clientUser, products] = await Promise.all([
      getClientUserById(session.userId),
      getProductsData(),
    ]);

    if (!clientUser) {
      return NextResponse.json(
        {
          success: false,
          message: "Client account could not be found.",
        },
        { status: 404 },
      );
    }

    const product = products.find(
      (entry) =>
        `${entry.category || ""}`.trim().toLowerCase() === "fuel" &&
        `${entry.name || ""}`.trim().toLowerCase() === productCode,
    );

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          message: "The selected fuel product could not be found.",
        },
        { status: 404 },
      );
    }

    const referenceCode = buildBulkFuelPurchaseReference({
      clientPhone: clientUser.phone,
      productName: product.name,
      purchaseDate: new Date().toISOString().slice(0, 10),
    });
    const { databases, databaseId } = createDatabasesClient();
    const now = new Date().toISOString();

    const accountDocument = await databases.createDocument(
      databaseId,
      COLLECTIONS.customerBalances,
      ID.unique(),
      {
        account_type: "bulk_redeem",
        reference_code: referenceCode,
        customer_name: clientUser.fullName,
        customer_phone: clientUser.phone,
        station_id: "",
        station_name: "",
        product_id: product.id,
        product_name: product.name,
        product_category: "fuel",
        balance_amount: purchaseAmount,
        balance_quantity: Number(
          (purchaseAmount / Number(product.price || 1)).toFixed(2),
        ),
        unit: product.unit || "litre",
        status: "active",
        created_at: now,
        updated_at: now,
        notes: `Client mobile bulk purchase via ${providerCode || "wallet"}.`,
      },
    );

    await databases.createDocument(
      databaseId,
      COLLECTIONS.customerBalanceMovements,
      ID.unique(),
      {
        account_id: accountDocument.$id,
        account_type: "bulk_redeem",
        receipt_id: "",
        receipt_number: "",
        station_id: "",
        station_name: "",
        product_id: product.id,
        product_name: product.name,
        movement_date: now,
        direction: "credit",
        amount_delta: purchaseAmount,
        quantity_delta: Number((purchaseAmount / Number(product.price || 1)).toFixed(2)),
        balance_amount: purchaseAmount,
        balance_quantity: Number((purchaseAmount / Number(product.price || 1)).toFixed(2)),
        actor_user_id: clientUser.id,
        actor_name: clientUser.fullName,
        reference_code: referenceCode,
        notes: `Client mobile bulk purchase via ${providerCode || "wallet"}.`,
      },
    );

    invalidateAppwriteCollectionCache([
      COLLECTIONS.customerBalances,
      COLLECTIONS.customerBalanceMovements,
    ]);

    return NextResponse.json({
      success: true,
      purchase: {
        id: accountDocument.$id,
        referenceCode,
        productName: product.name,
        amount: purchaseAmount,
      },
      message: "Bulk fuel purchase recorded successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getBulkPurchaseErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
