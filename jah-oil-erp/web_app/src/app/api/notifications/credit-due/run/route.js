import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/server";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { runCreditDueNotificationCheck } from "@/features/notifications/server";

function hasValidJobSecret(request) {
  const configuredSecret = `${process.env.NOTIFICATION_JOB_SECRET || ""}`.trim();

  if (!configuredSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  return token === configuredSecret;
}

async function canRunNotificationJob(request) {
  if (hasValidJobSecret(request)) {
    return true;
  }

  const session = await getCurrentSession();

  return Boolean(session?.modules?.includes("admin"));
}

export async function POST(request) {
  if (!(await canRunNotificationJob(request))) {
    return NextResponse.json(
      { success: false, message: "You do not have access to run this job." },
      { status: 403 },
    );
  }

  try {
    const summary = await runCreditDueNotificationCheck();
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getUserFacingErrorMessage(error, {
          moduleName: "Credit Due Notifications",
          genericLabel: "run credit due notifications",
          fallbackMessage: "We could not run credit due notifications right now.",
        }),
      },
      { status: 500 },
    );
  }
}
