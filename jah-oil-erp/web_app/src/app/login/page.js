import { redirect } from "next/navigation";

import { loginAction } from "@/features/auth/actions";
import ToastMessage from "@/components/ui/ToastMessage";

import LoginSubmitButton from "./LoginSubmitButton";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const redirectTo =
    typeof params?.redirectTo === "string" ? params.redirectTo : "/dashboard";
  const error = typeof params?.error === "string" ? params.error : "";

  async function loginWithRedirect(formData) {
    "use server";

    const result = await loginAction(formData);

    if (result?.success === false) {
      const nextParams = new URLSearchParams();
      nextParams.set("redirectTo", redirectTo);
      nextParams.set("error", result.message || "Invalid credentials.");
      redirect(`/login?${nextParams.toString()}`);
    }

    redirect(result?.redirectTo || redirectTo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 shadow-xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white">JAH MULTI INDUSTRIES</h1>
            <p className="mt-2 text-slate-400">Integrated Operations Platfrom</p>
          </div>

          <ToastMessage message={error} tone="error" />

          <form action={loginWithRedirect} className="space-y-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-300"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="Enter your Jah Oil email address"
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300"
              >
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Your password"
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                required
              />
            </div>

            <LoginSubmitButton />
          </form>
        </div>
      </div>
    </div>
  );
}
