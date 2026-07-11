import "server-only";

import { getCurrentSession } from "@/features/auth/server";
import { parseSessionToken } from "@/features/auth/session";

export async function getRequestSession(request) {
  const authorization = request?.headers?.get("authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (bearerToken) {
    return parseSessionToken(bearerToken);
  }

  return getCurrentSession();
}
