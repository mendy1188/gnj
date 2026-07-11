export function getErrorMessage(error) {
  if (typeof error === "string") {
    return error.trim();
  }

  if (error instanceof Error) {
    return `${error.message || ""}`.trim();
  }

  return "";
}

function isMappableErrorMessage(message = "") {
  const normalizedMessage = `${message || ""}`.trim().toLowerCase();

  return (
    normalizedMessage.includes("fetch failed") ||
    normalizedMessage.includes("connect timeout") ||
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("socket hang up") ||
    normalizedMessage.includes("network error") ||
    normalizedMessage.includes("econnrefused") ||
    normalizedMessage.includes("enotfound") ||
    normalizedMessage.includes("enetunreach") ||
    normalizedMessage.includes("und_err_") ||
    normalizedMessage.includes("appwrite server configuration") ||
    normalizedMessage.includes("missing appwrite") ||
    normalizedMessage.includes("invalid document structure") ||
    normalizedMessage.includes("unknown attribute") ||
    normalizedMessage.includes("latest appwrite schema update") ||
    normalizedMessage.includes("storage is not ready yet") ||
    normalizedMessage.includes("cannot find module") ||
    normalizedMessage.includes("enoent") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("forbidden") ||
    normalizedMessage.includes("password change required")
  );
}

export function resolveErrorCopy(
  error,
  { moduleName = "this page", genericLabel = "load this page" } = {},
) {
  const technicalDetails = getErrorMessage(error);
  const normalizedMessage = technicalDetails.toLowerCase();
  const digest = `${error?.digest || ""}`.trim();

  if (
    normalizedMessage.includes("fetch failed") ||
    normalizedMessage.includes("connect timeout") ||
    normalizedMessage.includes("timed out")
  ) {
    return {
      title: `We couldn't load ${moduleName}`,
      message:
        "The app could not reach the data service. This is usually a temporary network or server connectivity issue.",
      guidance:
        "Try again in a moment. If the problem continues, contact your system administrator or support.",
      technicalDetails,
      digest,
    };
  }

  if (
    normalizedMessage.includes("appwrite server configuration") ||
    normalizedMessage.includes("missing appwrite")
  ) {
    return {
      title: `${moduleName} is not configured correctly`,
      message:
        "The server configuration for this part of the system is incomplete or invalid.",
      guidance:
        "Contact your system administrator or support to review the server environment settings.",
      technicalDetails,
      digest,
    };
  }

  if (
    normalizedMessage.includes("invalid document structure") ||
    normalizedMessage.includes("unknown attribute") ||
    normalizedMessage.includes("latest appwrite schema update") ||
    normalizedMessage.includes("storage is not ready yet")
  ) {
    return {
      title: `${moduleName} needs a system update`,
      message:
        "This part of the system is not fully ready for the action you attempted.",
      guidance:
        "Contact your system administrator or support to apply the latest system setup or database updates.",
      technicalDetails,
      digest,
    };
  }

  if (normalizedMessage.includes("unauthorized")) {
    return {
      title: "Your session is no longer valid",
      message:
        "You need to sign in again before the app can continue.",
      guidance:
        "Sign in again. If you still cannot access this area, contact your system administrator.",
      technicalDetails,
      digest,
    };
  }

  if (
    normalizedMessage.includes("forbidden") ||
    normalizedMessage.includes("do not have access")
  ) {
    return {
      title: `You do not have access to ${moduleName}`,
      message:
        "Your account does not currently have permission to open this section.",
      guidance:
        "If you believe this is incorrect, contact your system administrator.",
      technicalDetails,
      digest,
    };
  }

  if (normalizedMessage.includes("password change required")) {
    return {
      title: "Password update required",
      message:
        "You must change your password before you can continue.",
      guidance:
        "Complete the password change step and try again. Contact your system administrator if the issue persists.",
      technicalDetails,
      digest,
    };
  }

  if (normalizedMessage.includes("not found")) {
    return {
      title: `${moduleName} is unavailable`,
      message:
        "The requested data or resource could not be found.",
      guidance:
        "Refresh the page. If it remains unavailable, contact your system administrator or support.",
      technicalDetails,
      digest,
    };
  }

  return {
    title: `We couldn't ${genericLabel}`,
    message:
      "Something went wrong while preparing this screen.",
    guidance:
      "Try again. If the problem continues and the reason is not clear, contact your system administrator or support.",
    technicalDetails,
    digest,
  };
}

export function getUserFacingErrorMessage(
  error,
  {
    moduleName = "this section",
    genericLabel = "complete this action",
    fallbackMessage = "Something went wrong. Try again, and if the problem continues, contact your system administrator or support.",
  } = {},
) {
  const technicalDetails = getErrorMessage(error);

  if (!technicalDetails) {
    return fallbackMessage;
  }

  if (!isMappableErrorMessage(technicalDetails)) {
    return technicalDetails;
  }

  const copy = resolveErrorCopy(error, { moduleName, genericLabel });
  return [copy.message, copy.guidance].filter(Boolean).join(" ").trim();
}

export function resolveRouteMeta(pathname = "") {
  const route = `${pathname || ""}`;

  if (route.startsWith("/admin")) {
    return { moduleName: "Admin", genericLabel: "load Admin" };
  }
  if (route.startsWith("/dashboard")) {
    return { moduleName: "Dashboard", genericLabel: "load the Dashboard" };
  }
  if (route.startsWith("/stations")) {
    return { moduleName: "Stations", genericLabel: "load Stations" };
  }
  if (route.startsWith("/inventory")) {
    return { moduleName: "Inventory", genericLabel: "load Inventory" };
  }
  if (route.startsWith("/incoming-stock")) {
    return { moduleName: "Incoming Stock", genericLabel: "load Incoming Stock" };
  }
  if (route.startsWith("/fuel-deliveries")) {
    return { moduleName: "Fuel Deliveries", genericLabel: "load Fuel Deliveries" };
  }
  if (route.startsWith("/fuel-sales")) {
    return { moduleName: "Fuel Sales", genericLabel: "load Fuel Sales" };
  }
  if (route.startsWith("/commodities-sales")) {
    return {
      moduleName: "Commodity Sales",
      genericLabel: "load Commodity Sales",
    };
  }
  if (route.startsWith("/cement")) {
    return { moduleName: "Cement", genericLabel: "load Cement" };
  }
  if (route.startsWith("/product-settings")) {
    return {
      moduleName: "Product Settings",
      genericLabel: "load Product Settings",
    };
  }
  if (route.startsWith("/rewards-management")) {
    return {
      moduleName: "Rewards Management",
      genericLabel: "load Rewards Management",
    };
  }
  if (route.startsWith("/station-settings")) {
    return {
      moduleName: "Station Settings",
      genericLabel: "load Station Settings",
    };
  }
  if (route.startsWith("/pos")) {
    return { moduleName: "POS", genericLabel: "load POS" };
  }
  if (route.startsWith("/reports")) {
    return { moduleName: "Reports", genericLabel: "load Reports" };
  }

  return {
    moduleName: "this page",
    genericLabel: "load this page",
  };
}
