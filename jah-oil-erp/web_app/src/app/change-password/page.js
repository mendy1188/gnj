import { redirect } from "next/navigation";

import { changePasswordAction } from "@/features/auth/actions";
import { getCurrentSession } from "@/features/auth/server";
import ToastMessage from "@/components/ui/ToastMessage";

export default async function ChangePasswordPage({ searchParams }) {
  const session = await getCurrentSession();
  const params = await searchParams;
  const error = typeof params?.error === "string" ? params.error : "";

  if (!session) {
    redirect("/login");
  }

  if (!session.mustChangePassword) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-800 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Change Password</h1>
          <p className="mt-2 text-sm text-slate-400">
            You must set a new password before continuing.
          </p>
        </div>

        <ToastMessage message={error} tone="error" />

        <form action={changePasswordAction} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-300"
            >
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
              className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-slate-300"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              minLength={8}
              required
              className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full cursor-pointer rounded-xl bg-sky-600 py-3 font-semibold text-white transition hover:bg-sky-700"
          >
            Save new password
          </button>
        </form>
      </div>
    </div>
  );
}
