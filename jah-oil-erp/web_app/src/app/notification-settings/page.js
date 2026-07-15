import { redirect } from "next/navigation";

import ToastMessage from "@/components/ui/ToastMessage";
import { buildDashboardShellProps } from "@/features/auth/shell";
import { requireCurrentSession } from "@/features/auth/server";
import DashboardPageShell from "@/features/dashboard/page-shell";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import { getNotificationSettings } from "@/features/notifications/server";

import { saveNotificationSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

const SAVE_BUTTON_CLASS =
  "cursor-pointer rounded-2xl bg-gradient-to-r from-sky-600 to-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:from-sky-700 hover:to-sky-600";

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

function SettingToggle({ id, name, title, description, defaultChecked }) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}

function SummaryCard({ title, value, helper }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_80px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

function formatUpdatedAt(value) {
  const parsedDate = value ? new Date(value) : null;

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function NotificationSettingsPage({ searchParams }) {
  const session = await requireNotificationSettingsAccess();
  const shellProps = buildDashboardShellProps(session);
  const params = await searchParams;

  let settings;

  try {
    settings = await getNotificationSettings();
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Notification Settings"
        pageDescription="Configure credit due notification channels and timing."
        error={error}
      />
    );
  }

  const error = typeof params?.error === "string" ? params.error : "";
  const success = typeof params?.success === "string" ? params.success : "";

  return (
    <DashboardPageShell
      title="Notification Settings"
      description="Configure popup, email, and SMS notification rules for credit accounts."
      {...shellProps}
    >
      <ToastMessage
        message={error || success}
        tone={error ? "error" : success ? "success" : "info"}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Credit reminder window"
          value={`${settings.creditDueLookaheadDays} day${
            settings.creditDueLookaheadDays === 1 ? "" : "s"
          }`}
          helper="Accounts due inside this window are included."
        />
        <SummaryCard
          title="Popup"
          value={settings.popupEnabled ? "Enabled" : "Disabled"}
          helper="Shown in the dashboard notification bell."
        />
        <SummaryCard
          title="Creditor channels"
          value={[
            settings.emailEnabled ? "Email" : null,
            settings.smsEnabled ? "SMS" : null,
          ].filter(Boolean).join(" + ") || "None"}
          helper="Requires configured provider webhooks."
        />
      </div>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-slate-900">
            Credit Due Notification Parameters
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            These settings control who gets popup notifications and whether creditors
            receive email or SMS reminders when credit accounts are due soon or overdue.
          </p>
        </div>

        <form action={saveNotificationSettingsAction} className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <label
                htmlFor="creditDueLookaheadDays"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
              >
                remind before due date
              </label>
              <input
                id="creditDueLookaheadDays"
                name="creditDueLookaheadDays"
                type="number"
                min="0"
                step="1"
                defaultValue={settings.creditDueLookaheadDays}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Example: 3 means notify for accounts due in the next 3 days.
              </p>
            </div>

            <div>
              <label
                htmlFor="dailyRunHour"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
              >
                preferred daily run hour
              </label>
              <input
                id="dailyRunHour"
                name="dailyRunHour"
                type="number"
                min="0"
                max="23"
                step="1"
                defaultValue={settings.dailyRunHour}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Use this hour when scheduling the notification job.
              </p>
            </div>

            <div>
              <label
                htmlFor="status"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
              >
                status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={settings.status}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Inactive settings stop the credit notification job.
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SettingToggle
              id="popupEnabled"
              name="popupEnabled"
              title="Popup notifications"
              description="Notify eligible ERP users in the dashboard bell."
              defaultChecked={settings.popupEnabled}
            />
            <SettingToggle
              id="emailEnabled"
              name="emailEnabled"
              title="Creditor email"
              description="Send creditor emails when an email webhook is configured."
              defaultChecked={settings.emailEnabled}
            />
            <SettingToggle
              id="smsEnabled"
              name="smsEnabled"
              title="Creditor SMS"
              description="Send creditor SMS when an SMS webhook is configured."
              defaultChecked={settings.smsEnabled}
            />
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Email and SMS require provider webhook URLs in the server environment.
            If a channel is enabled without a provider URL, delivery records will be
            logged as skipped.
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Last updated by {settings.updatedByName || "System"}{" "}
              {settings.updatedAt ? `on ${formatUpdatedAt(settings.updatedAt)}` : ""}
            </p>
            <button type="submit" className={SAVE_BUTTON_CLASS}>
              Save notification settings
            </button>
          </div>
        </form>
      </section>
    </DashboardPageShell>
  );
}
