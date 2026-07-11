import { NextResponse } from "next/server";

import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { getRequestSession } from "@/features/auth/request-session";

function getMobileSessionErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Mobile Authentication",
    genericLabel: "load your session",
    fallbackMessage:
      "We could not load your session right now. Try again, and if the problem continues, contact your system administrator or support.",
  });
}

export async function GET(request) {
  try {
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

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getMobileSessionErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
