"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createRoleRecord,
  createUserRecord,
  deleteUserRecord,
  getUserById,
  getRoleById,
  updateRoleModules,
  updateUserPassword,
  updateUserStatus,
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

function revalidateAdminRoutes() {
  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

async function loadUserForAdmin(userId) {
  try {
    return await getUserById(userId);
  } catch {
    return null;
  }
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

  revalidateAdminRoutes();
  redirect(toAdminUrl({ success: "User created successfully." }));
}

export async function resetUserPasswordAction(formData) {
  await requireModuleAccess("admin");

  const userId = String(formData.get("userId") || "").trim();
  const password = String(formData.get("password") || "");

  if (!userId || password.length < 8) {
    return {
      success: false,
      message:
        "Select a user and enter a temporary password of at least 8 characters.",
    };
  }

  const user = await loadUserForAdmin(userId);

  if (!user) {
    return {
      success: false,
      message: "Selected user could not be found.",
    };
  }

  const updatedUser = await updateUserPassword(user.id, hashPassword(password), {
    mustChangePassword: true,
  });
  return {
    success: true,
    message: `${user.fullName || "User"} password reset. They must change it at next sign-in.`,
    user: updatedUser,
  };
}

export async function updateUserStatusAction(formData) {
  const session = await requireModuleAccess("admin");

  const userId = String(formData.get("userId") || "").trim();
  const status = String(formData.get("status") || "").trim().toLowerCase();

  if (!userId || !["active", "inactive"].includes(status)) {
    return {
      success: false,
      message: "Select a valid user status.",
    };
  }

  if (userId === session.userId && status !== "active") {
    return {
      success: false,
      message: "You cannot deactivate your own account.",
    };
  }

  const user = await loadUserForAdmin(userId);

  if (!user) {
    return {
      success: false,
      message: "Selected user could not be found.",
    };
  }

  const updatedUser = await updateUserStatus(user.id, status);
  return {
    success: true,
    message: `${user.fullName || "User"} status changed to ${status}.`,
    user: updatedUser,
  };
}

export async function deleteUserAction(formData) {
  const session = await requireModuleAccess("admin");

  const userId = String(formData.get("userId") || "").trim();

  if (!userId) {
    return {
      success: false,
      message: "Select a user to delete.",
    };
  }

  if (userId === session.userId) {
    return {
      success: false,
      message: "You cannot delete your own account.",
    };
  }

  const user = await loadUserForAdmin(userId);

  if (!user) {
    return {
      success: false,
      message: "Selected user could not be found.",
    };
  }

  await deleteUserRecord(user.id);
  return {
    success: true,
    message: `${user.fullName || "User"} was deleted.`,
    deletedUserId: user.id,
  };
}

export async function createRoleAction(formData) {
  await requireModuleAccess("admin");

  const name = String(formData.get("roleName") || "").trim();
  const branchRequired = String(formData.get("branchRequired") || "") === "on";
  const modules = formData
    .getAll("modules")
    .map((value) => String(value || ""))
    .filter(Boolean);

  if (!name) {
    redirect(toAdminUrl({ error: "Role name is required." }));
  }

  try {
    await createRoleRecord({
      name,
      branchRequired,
      modules,
    });
  } catch (error) {
    if (error?.code === 409) {
      redirect(
        toAdminUrl({ error: "A role with that name or code already exists." }),
      );
    }

    throw error;
  }

  revalidateAdminRoutes();
  redirect(toAdminUrl({ success: "Role created successfully." }));
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
  revalidateAdminRoutes();
  redirect(toAdminUrl({ success: "Role permissions updated." }));
}
