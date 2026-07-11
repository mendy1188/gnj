"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppIcon } from "@/components/ui/AppIcon";
import { dashboardNavigation } from "@/features/dashboard/constants";

const SIDEBAR_GROUPS_STORAGE_KEY = "jah-erp-sidebar-open-groups";
const SIDEBAR_SCROLL_STORAGE_KEY = "jah-erp-sidebar-scroll-top";
const SIDEBAR_NAVIGATION_STORAGE_KEY = "jah-erp-sidebar-navigation";

function isActiveRoute(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname, item) {
  return Array.isArray(item.children)
    ? item.children.some((child) => isActiveRoute(pathname, child.href))
    : false;
}

function buildOpenGroups(items, pathname) {
  return items.reduce((groups, item) => {
    if (Array.isArray(item.children) && item.children.length > 0) {
      groups[item.key] = isGroupActive(pathname, item);
    }

    return groups;
  }, {});
}

function readStoredOpenGroups() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedValue = window.sessionStorage.getItem(
      SIDEBAR_GROUPS_STORAGE_KEY,
    );

    if (!storedValue) {
      return {};
    }

    const parsedValue = JSON.parse(storedValue);
    return parsedValue && typeof parsedValue === "object" ? parsedValue : {};
  } catch {
    return {};
  }
}

function writeStoredOpenGroups(openGroups) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      SIDEBAR_GROUPS_STORAGE_KEY,
      JSON.stringify(openGroups),
    );
  } catch {}
}

function readStoredSidebarScrollTop() {
  if (typeof window === "undefined") {
    return 0;
  }

  try {
    const storedValue = window.sessionStorage.getItem(
      SIDEBAR_SCROLL_STORAGE_KEY,
    );
    const parsedValue = Number.parseInt(`${storedValue || "0"}`, 10);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
  } catch {
    return 0;
  }
}

function writeStoredSidebarScrollTop(scrollTop) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      SIDEBAR_SCROLL_STORAGE_KEY,
      `${Math.max(0, Math.round(scrollTop || 0))}`,
    );
  } catch {}
}

function readStoredNavigationItems(sessionUserId) {
  if (typeof window === "undefined" || !sessionUserId) {
    return [];
  }

  try {
    const storedValue = window.sessionStorage.getItem(
      SIDEBAR_NAVIGATION_STORAGE_KEY,
    );

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue);

    if (
      !parsedValue ||
      typeof parsedValue !== "object" ||
      parsedValue.userId !== sessionUserId ||
      !Array.isArray(parsedValue.items)
    ) {
      return [];
    }

    return parsedValue.items;
  } catch {
    return [];
  }
}

function writeStoredNavigationItems(sessionUserId, items) {
  if (typeof window === "undefined" || !sessionUserId || !Array.isArray(items)) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      SIDEBAR_NAVIGATION_STORAGE_KEY,
      JSON.stringify({
        userId: sessionUserId,
        items,
      }),
    );
  } catch {}
}

function mergeNavigationItems(primaryItems = [], fallbackItems = []) {
  const sourceItems =
    Array.isArray(primaryItems) && primaryItems.length > 0
      ? primaryItems
      : Array.isArray(fallbackItems) && fallbackItems.length > 0
        ? fallbackItems
        : dashboardNavigation;

  const sourceItemsByKey = new Map(
    sourceItems.map((item) => [item.key, item]),
  );
  const fallbackItemsByKey = new Map(
    (Array.isArray(fallbackItems) ? fallbackItems : []).map((item) => [
      item.key,
      item,
    ]),
  );

  return dashboardNavigation.reduce((mergedItems, canonicalItem) => {
    const sourceItem =
      sourceItemsByKey.get(canonicalItem.key) ||
      fallbackItemsByKey.get(canonicalItem.key);

    if (!sourceItem) {
      return mergedItems;
    }

    if (
      !Array.isArray(canonicalItem.children) ||
      canonicalItem.children.length === 0
    ) {
      mergedItems.push({
        ...sourceItem,
        ...canonicalItem,
      });
      return mergedItems;
    }

    const sourceChildren = Array.isArray(sourceItem.children)
      ? sourceItem.children
      : [];
    const fallbackChildren = Array.isArray(fallbackItemsByKey.get(canonicalItem.key)?.children)
      ? fallbackItemsByKey.get(canonicalItem.key).children
      : [];
    const availableChildrenByKey = new Map(
      [...sourceChildren, ...fallbackChildren].map((child) => [child.key, child]),
    );
    const mergedChildren = canonicalItem.children
      .map((canonicalChild) => {
        const availableChild = availableChildrenByKey.get(canonicalChild.key);
        return availableChild
          ? {
              ...availableChild,
              ...canonicalChild,
            }
          : null;
      })
      .filter(Boolean);

    if (mergedChildren.length === 0) {
      return mergedItems;
    }

    mergedItems.push({
      ...sourceItem,
      ...canonicalItem,
      children: mergedChildren,
    });
    return mergedItems;
  }, []);
}

function mergeOpenGroups(items, pathname, currentOpenGroups = {}) {
  const storedOpenGroups = readStoredOpenGroups();

  return items.reduce((groups, item) => {
    if (!Array.isArray(item.children) || item.children.length === 0) {
      return groups;
    }

    const groupActive = isGroupActive(pathname, item);
    const currentValue = currentOpenGroups[item.key];
    const storedValue = storedOpenGroups[item.key];

    groups[item.key] = groupActive
      ? true
      : typeof currentValue === "boolean"
        ? currentValue
        : typeof storedValue === "boolean"
          ? storedValue
          : false;

    return groups;
  }, {});
}

function getMenuIconClassName(active = false) {
  return active ? "text-sky-300" : "text-sky-400/90";
}

function getSubmenuIconClassName(active = false) {
  return active ? "text-sky-300" : "text-sky-400/80";
}

function getGroupIconClassName(active = false) {
  return active ? "text-sky-300" : "text-sky-400/85";
}

export default function Sidebar({
  navigationItems,
  sessionUserId,
  isCollapsed,
  isMobileOpen,
  onToggleCollapse,
  onMobileToggle,
  onMobileClose,
}) {
  const pathname = usePathname();
  const [resolvedNavigationItems, setResolvedNavigationItems] = useState(() =>
    Array.isArray(navigationItems) && navigationItems.length > 0
      ? navigationItems
      : dashboardNavigation,
  );
  const items =
    resolvedNavigationItems?.length > 0
      ? resolvedNavigationItems
      : dashboardNavigation;
  const navRef = useRef(null);
  const [openGroups, setOpenGroups] = useState(() =>
    buildOpenGroups(items, pathname),
  );

  useEffect(() => {
    const storedNavigationItems = readStoredNavigationItems(sessionUserId);
    const nextNavigationItems = mergeNavigationItems(
      Array.isArray(navigationItems) && navigationItems.length > 0
        ? navigationItems
        : storedNavigationItems,
      storedNavigationItems,
    );

    setResolvedNavigationItems((current) => {
      const currentValue = JSON.stringify(current);
      const nextValue = JSON.stringify(nextNavigationItems);
      return currentValue === nextValue ? current : nextNavigationItems;
    });

    if (Array.isArray(navigationItems) && navigationItems.length > 0) {
      writeStoredNavigationItems(sessionUserId, nextNavigationItems);
    }
  }, [navigationItems, sessionUserId]);

  useEffect(() => {
    setOpenGroups((current) => {
      const next = mergeOpenGroups(items, pathname, current);
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);

      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => current[key] === next[key])
      ) {
        return current;
      }

      writeStoredOpenGroups(next);
      return next;
    });
  }, [items, pathname]);

  useLayoutEffect(() => {
    const navElement = navRef.current;

    if (!navElement) {
      return;
    }

    navElement.scrollTop = readStoredSidebarScrollTop();
  }, [pathname]);

  useEffect(() => {
    const navElement = navRef.current;

    if (!navElement) {
      return undefined;
    }

    function handleScroll() {
      writeStoredSidebarScrollTop(navElement.scrollTop);
    }

    navElement.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      navElement.removeEventListener("scroll", handleScroll);
    };
  }, [pathname]);

  function toggleGroup(groupKey) {
    setOpenGroups((current) => {
      const next = {
        ...current,
        [groupKey]: !current[groupKey],
      };
      writeStoredOpenGroups(next);
      return next;
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onMobileToggle}
        className="fixed top-4 left-4 z-50 inline-flex h-12 w-12 flex-col items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/90 text-slate-900 shadow-lg shadow-slate-900/10 lg:hidden"
        aria-expanded={isMobileOpen}
        aria-controls="dashboard-sidebar"
        aria-label="Toggle navigation menu"
      >
        <span className="h-0.5 w-5 rounded-full bg-current" />
        <span className="h-0.5 w-5 rounded-full bg-current" />
        <span className="h-0.5 w-5 rounded-full bg-current" />
      </button>

      <aside
        id="dashboard-sidebar"
        className={`fixed top-0 left-0 z-40 h-screen w-72 transform bg-slate-900/95 text-slate-100 shadow-2xl shadow-slate-950/20 transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "lg:w-20" : "lg:w-72"}`}
      >
        <div className="flex h-full flex-col">
          <div
            className={`border-b border-slate-700 ${
              isCollapsed ? "p-3" : "p-4"
            }`}
          >
            <div
              className={`inline-flex items-center rounded-2xl bg-slate-800/95 shadow-sm ring-1 ring-sky-800/20 ${
                isCollapsed
                  ? "w-full justify-center px-2 py-3"
                  : "w-full gap-3 px-4 py-3"
              }`}
            >
              {isCollapsed ? (
                <span className="text-lg font-semibold text-sky-200">JMI</span>
              ) : (
                <div className="w-full text-center">
                  <h2 className="text-lg font-semibold uppercase">
                    Jah Multi Industries
                  </h2>
                  <p className="text-xs tracking-[0.2em] text-slate-400">
                    ERP Management System
                  </p>
                </div>
              )}
            </div>
          </div>

          <nav ref={navRef} className="flex-1 overflow-y-auto px-3 py-4">
            {items.map((item) => {
              if (Array.isArray(item.children) && item.children.length > 0) {
                if (isCollapsed) {
                  return item.children.map((child) => {
                    const active = isActiveRoute(pathname, child.href);

                    return (
                      <Link
                        key={child.key}
                        href={child.href}
                        onClick={onMobileClose}
                        aria-current={active ? "page" : undefined}
                        title={child.label}
                        className={`mb-1.5 flex items-center justify-center rounded-2xl px-3 py-2.5 transition-all duration-200 ${
                          active
                            ? "bg-sky-500/20 text-sky-100 shadow-lg ring-1 ring-sky-300/20"
                            : "text-slate-100 hover:bg-sky-700/20 hover:text-sky-100 hover:shadow-lg"
                        }`}
                        >
                        <AppIcon
                          name={child.icon}
                          className={`h-5 w-5 ${getSubmenuIconClassName(active)}`}
                        />
                      </Link>
                    );
                  });
                }

                const groupActive = isGroupActive(pathname, item);
                const isGroupOpen = openGroups[item.key] ?? groupActive;

                return (
                  <div key={item.key} className="mb-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.key)}
                      aria-expanded={isGroupOpen}
                      className={`flex cursor-pointer items-center rounded-2xl px-4 py-2.5 transition-all duration-200 ${
                        groupActive
                          ? "bg-sky-500/15 text-sky-100 ring-1 ring-sky-300/15"
                          : "text-slate-300 hover:bg-sky-700/10 hover:text-sky-100"
                      }`}
                    >
                      <AppIcon
                        name={item.icon}
                        className={`mr-3 h-5 w-5 ${getGroupIconClassName(groupActive)}`}
                      />
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="ml-2 text-xs">
                        {isGroupOpen ? "▾" : "▸"}
                      </span>
                    </button>
                    {isGroupOpen ? (
                      <div className="mt-1 space-y-1 pl-4">
                        {item.children.map((child) => {
                          const active = isActiveRoute(pathname, child.href);

                          return (
                            <Link
                              key={child.key}
                              href={child.href}
                              onClick={onMobileClose}
                              aria-current={active ? "page" : undefined}
                              className={`flex items-center rounded-2xl px-4 py-2 transition-all duration-200 ${
                                active
                                  ? "bg-sky-500/20 text-sky-100 shadow-lg ring-1 ring-sky-300/20"
                                  : "text-slate-100 hover:bg-sky-700/20 hover:text-sky-100 hover:shadow-lg"
                              }`}
                            >
                              <span className="mr-3 text-base">
                                <AppIcon
                                  name={child.icon}
                                  className={`h-4 w-4 ${getSubmenuIconClassName(active)}`}
                                />
                              </span>
                              <span className="text-sm">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              }

              const active = isActiveRoute(pathname, item.href);

              return (
                <Link
                  key={item.key || item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  aria-current={active ? "page" : undefined}
                  title={isCollapsed ? item.label : undefined}
                  className={`mb-1.5 flex items-center rounded-2xl px-4 py-2.5 transition-all duration-200 ${
                    isCollapsed ? "justify-center px-3" : ""
                  } ${
                    active
                      ? "bg-sky-500/20 text-sky-100 shadow-lg ring-1 ring-sky-300/20"
                      : "text-slate-100 hover:bg-sky-700/20 hover:text-sky-100 hover:shadow-lg"
                  }`}
                >
                  <span className={`${isCollapsed ? "" : "mr-3"} text-lg`}>
                    <AppIcon
                      name={item.icon}
                      className={`h-5 w-5 ${getMenuIconClassName(active)}`}
                    />
                  </span>
                  {!isCollapsed ? <span>{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>

          <div
            className={`border-t border-slate-700 ${
              isCollapsed ? "p-3 text-center" : "p-4"
            }`}
          >
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden w-full items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700 lg:inline-flex"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? "→" : "←"}
            </button>
          </div>
        </div>
      </aside>

      {isMobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onMobileClose}
          aria-label="Close navigation menu"
        />
      ) : null}
    </>
  );
}
