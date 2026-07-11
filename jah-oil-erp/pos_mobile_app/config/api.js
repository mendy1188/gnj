import Constants from "expo-constants";

function normalizeBaseUrl(value) {
  const normalizedValue = `${value || ""}`.trim().replace(/\/+$/, "");

  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.startsWith("http://") || normalizedValue.startsWith("https://")) {
    return normalizedValue;
  }

  if (normalizedValue.startsWith("exp://")) {
    try {
      const parsed = new URL(normalizedValue);
      return `http://${parsed.hostname}:3000`;
    } catch {
      return "";
    }
  }

  return `http://${normalizedValue}`;
}

function deriveWebAppUrl() {
  const explicitValue = normalizeBaseUrl(process.env.EXPO_PUBLIC_WEB_APP_URL);

  if (explicitValue) {
    return explicitValue;
  }

  const hostCandidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.linkingUri,
  ].filter(Boolean);

  for (const candidate of hostCandidates) {
    const normalized = `${candidate}`.trim();

    if (!normalized) {
      continue;
    }

    try {
      if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
        const parsed = new URL(normalized);
        return `${parsed.protocol}//${parsed.hostname}:3000`;
      }

      if (normalized.startsWith("exp://")) {
        const parsed = new URL(normalized);
        return `http://${parsed.hostname}:3000`;
      }

      const [host] = normalized.split(":");

      if (host) {
        return `http://${host}:3000`;
      }
    } catch {
      continue;
    }
  }

  return "http://localhost:3000";
}

export const WEB_APP_URL = deriveWebAppUrl();
