import DashboardPageShell from "@/features/dashboard/page-shell";
import DashboardErrorFallback from "@/features/errors/DashboardErrorFallback";
import { AppIcon } from "@/components/ui/AppIcon";
import Link from "next/link";
import { listRoles, listUsers } from "@/features/auth/data";
import { buildDashboardShellProps } from "@/features/auth/shell";
import { MODULE_DEFINITIONS } from "@/features/auth/session";
import { requireModuleAccess } from "@/features/auth/server";
import { getStationsData } from "@/lib/data/appwrite-data";

import { createUserAction, updateRoleModulesAction } from "./actions";
import CashierQrCodeButton from "@/components/admin/CashierQrCodeButton";

export const dynamic = "force-dynamic";

function StatusBanner({ error, success }) {
  if (!error && !success) {
    return null;
  }

  const tone = error
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${tone}`}>
      {error || success}
    </div>
  );
}

export default async function AdminPage({ searchParams }) {
  const session = await requireModuleAccess("admin");
  const shellProps = buildDashboardShellProps(session);
  const params = await searchParams;

  let roles;
  let users;
  let stations;

  try {
    [roles, users, stations] = await Promise.all([
      listRoles(),
      listUsers(),
      getStationsData(),
    ]);
  } catch (error) {
    return (
      <DashboardErrorFallback
        shellProps={shellProps}
        pageTitle="Admin"
        pageDescription="Manage users, roles, and module access across the ERP."
        error={error}
      />
    );
  }

  const error = typeof params?.error === "string" ? params.error : "";
  const success = typeof params?.success === "string" ? params.success : "";

  return (
    <DashboardPageShell
      title="Admin"
      description="Manage users, roles, and module access across the ERP."
      {...shellProps}
    >
      <StatusBanner error={error} success={success} />

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              POS repair queue
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Review sale and reversal envelopes that need consistency checks.
            </p>
          </div>
          <Link
            href="/admin/pos-repairs"
            className="cursor-pointer inline-flex items-center justify-center rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Open POS repairs
          </Link>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-12">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)] xl:col-span-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Users</h2>
              <p className="mt-1 text-sm text-slate-500">
                Active users, assigned roles, and branch ownership.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
              {users.length} users
            </span>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{user.fullName}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                      {user.roleName === "Fuel Sales" ? (
                        <CashierQrCodeButton
                          userName={user.fullName}
                          branchName={user.branchName}
                          qrCode={user.cashierQrCode}
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{user.roleName}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {user.branchName || "All branches"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {user.mustChangePassword ? "Pending change" : "Updated"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)] xl:col-span-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create User</h2>
            <p className="mt-1 text-sm text-slate-500">
              New users are forced to change password after first sign-in.
            </p>
          </div>

          <form action={createUserAction} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600" htmlFor="fullName">
                Full name
              </label>
              <input
                id="fullName"
                name="fullName"
                required
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-600" htmlFor="password">
                  Temporary password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600" htmlFor="roleId">
                  Role
                </label>
                <select
                  id="roleId"
                  name="roleId"
                  required
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
                >
                  <option value="">Select role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600" htmlFor="branchId">
                Branch
              </label>
              <select
                id="branchId"
                name="branchId"
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="">All branches / not required</option>
                {stations.map((station) => (
                  <option key={station.id} value={`${station.id}::${station.name}`}>
                    {station.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Branch is required for Branch Manager, General Sales, and Fuel Sales.
              </p>
            </div>

            <button
              type="submit"
              className="cursor-pointer inline-flex rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              Create user
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Role Access</h2>
            <p className="mt-1 text-sm text-slate-500">
              Control which modules each role can open from the sidebar and direct routes.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
            {roles.length} roles
          </span>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {roles.map((role) => (
            <form
              key={role.id}
              action={updateRoleModulesAction}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
            >
              <input type="hidden" name="roleId" value={role.id} />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{role.name}</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                    {role.branchRequired ? "Branch scoped" : "Global role"}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {role.modules.length} modules
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {MODULE_DEFINITIONS.map((module) => (
                  <label
                    key={module.key}
                    className="cursor-pointer flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      name="modules"
                      value={module.key}
                      defaultChecked={role.modules.includes(module.key)}
                      disabled={role.code === "admin" && module.key === "admin"}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <AppIcon
                      name={module.icon}
                      className="h-5 w-5 text-slate-600"
                    />
                    <span>{module.label}</span>
                  </label>
                ))}
              </div>

              <button
                type="submit"
                className="cursor-pointer mt-4 inline-flex rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                Save access
              </button>
            </form>
          ))}
        </div>
      </section>
    </DashboardPageShell>
  );
}
