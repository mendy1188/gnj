"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createUserRecord,
  getRoleById,
  updateRoleModules,
} from "@/features/auth/data";
import { hashPassword } from "@/features/auth/password";
import { requireModuleAccess } from "@/features/auth/server";

function toAdminUrl(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `/admin?${query}` : "/admin";
}

export async function createUserAction(formData) {
  await requireModuleAccess("admin");

  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const roleId = String(formData.get("roleId") || "");
  const branchValue = String(formData.get("branchId") || "");
  const [branchId = "", branchName = ""] = branchValue.split("::");

  if (!fullName || !email || !password || !roleId) {
    redirect(toAdminUrl({ error: "Complete all required user fields." }));
  }

  const role = await getRoleById(roleId);

  if (!role || role.status !== "active") {
    redirect(toAdminUrl({ error: "Selected role is unavailable." }));
  }

  if (role.branchRequired && !branchId) {
    redirect(toAdminUrl({ error: "Selected role requires a branch." }));
  }

  try {
    await createUserRecord({
      fullName,
      email,
      role,
      branchId,
      branchName,
      passwordHash: hashPassword(password),
      mustChangePassword: true,
    });
  } catch (error) {
    if (error?.code === 409) {
      redirect(toAdminUrl({ error: "A user with that email already exists." }));
    }

    throw error;
  }

  revalidatePath("/admin");
  redirect(toAdminUrl({ success: "User created successfully." }));
}

export async function updateRoleModulesAction(formData) {
  await requireModuleAccess("admin");

  const roleId = String(formData.get("roleId") || "");
  const modules = formData
    .getAll("modules")
    .map((value) => String(value || ""))
    .filter(Boolean);

  if (!roleId) {
    redirect(toAdminUrl({ error: "Role selection is required." }));
  }

  await updateRoleModules(roleId, modules);
  revalidatePath("/admin");
  redirect(toAdminUrl({ success: "Role permissions updated." }));
}
