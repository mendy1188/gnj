import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ENV_FILES = [".env.local", ".env"];
const DEFAULT_REQUEST_RETRY_ATTEMPTS = 4;
const DEFAULT_REQUEST_RETRY_DELAY_MS = 750;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

export function loadEnvFiles() {
  for (const envFile of ENV_FILES) {
    const envPath = path.join(process.cwd(), envFile);

    if (!fs.existsSync(envPath)) {
      continue;
    }

    const contents = fs.readFileSync(envPath, "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

export function parseArgs(argv, options = {}) {
  const booleanFlags = new Set(options.booleanFlags || []);
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const normalized = token.slice(2);

    if (booleanFlags.has(normalized)) {
      parsed[normalized] = true;
      continue;
    }

    const nextToken = argv[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      throw new Error(`Missing value for argument ${token}`);
    }

    parsed[normalized] = nextToken;
    index += 1;
  }

  return parsed;
}

export function createAdminConfig(cliArgs = {}) {
  const endpoint =
    cliArgs.endpoint ||
    process.env.APPWRITE_ENDPOINT ||
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const projectId =
    cliArgs.projectId ||
    process.env.APPWRITE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = cliArgs.apiKey || process.env.APPWRITE_API_KEY;
  const databaseId = cliArgs.databaseId || process.env.APPWRITE_DATABASE_ID;
  const requestRetryAttempts = getPositiveInteger(
    cliArgs.requestRetries || process.env.APPWRITE_ADMIN_REQUEST_RETRIES,
    DEFAULT_REQUEST_RETRY_ATTEMPTS,
  );
  const requestRetryDelayMs = getPositiveInteger(
    cliArgs.requestRetryDelayMs ||
      process.env.APPWRITE_ADMIN_REQUEST_RETRY_DELAY_MS,
    DEFAULT_REQUEST_RETRY_DELAY_MS,
  );
  const requestTimeoutMs = getPositiveInteger(
    cliArgs.requestTimeoutMs || process.env.APPWRITE_ADMIN_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );

  return {
    endpoint,
    projectId,
    apiKey,
    databaseId,
    dryRun: Boolean(cliArgs["dry-run"]),
    apiBaseUrl: buildApiBaseUrl(endpoint),
    requestRetryAttempts,
    requestRetryDelayMs,
    requestTimeoutMs,
  };
}

export function validateAdminConfig(config, options = {}) {
  const includeDatabaseId = options.includeDatabaseId ?? true;
  const missing = [];

  if (!config.endpoint) {
    missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  }
  if (!config.projectId) {
    missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  }
  if (!config.apiKey) {
    missing.push("APPWRITE_API_KEY");
  }
  if (includeDatabaseId && !config.databaseId) {
    missing.push("APPWRITE_DATABASE_ID");
  }

  if (missing.length === 0) {
    return;
  }

  throw new Error(`Missing required configuration: ${missing.join(", ")}`);
}

export async function request(config, resourcePath, options = {}) {
  const attempts = Math.max(
    1,
    Number(options.retryAttempts || config.requestRetryAttempts || 1),
  );
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, config.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);

      const response = await fetch(`${config.apiBaseUrl}${resourcePath}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Appwrite-Project": config.projectId,
          "X-Appwrite-Key": config.apiKey,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const rawText = await response.text();
      const payload = rawText ? safeJsonParse(rawText) : {};

      if (!response.ok) {
        const error = new Error(payload?.message || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.details = payload;

        if (attempt < attempts && isRetryableError(error)) {
          await waitForRetry(config, attempt);
          continue;
        }

        throw error;
      }

      return payload;
    } catch (error) {
      lastError = normalizeRequestError(error);

      if (attempt < attempts && isRetryableError(lastError)) {
        console.warn(
          `Appwrite request failed on attempt ${attempt}/${attempts}: ${lastError.message}. Retrying...`,
        );
        await waitForRetry(config, attempt);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Appwrite request failed.");
}

export async function createDocument(config, collectionId, documentId, data, permissions = []) {
  return request(config, `/databases/${config.databaseId}/collections/${collectionId}/documents`, {
    method: "POST",
    body: {
      documentId,
      data,
      permissions,
    },
  });
}

export function buildApiBaseUrl(endpoint) {
  const normalizedEndpoint = `${endpoint || ""}`.trim().replace(/\/+$/, "");

  if (!normalizedEndpoint) {
    return "";
  }

  return normalizedEndpoint.endsWith("/v1")
    ? normalizedEndpoint
    : `${normalizedEndpoint}/v1`;
}

export function isAlreadyExistsError(error) {
  if (error.status !== 409) {
    return false;
  }

  const message = `${error.message || ""}`.toLowerCase();
  return message.includes("already") || message.includes("exists") || message.includes("duplicate");
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { message: value };
  }
}

function getPositiveInteger(value, fallbackValue) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : fallbackValue;
}

function normalizeRequestError(error) {
  if (error?.name === "AbortError") {
    const timeoutError = new Error("Appwrite request timed out.");
    timeoutError.cause = error;
    return timeoutError;
  }

  return error;
}

function isRetryableError(error) {
  const status = Number(error?.status || 0);

  if (status === 408 || status === 425 || status === 429) {
    return true;
  }

  if (status >= 500 && status <= 599) {
    return true;
  }

  const message = `${error?.message || ""}`.toLowerCase();
  const causeCode = `${error?.cause?.code || ""}`.toLowerCase();

  return (
    message.includes("fetch failed") ||
    message.includes("timed out") ||
    message.includes("network") ||
    message.includes("terminated") ||
    causeCode.includes("timeout") ||
    causeCode.includes("econnreset") ||
    causeCode.includes("enotfound")
  );
}

function waitForRetry(config, attempt) {
  const baseDelay = Number(config.requestRetryDelayMs || DEFAULT_REQUEST_RETRY_DELAY_MS);
  const delay = Math.min(baseDelay * 2 ** Math.max(0, attempt - 1), 8000);

  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}
