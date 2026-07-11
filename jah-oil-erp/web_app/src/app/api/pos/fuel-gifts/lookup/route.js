import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/server";
import { findFuelGiftCodeByCode } from "@/features/client-users/data";
import { getUserFacingErrorMessage } from "@/features/errors/copy";

export const dynamic = "force-dynamic";

function getFuelGiftLookupErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "POS",
    genericLabel: "look up this fuel gift code",
    fallbackMessage:
      "We could not verify this fuel gift code right now. Try again, and if the problem continues, contact support.",
  });
}

function buildLookupPayload(gift) {
  return {
    code: gift.code || "",
    productCode: gift.productCode || "",
    productName: gift.productName || "",
    amount: Number(gift.amount || 0),
    recipientName: gift.recipientName || "",
    clientName: gift.clientName || "",
    clientPhone: gift.clientPhone || "",
    status: gift.status || "",
    createdAt: gift.createdAt || "",
  };
}

export async function POST(request) {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 },
      );
    }

    if (!session.modules?.includes("pos")) {
      return NextResponse.json(
        {
          success: false,
          message: "You do not have access to the POS module.",
        },
        { status: 403 },
      );
    }

    const payload = await request.json().catch(() => null);
    const code = `${payload?.code || ""}`.trim().toUpperCase();

    if (!code) {
      return NextResponse.json(
        { success: false, message: "Fuel gift code is required." },
        { status: 400 },
      );
    }

    const gift = await findFuelGiftCodeByCode(code);

    if (!gift) {
      return NextResponse.json(
        { success: false, message: "Fuel gift code could not be found." },
        { status: 404 },
      );
    }

    if (`${gift.status || ""}`.trim().toLowerCase() !== "active") {
      return NextResponse.json(
        { success: false, message: "Fuel gift code is no longer active." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      gift: buildLookupPayload(gift),
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getFuelGiftLookupErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
