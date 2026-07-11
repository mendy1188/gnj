import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ENV_FILES = [".env.local", ".env"];

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

  return {
    endpoint,
    projectId,
    apiKey,
    databaseId,
    dryRun: Boolean(cliArgs["dry-run"]),
    apiBaseUrl: buildApiBaseUrl(endpoint),
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
  const response = await fetch(`${config.apiBaseUrl}${resourcePath}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-Key": config.apiKey,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawText = await response.text();
  const payload = rawText ? safeJsonParse(rawText) : {};

  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
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
