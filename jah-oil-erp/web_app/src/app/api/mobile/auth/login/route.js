import { NextResponse } from "next/server";

import { authenticateCredentials } from "@/features/auth/authenticate";
import { getUserFacingErrorMessage } from "@/features/errors/copy";
import { createSessionToken } from "@/features/auth/session";

function getMobileLoginErrorMessage(error) {
  return getUserFacingErrorMessage(error, {
    moduleName: "Mobile Authentication",
    genericLabel: "sign you in",
    fallbackMessage:
      "We could not sign you in right now. Try again in a moment, and if the problem continues, contact your system administrator or support.",
  });
}

function sanitizeSession(session) {
  if (!session) {
    return null;
  }

  return {
    userId: session.userId,
    fullName: session.fullName,
    email: session.email,
    roleId: session.roleId,
    roleName: session.roleName,
    modules: session.modules,
    branchId: session.branchId,
    branchName: session.branchName,
    mustChangePassword: Boolean(session.mustChangePassword),
    status: session.status || "active",
  };
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => null);
    const email = payload?.email;
    const password = payload?.password;
    const result = await authenticateCredentials(email, password);

    if (!result.success || !result.session) {
      return NextResponse.json(
        {
          success: false,
          message: result.message || "Invalid credentials.",
        },
        { status: 401 },
      );
    }

    const token = await createSessionToken(result.session);

    return NextResponse.json({
      success: true,
      token,
      session: sanitizeSession(result.session),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getMobileLoginErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
