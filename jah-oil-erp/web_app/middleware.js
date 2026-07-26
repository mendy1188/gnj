import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  getModuleForPath,
  parseSessionToken,
} from "./src/features/auth/session";

const protectedRoutes = [
  "/dashboard",
  "/stations",
  "/inventory",
  "/product-settings",
  "/incoming-stock",
  "/cement",
  "/fuel-deliveries",
  "/fuel-sales",
  "/commodities-sales",
  "/pos",
  "/credit-sale",
  "/balance-management",
  "/reports",
  "/admin",
  "/change-password",
];

export async function middleware(request) {
  const sessionToken = request.cookies.get(AUTH_COOKIE)?.value;
  const session = await parseSessionToken(sessionToken);
  const isAuthenticated = Boolean(session);
  const { pathname } = request.nextUrl;

  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (pathname === "/login" && isAuthenticated) {
    const redirectPath = session.mustChangePassword
      ? "/change-password"
      : "/dashboard";
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  if (pathname === "/change-password") {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (!session.mustChangePassword) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
  }

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (session.mustChangePassword) {
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  const requiredModule = getModuleForPath(pathname);

  if (requiredModule && !session.modules?.includes(requiredModule)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/stations/:path*",
    "/inventory/:path*",
    "/product-settings/:path*",
    "/incoming-stock/:path*",
    "/cement/:path*",
    "/fuel-deliveries/:path*",
    "/fuel-sales/:path*",
    "/commodities-sales/:path*",
    "/pos/:path*",
    "/credit-sale/:path*",
    "/balance-management/:path*",
    "/reports/:path*",
    "/admin/:path*",
    "/change-password",
    "/login",
  ],
};
