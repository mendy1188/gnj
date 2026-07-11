const ROUTE_REWRITES = new Map([
  ["/home", "/home"],
  ["/(tabs)", "/home"],
  ["/(tabs)/", "/home"],
  ["/(tabs)/index", "/home"],
  ["/(tabs)/home", "/home"],
  ["/buy-fuel", "/home"],
  ["/bulk-balance", "/home"],
  ["/settings", "/home"],
]);

export function redirectSystemPath({ path, initial }) {
  try {
    const normalizedPath = normalizeIncomingPath(path, initial);

    return ROUTE_REWRITES.get(normalizedPath) || normalizedPath || "/login";
  } catch {
    return "/login";
  }
}

function normalizeIncomingPath(path, initial) {
  const rawPath = `${path || ""}`.trim();

  if (!rawPath) {
    return "/login";
  }

  if (rawPath.startsWith("/")) {
    return stripTrailingSlash(rawPath);
  }

  if (!initial) {
    return stripTrailingSlash(rawPath.startsWith("/") ? rawPath : `/${rawPath}`);
  }

  const parsedUrl = new URL(rawPath, "jahmobile://app");
  const pathname = parsedUrl.pathname || "/";

  return stripTrailingSlash(pathname.startsWith("/") ? pathname : `/${pathname}`);
}

function stripTrailingSlash(value) {
  if (!value || value === "/") {
    return "/";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}
