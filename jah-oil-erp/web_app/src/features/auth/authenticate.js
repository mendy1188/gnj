import "server-only";

import { findUserByEmail, getRoleById } from "@/features/auth/data";
import { verifyPassword } from "@/features/auth/password";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_SESSION,
} from "@/features/auth/session";

function buildUserSession(user, role) {
  return {
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
    roleId: role.id,
    roleName: role.name,
    modules: role.modules,
    branchId: user.branchId,
    branchName: user.branchName,
    mustChangePassword: user.mustChangePassword,
    status: user.status,
  };
}

function isDemoLoginEnabled() {
  return process.env.ALLOW_DEMO_LOGIN === "true";
}

export async function authenticateCredentials(emailInput, passwordInput) {
  const email = String(emailInput || "").trim().toLowerCase();
  const password = String(passwordInput || "");

  try {
    const user = await findUserByEmail(email);

    if (user && user.status !== "active") {
      return {
        success: false,
        message: "This user account is inactive.",
      };
    }

    if (user?.status === "active" && verifyPassword(password, user.passwordHash)) {
      const role = await getRoleById(user.roleId);

      if (!role || role.status !== "active") {
        return {
          success: false,
          message: "Assigned role is inactive. Contact the system administrator.",
        };
      }

      return {
        success: true,
        session: buildUserSession(user, role),
      };
    }
  } catch (error) {
    console.error("Appwrite auth lookup failed:", error);
  }

  if (isDemoLoginEnabled() && email === DEMO_EMAIL && password === DEMO_PASSWORD) {
    return {
      success: true,
      session: DEMO_SESSION,
    };
  }

  return {
    success: false,
    message: "Invalid credentials.",
  };
}
