import { WEB_APP_URL } from "../../config/api";

class ApiError extends Error {
  constructor(message, status = 500, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
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
      throw new ApiError(payload?.message || "Request failed.", response.status, payload);
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (`${error?.name || ""}` === "AbortError") {
      throw new ApiError(
        "The request took too long to complete. Check your connection and try again.",
        408,
      );
    }

    throw new ApiError(
      "We could not reach the server. Check your connection and try again.",
      0,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function loginClient({ email, password }) {
  return request("/api/mobile/client/auth/login", {
    method: "POST",
    body: {
      email,
      password,
    },
  });
}

export async function signupClient(payload) {
  return request("/api/mobile/client/auth/signup", {
    method: "POST",
    body: payload,
  });
}

export async function getClientSession({ token = "" }) {
  return request("/api/mobile/client/auth/session", {
    token,
  });
}

export async function loadClientBootstrap({ token = "" }) {
  return request("/api/mobile/client/home/bootstrap", {
    token,
  });
}

export async function updateClientProfile({ token = "", payload }) {
  return request("/api/mobile/client/profile", {
    method: "PUT",
    token,
    body: payload,
  });
}

export async function verifyClientCashierQrCode({
  token = "",
  qrCode,
  requestedFlow,
}) {
  return request("/api/mobile/client/cashiers/verify", {
    method: "POST",
    token,
    body: {
      qrCode,
      requestedFlow,
    },
  });
}

export async function confirmClientPayment({
  token = "",
  payload,
}) {
  return request("/api/mobile/client/payments/confirm", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function createBulkFuelPurchase({
  token = "",
  payload,
}) {
  return request("/api/mobile/client/bulk-purchases", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function createFuelGiftCode({
  token = "",
  payload,
}) {
  return request("/api/mobile/client/gifts", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function cancelFuelGiftCode({
  token = "",
  giftId,
}) {
  return request("/api/mobile/client/gifts", {
    method: "DELETE",
    token,
    body: {
      giftId,
    },
  });
}

export { ApiError };
