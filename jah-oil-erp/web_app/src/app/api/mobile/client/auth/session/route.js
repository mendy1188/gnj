import { NextResponse } from "next/server";

import { getUserFacingErrorMessage } from "@/features/errors/copy";

import { getClientRequestSession, sanitizeClientSession } from "../_shared";

function getClientSessionErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Client Authentication",
    genericLabel: "load your session",
    fallbackMessage:
      "We could not load your session right now. Try again, and if the problem continues, contact support.",
  });
}

export async function GET(request) {
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

    return NextResponse.json({
      success: true,
      session: sanitizeClientSession(session),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getClientSessionErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
