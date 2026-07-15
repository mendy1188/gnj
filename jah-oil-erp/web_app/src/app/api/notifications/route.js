import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { listUserNotifications } from "@/features/notifications/server";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Sign in to view notifications." },
      { status: 401 },
    );
  }

  try {
    const result = await listUserNotifications(session.userId, { limit: 20 });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getUserFacingErrorMessage(error, {
          moduleName: "Notifications",
          genericLabel: "load notifications",
          fallbackMessage: "We could not load notifications right now.",
        }),
      },
      { status: 500 },
    );
  }
}
