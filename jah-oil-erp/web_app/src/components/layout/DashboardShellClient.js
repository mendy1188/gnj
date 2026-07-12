"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppIcon } from "@/components/ui/AppIcon";
import Sidebar from "./Sidebar";

const CLIENT_REFRESH_STORAGE_PREFIX = "jah-erp-route-refresh:";
const CLIENT_REFRESH_MIN_INTERVAL_MS = 20_000;

function shouldRefreshRoute(pathname = "") {
  return Boolean(pathname) && pathname !== "/pos" && !pathname.startsWith("/login");
}

function readLastRouteRefreshAt(pathname) {
  if (typeof window === "undefined") {
    return 0;
  }

  try {
    return Number.parseInt(
      window.sessionStorage.getItem(`${CLIENT_REFRESH_STORAGE_PREFIX}${pathname}`) ||
        "0",
      10,
    );
  } catch {
    return 0;
  }
}

function writeLastRouteRefreshAt(pathname, timestamp) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${CLIENT_REFRESH_STORAGE_PREFIX}${pathname}`,
      `${timestamp}`,
    );
  } catch {}
}

export default function DashboardShellClient({
  children,
  title,
  description,
  actions,
  logoutAction,
  navigationItems,
  session,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const isPosPage = pathname === "/pos";

  useEffect(() => {
    if (!shouldRefreshRoute(pathname)) {
      return undefined;
    }

    function refreshIfStale() {
      if (document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      const lastRefreshAt = readLastRouteRefreshAt(pathname);

      if (now - lastRefreshAt < CLIENT_REFRESH_MIN_INTERVAL_MS) {
        return;
      }

      writeLastRouteRefreshAt(pathname, now);
      router.refresh();
    }

    refreshIfStale();
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);

    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [pathname, router]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Sidebar
        navigationItems={navigationItems}
        sessionUserId={session?.userId || ""}
        isCollapsed={isSidebarCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        onToggleCollapse={() => setIsSidebarCollapsed((current) => !current)}
        onMobileToggle={() => setIsMobileSidebarOpen((current) => !current)}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />
      <main
        className={`flex-1 transition-[margin] duration-300 ${
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-72"
        }`}
      >
        <div className="min-h-screen bg-slate-50">
          <div className="ring-b sticky top-0 z-40 bg-white/95 px-6 py-4 pl-20 shadow-sm shadow-slate-900/5 ring-slate-200 backdrop-blur-sm sm:pl-24 lg:pl-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div>
                  <p
                    className={`tracking-[0.28em] text-slate-500 uppercase ${
                      isPosPage ? "text-[10px] sm:text-xs" : "text-xs"
                    }`}
                  >
                    Jah Multi Industries
                  </p>
                  <h1
                    className={`font-semibold text-slate-900 ${
                      isPosPage ? "text-xl sm:text-2xl" : "text-2xl"
                    }`}
                  >
                    {title}
                  </h1>
                  <p
                    className={`mt-1 text-slate-600 ${
                      isPosPage ? "text-xs sm:text-sm" : "text-sm"
                    }`}
                  >
                    {description}
                  </p>
                </div>
              </div>
              <div
                className={`flex items-center justify-end ${
                  isPosPage ? "flex-nowrap gap-2 sm:gap-2.5" : "gap-3"
                }`}
              >
                {actions}
                <button
                  type="button"
                  className={`inline-flex cursor-pointer items-center justify-center border border-slate-200 bg-slate-100 text-slate-700 transition hover:bg-slate-200 ${
                    isPosPage
                      ? "h-10 w-10 rounded-2xl text-lg sm:h-10 sm:w-10 lg:h-11 lg:w-11 lg:rounded-3xl"
                      : "h-11 w-11 rounded-3xl"
                  }`}
                  aria-label="Notifications"
                >
                  <AppIcon name="bell" className="h-5 w-5" />
                </button>
                <form
                  action={logoutAction}
                  className={isPosPage ? "shrink-0" : ""}
                >
                  <button
                    type="submit"
                    className={`inline-flex cursor-pointer items-center border border-slate-200 bg-slate-100 text-left transition hover:bg-slate-200 ${
                      isPosPage
                        ? "max-w-[156px] gap-2 rounded-2xl px-3 py-2 sm:max-w-[170px] lg:max-w-none lg:min-w-[160px] lg:gap-3 lg:rounded-3xl lg:px-4 lg:py-1"
                        : "min-w-[160px] gap-3 rounded-3xl px-4 py-1"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center bg-sky-100 text-sky-700 ${
                        isPosPage
                          ? "h-8 w-8 rounded-xl text-sm sm:h-9 sm:w-9 lg:h-10 lg:w-10 lg:rounded-2xl"
                          : "h-10 w-10 rounded-2xl"
                      }`}
                    >
                      {session?.initials || "JM"}
                    </span>
                    <span className={isPosPage ? "min-w-0" : ""}>
                      <span
                        className={`block font-semibold text-slate-900 ${
                          isPosPage ? "truncate text-xs sm:text-sm" : "text-sm"
                        }`}
                      >
                        {session?.fullName || "Jah Manager"}
                      </span>
                      <span
                        className={`text-xs text-slate-500 ${
                          isPosPage ? "hidden lg:block" : "block"
                        }`}
                      >
                        {session?.roleName
                          ? `${session.roleName} · Sign out`
                          : "Sign out"}
                      </span>
                    </span>
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="p-4 lg:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
