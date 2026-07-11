import { NextResponse } from "next/server";

import { completePosSaleAction, reversePosSaleAction } from "@/app/pos/actions";
import { getRequestSession } from "@/features/auth/request-session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const session = await getRequestSession(request);

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        message: "Unauthorized.",
        syncedAt: "",
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

  const syncAction = `${payload?.syncAction || "sale_create"}`.trim().toLowerCase();
  const result =
    syncAction === "sale_reverse"
      ? await reversePosSaleAction(payload, { sessionOverride: session })
      : await completePosSaleAction(payload, { sessionOverride: session });

  return NextResponse.json({
    ...result,
    syncedAt: result?.success ? new Date().toISOString() : "",
  });
}
