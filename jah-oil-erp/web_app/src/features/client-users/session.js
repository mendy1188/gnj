import "server-only";

export function buildClientSession(user) {
  return {
    kind: "client",
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    userType: user.userType,
    companyName: user.companyName,
    preferredProvider: user.preferredProvider,
    mustChangePassword: Boolean(user.mustChangePassword),
    status: user.status || "active",
    modules: ["client-mobile"],
  };
}

export function isClientSession(session) {
  return `${session?.kind || ""}`.trim().toLowerCase() === "client";
}
