"use client";

import { useEffect, useMemo, useState } from "react";

import CashierQrCodeButton from "@/components/admin/CashierQrCodeButton";
import ToastMessage from "@/components/ui/ToastMessage";

import {
  deleteUserAction,
  resetUserPasswordAction,
  updateUserStatusAction,
} from "./actions";

const USERS_PAGE_SIZE = 10;

function getStatusBadgeClassName(status) {
  return status === "active"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : "bg-slate-100 text-slate-600 ring-slate-200";
}

function getPasswordLabel(user) {
  return user.mustChangePassword ? "Pending change" : "Updated";
}

function getPageItems(records, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  return {
    currentPage,
    totalPages,
    startIndex,
    endIndex: Math.min(startIndex + pageSize, records.length),
    records: records.slice(startIndex, startIndex + pageSize),
  };
}

function mergeUser(records, updatedUser) {
  if (!updatedUser?.id) {
    return records;
  }

  return records.map((user) =>
    user.id === updatedUser.id ? { ...user, ...updatedUser } : user,
  );
}

export default function AdminUsersPanel({ users = [] }) {
  const [records, setRecords] = useState(users);
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pendingAction, setPendingAction] = useState("");
  const [message, setMessage] = useState(null);

  useEffect(() => {
    setRecords(users);
    setSelectedUserId((current) =>
      users.some((user) => user.id === current) ? current : users[0]?.id || "",
    );
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return records;
    }

    return records.filter((user) =>
      [
        user.fullName,
        user.email,
        user.roleName,
        user.branchName || "All branches",
        user.status,
        getPasswordLabel(user),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [records, searchTerm]);
  const pagination = useMemo(
    () => getPageItems(filteredUsers, page, USERS_PAGE_SIZE),
    [filteredUsers, page],
  );
  const selectedUser = useMemo(
    () =>
      records.find((user) => user.id === selectedUserId) ||
      filteredUsers[0] ||
      records[0] ||
      null,
    [filteredUsers, records, selectedUserId],
  );

  useEffect(() => {
    if (pagination.currentPage !== page) {
      setPage(pagination.currentPage);
    }
  }, [page, pagination.currentPage]);

  useEffect(() => {
    if (!selectedUser && records.length === 0) {
      setSelectedUserId("");
      return;
    }

    if (selectedUser && selectedUser.id !== selectedUserId) {
      setSelectedUserId(selectedUser.id);
    }
  }, [records.length, selectedUser, selectedUserId]);

  function handleResult(result) {
    setMessage({
      type: result?.success ? "success" : "error",
      text: result?.message || "Action completed.",
    });

    if (result?.user) {
      setRecords((current) => mergeUser(current, result.user));
      setSelectedUserId(result.user.id);
    }

    if (result?.deletedUserId) {
      setRecords((current) =>
        current.filter((user) => user.id !== result.deletedUserId),
      );
      setSelectedUserId((current) =>
        current === result.deletedUserId ? "" : current,
      );
    }
  }

  async function runUserAction(actionName, form, action) {
    const formData = new FormData(form);

    setPendingAction(actionName);
    setMessage(null);

    try {
      const result = await action(formData);
      handleResult(result);

      if (result?.success && actionName === "reset") {
        form.reset();
      }
    } catch {
      setMessage({
        type: "error",
        text: "The user update could not be completed. Please try again.",
      });
    } finally {
      setPendingAction("");
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.05)] xl:col-span-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Users</h2>
          <p className="mt-1 text-sm text-slate-500">
            Click a user to reset password, update status, or remove access.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
            placeholder="Search users..."
            className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none sm:w-64"
          />
          <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
            {filteredUsers.length} of {records.length} users
          </span>
        </div>
      </div>

      <ToastMessage
        message={message?.text || ""}
        tone={message?.type === "success" ? "success" : message ? "error" : "info"}
        onClose={() => setMessage(null)}
      />

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
            {pagination.records.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                  No users found
                </td>
              </tr>
            ) : (
              pagination.records.map((user) => {
                const isSelected = user.id === selectedUser?.id;

                return (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`cursor-pointer align-top transition hover:bg-slate-50 ${
                      isSelected ? "bg-sky-50/70 ring-2 ring-sky-200 ring-inset" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{user.fullName}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                      {user.roleName === "Fuel Sales" ? (
                        <span onClick={(event) => event.stopPropagation()}>
                          <CashierQrCodeButton
                            userName={user.fullName}
                            branchName={user.branchName}
                            qrCode={user.cashierQrCode}
                          />
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{user.roleName}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {user.branchName || "All branches"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ${getStatusBadgeClassName(user.status)}`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {getPasswordLabel(user)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {filteredUsers.length === 0
            ? "Showing 0 users"
            : `Page ${pagination.currentPage}, ${pagination.endIndex} of ${filteredUsers.length} users`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pagination.currentPage <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="cursor-pointer rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={pagination.currentPage >= pagination.totalPages}
            onClick={() =>
              setPage((current) => Math.min(pagination.totalPages, current + 1))
            }
            className="cursor-pointer rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {selectedUser ? (
        <div
          key={`${selectedUser.id}-${selectedUser.status}-${selectedUser.mustChangePassword}`}
          className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
                Selected user
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">
                {selectedUser.fullName}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {selectedUser.email} · {selectedUser.roleName}
              </p>
            </div>
            <span
              className={`w-fit rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${getStatusBadgeClassName(selectedUser.status)}`}
            >
              {selectedUser.status}
            </span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                runUserAction("reset", event.currentTarget, resetUserPasswordAction);
              }}
              className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
            >
              <input type="hidden" name="userId" value={selectedUser.id} />
              <label
                htmlFor={`password-${selectedUser.id}`}
                className="block text-sm font-semibold text-slate-700"
              >
                Reset password
              </label>
              <input
                id={`password-${selectedUser.id}`}
                name="password"
                type="password"
                minLength={8}
                required
                placeholder="Temporary password"
                className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={pendingAction === "reset"}
                className="mt-3 inline-flex cursor-pointer rounded-2xl bg-sky-600 px-3 py-1 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {pendingAction === "reset" ? "Saving..." : "Reset password"}
              </button>
            </form>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                runUserAction("status", event.currentTarget, updateUserStatusAction);
              }}
              className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
            >
              <input type="hidden" name="userId" value={selectedUser.id} />
              <label
                htmlFor={`status-${selectedUser.id}`}
                className="block text-sm font-semibold text-slate-700"
              >
                Change status
              </label>
              <select
                id={`status-${selectedUser.id}`}
                name="status"
                defaultValue={selectedUser.status === "active" ? "active" : "inactive"}
                className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <button
                type="submit"
                disabled={pendingAction === "status"}
                className="mt-3 inline-flex cursor-pointer rounded-2xl bg-sky-600 px-3 py-1 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {pendingAction === "status" ? "Saving..." : "Save status"}
              </button>
            </form>

            <form
              onSubmit={(event) => {
                event.preventDefault();

                if (
                  !window.confirm(
                    `Delete ${selectedUser.fullName || "this user"}? This removes their login access.`,
                  )
                ) {
                  return;
                }

                runUserAction("delete", event.currentTarget, deleteUserAction);
              }}
              className="rounded-2xl bg-white p-4 ring-1 ring-rose-100"
            >
              <input type="hidden" name="userId" value={selectedUser.id} />
              <p className="text-sm font-semibold text-slate-700">Delete user</p>
              <p className="mt-3 text-sm text-slate-500">
                Removes this user from ERP login. Historical transactions keep
                their saved cashier name.
              </p>
              <button
                type="submit"
                disabled={pendingAction === "delete"}
                className="mt-3 inline-flex cursor-pointer rounded-2xl bg-rose-600 px-3 py-1 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {pendingAction === "delete" ? "Deleting..." : "Delete user"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
