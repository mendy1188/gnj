import { NextResponse } from "next/server";

import { getUserById, updateUserPassword } from "@/features/auth/data";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { hashPassword } from "@/features/auth/password";
import { getRequestSession } from "@/features/auth/request-session";

function getMobileChangePasswordErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Mobile Authentication",
    genericLabel: "change your password",
    fallbackMessage:
      "We could not update your password right now. Try again, and if the problem continues, contact your system administrator or support.",
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
    const password = String(payload?.password || "");
    const confirmPassword = String(payload?.confirmPassword || "");

    if (!session.mustChangePassword) {
      return NextResponse.json({
        success: true,
        message: "Password change is not required.",
      });
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "Passwords do not match.",
        },
        { status: 400 },
      );
    }

    let user;

    try {
      user = await getUserById(session.userId);
    } catch {
      user = null;
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Unable to locate the current user.",
        },
        { status: 404 },
      );
    }

    const updatedUser = await updateUserPassword(user.id, hashPassword(password));

    return NextResponse.json({
      success: true,
      mustChangePassword: Boolean(updatedUser.mustChangePassword),
      message: "Password updated successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getMobileChangePasswordErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
