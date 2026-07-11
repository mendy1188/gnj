function getErrorStatus(error) {
  return typeof error?.status === "number" ? error.status : null;
}

function getRawErrorMessage(error) {
  return `${error?.message || ""}`.trim();
}

function isTimeoutError(status, rawMessage) {
  return status === 408 || /timed?\s*out|timeout/i.test(rawMessage);
}

function isNetworkError(status, rawMessage) {
  return (
    status === 0 ||
    /network request failed|network error|fetch failed|failed to fetch/i.test(rawMessage)
  );
}

function getSafeServerMessage(rawMessage) {
  if (!rawMessage) {
    return "";
  }

  if (
    /network request failed|fetch failed|timed?\s*out|timeout|request failed|typeerror|aborterror/i.test(
      rawMessage,
    )
  ) {
    return "";
  }

  return rawMessage;
}

const DEFAULT_MESSAGES = {
  generic: "Something went wrong. Try again.",
  login: "Unable to sign in right now. Try again in a moment.",
  change_password: "Unable to update your password right now. Try again.",
  bootstrap:
    "Unable to load POS data right now. Check your connection and try again.",
  transactions:
    "Unable to load today’s transactions right now. Check your connection and try again.",
  sync:
    "Sync could not finish right now. Queued sales will retry automatically.",
  complete_sale: "Could not save the sale on this device. Try again.",
};

export function getUserFacingErrorMessage(error, { context = "generic" } = {}) {
  const status = getErrorStatus(error);
  const rawMessage = getRawErrorMessage(error);
  const safeServerMessage = getSafeServerMessage(rawMessage);

  if (status === 401) {
    if (context === "login") {
      return "Unable to sign in. Check your email and password and try again.";
    }

    return "Your session has expired. Sign in again to continue.";
  }

  if (status === 403) {
    return safeServerMessage || "You do not have access to this action.";
  }

  if (status === 400 && safeServerMessage) {
    return safeServerMessage;
  }

  if (isTimeoutError(status, rawMessage)) {
    if (context === "transactions") {
      return "Today’s transactions are taking longer than usual to load. Check your connection and try again.";
    }

    if (context === "bootstrap") {
      return "POS data is taking longer than usual to load. If your connection is slow, wait a moment or pull to refresh.";
    }

    if (context === "login") {
      return "Sign-in is taking longer than usual. Check your connection and try again.";
    }

    if (context === "change_password") {
      return "Password update is taking longer than usual. Check your connection and try again.";
    }

    if (context === "sync") {
      return "Sync is taking longer than usual. Queued sales will retry automatically.";
    }

    return "The request is taking longer than usual. Check your connection and try again.";
  }

  if (isNetworkError(status, rawMessage)) {
    if (context === "transactions") {
      return "Unable to reach the server for today’s transactions. Check your connection and try again.";
    }

    if (context === "bootstrap") {
      return "Unable to reach the server for POS data. Check your connection and try again.";
    }

    if (context === "sync") {
      return "Unable to sync right now. Queued sales will retry automatically when the connection improves.";
    }

    if (context === "login") {
      return "Unable to reach the server for sign-in. Check your connection and try again.";
    }

    if (context === "change_password") {
      return "Unable to reach the server to update your password. Check your connection and try again.";
    }

    return "Unable to reach the server right now. Check your connection and try again.";
  }

  if (typeof status === "number" && status >= 500) {
    if (context === "transactions") {
      return "Today’s transactions are temporarily unavailable. Try again in a moment.";
    }

    if (context === "bootstrap") {
      return "POS data is temporarily unavailable. Try again in a moment.";
    }

    if (context === "sync") {
      return "Sync is temporarily unavailable. Queued sales will retry automatically.";
    }

    return "The service is temporarily unavailable. Try again in a moment.";
  }

  return safeServerMessage || DEFAULT_MESSAGES[context] || DEFAULT_MESSAGES.generic;
}
