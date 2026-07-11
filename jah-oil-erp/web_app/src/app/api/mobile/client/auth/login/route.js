import { NextResponse } from "next/server";

import { createSessionToken } from "@/features/auth/session";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { authenticateClientCredentials } from "@/features/client-users/authenticate";

import { sanitizeClientSession } from "../_shared";

function getClientLoginErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Client Authentication",
    genericLabel: "sign you in",
    fallbackMessage:
      "We could not sign you in right now. Try again in a moment, and if the problem continues, contact support.",
  });
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => null);
    const result = await authenticateClientCredentials(
      payload?.email,
      payload?.password,
    );

    if (!result.success || !result.session) {
      return NextResponse.json(
        {
          success: false,
          message: result.message || "Invalid credentials.",
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      token: await createSessionToken(result.session),
      session: sanitizeClientSession(result.session),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getClientLoginErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
