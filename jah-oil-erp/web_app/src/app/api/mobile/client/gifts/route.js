import { NextResponse } from "next/server";
import { Client, Databases, Query } from "appwrite";

import {
  cancelFuelGiftCode,
  createFuelGiftCode,
  createFuelGiftPurchase,
  getClientUserById,
  getClientRewardAccountByClientUserId,
  syncFuelGiftPurchaseByGiftCodeId,
} from "@/features/client-users/data";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { getProductsData } from "@/lib/data/appwrite-data";
import { getServerAppwriteConfig } from "@/lib/env";

import { getClientRequestSession } from "../auth/_shared";

export const dynamic = "force-dynamic";

const COLLECTIONS = {
  customerBalances: "customer_balances",
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

async function getAvailableGiftFundingAmount({
  clientUserId,
  clientPhone,
  productId,
  productName,
}) {
  const { databases, databaseId } = createDatabasesClient();
  const response = await databases.listDocuments(databaseId, COLLECTIONS.customerBalances, [
    Query.equal("account_type", "bulk_redeem"),
    Query.equal("customer_phone", `${clientPhone || ""}`.trim()),
    Query.equal("status", "active"),
    Query.limit(100),
  ]);
  const normalizedProductName = `${productName || ""}`.trim().toLowerCase();
  const bulkAmount = Number(
    (response.documents || [])
      .filter((document) => {
        const sameProductId = `${document.product_id || ""}`.trim() === `${productId || ""}`.trim();
        const sameProductName =
          `${document.product_name || ""}`.trim().toLowerCase() === normalizedProductName;

        return sameProductId || sameProductName;
      })
      .reduce((sum, document) => sum + Number(document.balance_amount || 0), 0)
      .toFixed(2),
  );
  const rewardAccount = await getClientRewardAccountByClientUserId(clientUserId);
  const rewardAmount = Number(rewardAccount?.balanceAmount || 0);

  return Number((bulkAmount + rewardAmount).toFixed(2));
}

function getGiftErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Fuel Gift",
    genericLabel: "create this fuel gift",
    fallbackMessage:
      "We could not create this fuel gift right now. Try again, and if the problem continues, contact support.",
  });
}

export async function POST(request) {
  try {
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
    const recipientName = `${payload?.recipientName || ""}`.trim();
    const amount = Number(payload?.amount ?? 0);

    if (!productCode) {
      return NextResponse.json(
        {
          success: false,
          message: "Select a fuel product.",
        },
        { status: 400 },
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Gift amount must be greater than zero.",
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

    const availableFundingAmount = await getAvailableGiftFundingAmount({
      clientUserId: clientUser.id,
      clientPhone: clientUser.phone,
      productId: product.id,
      productName: product.name,
    });

    if (availableFundingAmount + 0.009 < amount) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Available bulk fuel plus cash back is not enough for this gift. Top up the balance or reduce the gift amount.",
        },
        { status: 400 },
      );
    }

    const gift = await createFuelGiftCode({
      clientUserId: clientUser.id,
      clientName: clientUser.fullName,
      clientPhone: clientUser.phone,
      productCode,
      productName: product.name,
      amount,
      recipientName,
      notes: "Created from the client app.",
    });

    await createFuelGiftPurchase({
      giftCodeId: gift.id,
      giftCode: gift.code,
      clientUserId: clientUser.id,
      clientName: clientUser.fullName,
      clientPhone: clientUser.phone,
      productCode,
      productName: product.name,
      amount,
      recipientName: gift.recipientName,
      status: gift.status,
      createdAt: gift.createdAt,
      notes: "Created from the client app.",
    });

    return NextResponse.json({
      success: true,
      gift,
      message: `Gift code ${gift.code} is ready to share.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getGiftErrorMessage(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
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
    const giftId = `${payload?.giftId || ""}`.trim();

    if (!giftId) {
      return NextResponse.json(
        {
          success: false,
          message: "Gift code could not be found.",
        },
        { status: 400 },
      );
    }

    const gift = await cancelFuelGiftCode({
      giftId,
      clientUserId: session.userId,
      actorName: session.fullName || "",
    });

    await syncFuelGiftPurchaseByGiftCodeId({
      giftCodeId: gift.id,
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      notes: "Cancelled from the client app.",
    });

    return NextResponse.json({
      success: true,
      gift,
      message: `Gift code ${gift.code} was cancelled.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getGiftErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
