import "server-only";

import { verifyPassword } from "@/features/auth/password";
import { findClientUserByEmail } from "@/features/client-users/data";
import { buildClientSession } from "@/features/client-users/session";

export async function authenticateClientCredentials(emailInput, passwordInput) {
  const email = String(emailInput || "").trim().toLowerCase();
  const password = String(passwordInput || "");

  if (!email || !password) {
    return {
      success: false,
      message: "Email and password are required.",
    };
  }

  let user = null;

  try {
    user = await findClientUserByEmail(email);
  } catch (error) {
    console.error("Client auth lookup failed:", error);
  }

  if (!user) {
    return {
      success: false,
      message: "Invalid credentials.",
    };
  }

  if (user.status !== "active") {
    return {
      success: false,
      message: "This client account is inactive.",
    };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return {
      success: false,
      message: "Invalid credentials.",
    };
  }

  return {
    success: true,
    session: buildClientSession(user),
    user,
  };
}
