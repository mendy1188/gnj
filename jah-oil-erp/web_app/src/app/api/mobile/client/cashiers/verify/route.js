import { NextResponse } from "next/server";

import { getUserFacingErrorMessage } from "@/features/errors/copy";
import {
  CLIENT_PAYMENT_CONTRACT_VERSION,
  normalizeCashierQrCode,
  resolveVerifiedCashier,
} from "@/app/api/mobile/client/_lib";
import { getClientRequestSession } from "../../auth/_shared";

export const dynamic = "force-dynamic";

const ALLOWED_FLOWS = new Set(["fuel_purchase", "bulk_redeem"]);

function getCashierVerificationErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Mobile Client",
    genericLabel: "verify this cashier QR code",
    fallbackMessage:
      "We could not verify this cashier QR code right now. Try again, and if the problem continues, contact support.",
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
    const qrCode = normalizeCashierQrCode(payload?.qrCode);
    const requestedFlow = `${payload?.requestedFlow || "fuel_purchase"}`
      .trim()
      .toLowerCase();

    if (!qrCode) {
      return NextResponse.json(
        {
          success: false,
          message: "Cashier QR code is required.",
        },
        { status: 400 },
      );
    }

    if (!ALLOWED_FLOWS.has(requestedFlow)) {
      return NextResponse.json(
        {
          success: false,
          message: "Requested flow is invalid.",
        },
        { status: 400 },
      );
    }

    const cashier = await resolveVerifiedCashier(qrCode);

    if (!cashier) {
      return NextResponse.json(
        {
          success: false,
          message: "The scanned cashier QR code is not recognized.",
          contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
        },
        { status: 404 },
      );
    }

    const capabilityKey =
      requestedFlow === "bulk_redeem" ? "redeemBulkFuel" : "buyFuel";

    if (!cashier.capabilities?.[capabilityKey]) {
      return NextResponse.json(
        {
          success: false,
          message: "The scanned cashier cannot process this fuel flow.",
          contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
      requestedFlow,
      verifiedAt: new Date().toISOString(),
      cashier,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        contractVersion: CLIENT_PAYMENT_CONTRACT_VERSION,
        message: getCashierVerificationErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
