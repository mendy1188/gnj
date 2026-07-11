import { NextResponse } from "next/server";

import { getRequestSession } from "@/features/auth/request-session";
import { completePosSaleAction, reversePosSaleAction } from "@/app/pos/actions";
import { getUserFacingErrorMessage } from "@/features/errors/copy";

export const dynamic = "force-dynamic";

function getMobilePosSyncErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Mobile POS",
    genericLabel: "sync this sale",
    fallbackMessage:
      "We could not sync this sale right now. The sale can stay queued and retry later.",
  });
}

export async function POST(request) {
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

    const payload = await request.json().catch(() => null);

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid sale payload.",
        },
        { status: 400 },
      );
    }

    const syncAction = `${payload?.syncAction || "sale_create"}`
      .trim()
      .toLowerCase();
    const result =
      syncAction === "sale_reverse"
        ? await reversePosSaleAction(payload, {
            sessionOverride: session,
          })
        : await completePosSaleAction(payload, {
            sessionOverride: session,
          });

    return NextResponse.json({
      ...result,
      syncedAt: result?.success ? new Date().toISOString() : "",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getMobilePosSyncErrorMessage(error),
        syncedAt: "",
      },
      { status: 500 },
    );
  }
}
