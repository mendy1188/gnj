"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentSession } from "@/features/auth/server";
import { saveNotificationSettings } from "@/features/notifications/server";

function toNotificationSettingsUrl(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `/notification-settings?${query}` : "/notification-settings";
}

async function requireNotificationSettingsAccess() {
  const session = await requireCurrentSession();

  if (session.mustChangePassword) {
    redirect("/change-password");
  }

  if (
    !session.modules?.includes("admin") &&
    !session.modules?.includes("notification-settings")
  ) {
    redirect("/dashboard");
  }

  return session;
}

export async function saveNotificationSettingsAction(formData) {
  const session = await requireNotificationSettingsAccess();

  try {
    await saveNotificationSettings({
      creditDueLookaheadDays: formData.get("creditDueLookaheadDays"),
      popupEnabled: formData.get("popupEnabled") === "on",
      emailEnabled: formData.get("emailEnabled") === "on",
      smsEnabled: formData.get("smsEnabled") === "on",
      dailyRunHour: formData.get("dailyRunHour"),
      status: formData.get("status"),
      updatedByUserId: session.userId || "",
      updatedByName: session.fullName || "System",
    });
  } catch (error) {
    const errorMessage = `${error?.message || ""}`;
    const message = errorMessage.toLowerCase().includes("not found")
      ? "Notification settings storage is not ready. Run the latest database schema update first."
      : errorMessage ||
        "Notification settings could not be saved. Contact support or admin.";

    redirect(
      toNotificationSettingsUrl({
        error: message,
      }),
    );
  }

  revalidatePath("/notification-settings");
  redirect(
    toNotificationSettingsUrl({
      success: "Notification settings updated.",
    }),
  );
}
