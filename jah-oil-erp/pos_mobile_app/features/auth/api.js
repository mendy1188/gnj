import { WEB_APP_URL } from "../../config/api";

class ApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(path, { method = "GET", token = "", body } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${WEB_APP_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(payload?.message || "Request failed.", response.status);
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (`${error?.name || ""}` === "AbortError") {
      throw new ApiError("Request timed out.", 408);
    }

    throw new ApiError(
      error instanceof Error ? error.message : "Network request failed.",
      0,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function loginWithPassword({ email, password }) {
  return request("/api/mobile/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function fetchCurrentSession(token) {
  return request("/api/mobile/auth/session", {
    token,
  });
}

export async function changePassword({ token, password, confirmPassword }) {
  return request("/api/mobile/auth/change-password", {
    method: "POST",
    token,
    body: { password, confirmPassword },
  });
}

export async function fetchPosBootstrap(token) {
  return request("/api/mobile/pos/bootstrap", {
    token,
  });
}

export async function fetchCashierDayTransactions({
  token,
  date,
  stationId,
  cursor,
  pageSize,
}) {
  const searchParams = new URLSearchParams();

  if (date) {
    searchParams.set("date", date);
  }

  if (stationId) {
    searchParams.set("stationId", stationId);
  }

  if (cursor) {
    searchParams.set("cursor", cursor);
  }

  if (pageSize) {
    searchParams.set("pageSize", String(pageSize));
  }

  const queryString = searchParams.toString();

  return request(
    `/api/mobile/pos/day-transactions${queryString ? `?${queryString}` : ""}`,
    {
      token,
    },
  );
}

export async function lookupFuelGiftCode({ token, code }) {
  return request("/api/mobile/pos/fuel-gifts/lookup", {
    method: "POST",
    token,
    body: { code },
  });
}

export async function syncMobilePosSale({ token, payload }) {
  return request("/api/mobile/pos/sync", {
    method: "POST",
    token,
    body: payload,
  });
}

export { ApiError };
