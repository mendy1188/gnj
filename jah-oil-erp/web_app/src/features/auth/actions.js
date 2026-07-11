"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getUserById,
  updateUserPassword,
} from "@/features/auth/data";
import { hashPassword } from "@/features/auth/password";
import { authenticateCredentials } from "@/features/auth/authenticate";
import {
  clearSessionCookie,
  requireCurrentSession,
  setSessionCookie,
} from "@/features/auth/server";

export async function loginAction(previousStateOrFormData, maybeFormData) {
  const formData =
    maybeFormData && typeof maybeFormData.get === "function"
      ? maybeFormData
      : previousStateOrFormData;
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const redirectTo = String(formData.get("redirectTo") || "/dashboard");
  const result = await authenticateCredentials(email, password);

  if (!result.success || !result.session) {
    return {
      success: false,
      message: result.message || "Invalid credentials.",
    };
  }

  await setSessionCookie(result.session);

  return {
    success: true,
    redirectTo: result.session.mustChangePassword ? "/change-password" : redirectTo,
  };
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

export async function changePasswordAction(formData) {
  const session = await requireCurrentSession();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!session.mustChangePassword) {
    redirect("/dashboard");
  }

  if (password !== confirmPassword) {
    redirect("/change-password?error=Passwords%20do%20not%20match.");
  }

  const user = await getUserById(session.userId);

  if (!user) {
    redirect("/change-password?error=Unable%20to%20locate%20the%20current%20user.");
  }

  const updatedUser = await updateUserPassword(user.id, hashPassword(password));
  const nextSession = {
    ...session,
    mustChangePassword: updatedUser.mustChangePassword,
  };

  await setSessionCookie(nextSession);
  revalidatePath("/admin");
  redirect("/dashboard");
}
