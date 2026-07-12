import { NextResponse } from "next/server";

import { getRequestSession } from "@/features/auth/request-session";
import { upsertPosDeviceSyncStatus } from "@/features/pos/server/device-sync-status";

export const dynamic = "force-dynamic";

export async function POST(request) {
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
        message: "Invalid POS sync status payload.",
      },
      { status: 400 },
    );
  }

  const result = await upsertPosDeviceSyncStatus({
    session,
    payload: {
      ...payload,
      platform: "mobile",
    },
    moduleName: "Mobile POS",
  });

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
