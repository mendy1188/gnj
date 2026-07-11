"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hashPassword } from "@/features/auth/password";
import { requireModuleAccess } from "@/features/auth/server";
import {
  createClientUserRecord,
  saveRewardSettings,
} from "@/features/client-users/data";

function toRewardsManagementUrl(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `/rewards-management?${query}` : "/rewards-management";
}

export async function createClientUserAction(formData) {
  await requireModuleAccess("rewards-management");

  const fullName = `${formData.get("fullName") || ""}`.trim();
  const email = `${formData.get("email") || ""}`.trim().toLowerCase();
  const phone = `${formData.get("phone") || ""}`.trim();
  const password = `${formData.get("password") || ""}`;
  const userType = `${formData.get("userType") || "individual"}`.trim().toLowerCase();
  const companyName = `${formData.get("companyName") || ""}`.trim();
  const preferredProvider = `${formData.get("preferredProvider") || "wave"}`.trim();
  const waveNumber = `${formData.get("waveNumber") || ""}`.trim();
  const qmoneyNumber = `${formData.get("qmoneyNumber") || ""}`.trim();
  const afrimoneyNumber = `${formData.get("afrimoneyNumber") || ""}`.trim();

  if (!fullName || !email || !phone || !password) {
    redirect(toRewardsManagementUrl({ error: "Complete all required client user fields." }));
  }

  if (userType === "company" && !companyName) {
    redirect(toRewardsManagementUrl({ error: "Company or organization name is required." }));
  }

  try {
    await createClientUserRecord({
      fullName,
      email,
      phone,
      passwordHash: hashPassword(password),
      userType,
      companyName,
      preferredProvider,
      providerNumbers: {
        wave: waveNumber,
        qmoney: qmoneyNumber,
        afrimoney: afrimoneyNumber,
      },
    });
  } catch (error) {
    if (error?.code === 409) {
      redirect(
        toRewardsManagementUrl({
          error: "A client account with that email already exists.",
        }),
      );
    }

    throw error;
  }

  revalidatePath("/rewards-management");
  redirect(toRewardsManagementUrl({ success: "Client user created successfully." }));
}

export async function saveRewardSettingsAction(formData) {
  const session = await requireModuleAccess("rewards-management");
  const cashBackPercent = Number(formData.get("cashBackPercent") ?? 0);

  await saveRewardSettings({
    cashBackPercent,
    updatedByUserId: session.userId || "",
    updatedByName: session.fullName || "System",
  });

  revalidatePath("/rewards-management");
  redirect(toRewardsManagementUrl({ success: "Reward settings updated." }));
}
