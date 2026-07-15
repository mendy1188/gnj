import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import {
  markAllUserNotificationsRead,
  markUserNotificationRead,
} from "@/features/notifications/server";

export async function POST(request) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Sign in to update notifications." },
      { status: 401 },
    );
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const notificationId = `${payload?.notificationId || ""}`.trim();

    if (payload?.markAll) {
      const updatedCount = await markAllUserNotificationsRead(session.userId);
      return NextResponse.json({ success: true, updatedCount });
    }

    if (!notificationId) {
      return NextResponse.json(
        { success: false, message: "Notification ID is required." },
        { status: 400 },
      );
    }

    const notification = await markUserNotificationRead(
      session.userId,
      notificationId,
    );

    return NextResponse.json({ success: true, notification });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getUserFacingErrorMessage(error, {
          moduleName: "Notifications",
          genericLabel: "update notifications",
          fallbackMessage: "We could not update notifications right now.",
        }),
      },
      { status: 500 },
    );
  }
}
