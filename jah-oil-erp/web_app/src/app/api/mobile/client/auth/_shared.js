import { getRequestSession } from "@/features/auth/request-session";
import { isClientSession } from "@/features/client-users/session";

export function sanitizeClientSession(session) {
  if (!session) {
    return null;
  }

  return {
    kind: "client",
    userId: session.userId,
    fullName: session.fullName,
    email: session.email,
    phone: session.phone,
    userType: session.userType,
    companyName: session.companyName || "",
    preferredProvider: session.preferredProvider || "wave",
    mustChangePassword: Boolean(session.mustChangePassword),
    status: session.status || "active",
  };
}

export async function getClientRequestSession(request) {
  const session = await getRequestSession(request);
  return isClientSession(session) ? session : null;
}
