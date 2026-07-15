"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AppIcon } from "@/components/ui/AppIcon";

function formatNotificationTime(value) {
  const parsedDate = value ? new Date(value) : null;

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPriorityClassName(priority) {
  if (priority === "critical") {
    return "border-rose-100 bg-rose-50 text-rose-900";
  }

  if (priority === "warning") {
    return "border-amber-100 bg-amber-50 text-amber-900";
  }

  return "border-sky-100 bg-sky-50 text-sky-900";
}

export default function NotificationBell({ isCompact = false }) {
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");

  const hasUnread = unreadCount > 0;
  const visibleUnreadCount = useMemo(
    () => (unreadCount > 9 ? "9+" : `${unreadCount}`),
    [unreadCount],
  );

  async function loadNotifications() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/notifications", {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Notifications could not be loaded.");
      }

      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
      setUnreadCount(Number(payload.unreadCount || 0));
    } catch (loadError) {
      setError(loadError?.message || "Notifications could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  async function markAllRead() {
    if (!hasUnread) {
      return;
    }

    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;

    setUnreadCount(0);
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, status: "read" })),
    );

    try {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ markAll: true }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Notifications could not be updated.");
      }
    } catch {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
    }
  }

  useEffect(() => {
    loadNotifications();

    function refreshOnFocus() {
      if (document.visibilityState === "visible") {
        loadNotifications();
      }
    }

    window.addEventListener("focus", loadNotifications);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", loadNotifications);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, []);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
          if (!isOpen) {
            loadNotifications();
          }
        }}
        className={`relative inline-flex cursor-pointer items-center justify-center border border-slate-200 bg-slate-100 text-slate-700 transition hover:bg-slate-200 ${
          isCompact
            ? "h-10 w-10 rounded-2xl text-lg sm:h-10 sm:w-10 lg:h-11 lg:w-11 lg:rounded-3xl"
            : "h-11 w-11 rounded-3xl"
        }`}
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <AppIcon name="bell" className="h-5 w-5" />
        {hasUnread ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white ring-2 ring-white">
            {visibleUnreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
              <p className="text-xs text-slate-500">
                {hasUnread ? `${unreadCount} unread` : "No unread notifications"}
              </p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!hasUnread}
              className="cursor-pointer rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto p-3">
            {isLoading ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                Loading notifications...
              </div>
            ) : error ? (
              <div className="rounded-2xl bg-rose-50 px-4 py-5 text-sm text-rose-700">
                {error}
              </div>
            ) : notifications.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                No notifications yet.
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((notification) => (
                  <article
                    key={notification.id}
                    className={`rounded-2xl border px-4 py-3 ${getPriorityClassName(notification.priority)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold">{notification.title}</h3>
                      {notification.status === "unread" ? (
                        <span className="mt-1 h-2 w-2 rounded-full bg-rose-500" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 opacity-80">
                      {notification.message}
                    </p>
                    <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] opacity-60">
                      {formatNotificationTime(notification.createdAt)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
