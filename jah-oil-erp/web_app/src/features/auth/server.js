import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_COOKIE,
  ONE_DAY,
  createSessionToken,
  parseSessionToken,
} from "@/features/auth/session";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;

  if (!token) {
    return null;
  }

  return parseSessionToken(token);
}

export async function requireCurrentSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireModuleAccess(moduleKey) {
  const session = await requireCurrentSession();

  if (session.mustChangePassword) {
    redirect("/change-password");
  }

  if (moduleKey && !session.modules?.includes(moduleKey)) {
    redirect("/dashboard");
  }

  return session;
}

export async function setSessionCookie(session) {
  const cookieStore = await cookies();
  const token = await createSessionToken(session);

  cookieStore.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_DAY,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
}
