import { NextResponse } from "next/server";

import {
  filterProductsForSession,
  filterStationsForPosSession,
} from "@/features/auth/scopes";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { getRequestSession } from "@/features/auth/request-session";
import {
  getActivePaymentMethodsData,
  getProductsData,
  getStationsData,
} from "@/lib/data/appwrite-data";

export const dynamic = "force-dynamic";

function getMobilePosBootstrapErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Mobile POS",
    genericLabel: "load POS bootstrap data",
    fallbackMessage: "Failed to load POS bootstrap data.",
  });
}

export async function GET(request) {
  const session = await getRequestSession(request);

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        message: "Unauthorized.",
      },
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

  try {
    const [products, stations, paymentMethods] = await Promise.all([
      getProductsData(),
      getStationsData(),
      getActivePaymentMethodsData(),
    ]);

    return NextResponse.json({
      success: true,
      session,
      products: filterProductsForSession(products, session),
      stations: filterStationsForPosSession(stations, session),
      paymentMethods: paymentMethods.filter(
        (method) => `${method?.code || ""}`.trim().toLowerCase() !== "credit",
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getMobilePosBootstrapErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
