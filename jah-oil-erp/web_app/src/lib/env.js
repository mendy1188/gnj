const requiredPublicEnv = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
};

const requiredServerEnv = {
  endpoint:
    process.env.APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  projectId:
    process.env.APPWRITE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
  apiKey: process.env.APPWRITE_API_KEY,
  databaseId: process.env.APPWRITE_DATABASE_ID,
};

export function getPublicAppwriteConfig() {
  return {
    endpoint: requiredPublicEnv.endpoint || "",
    projectId: requiredPublicEnv.projectId || "",
  };
}

export function hasAppwriteConfig() {
  return Boolean(requiredPublicEnv.endpoint && requiredPublicEnv.projectId);
}

export function getServerAppwriteConfig() {
  const endpoint = `${requiredServerEnv.endpoint || ""}`.trim().replace(/\/+$/, "");

  return {
    endpoint,
    apiBaseUrl: endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`,
    projectId: requiredServerEnv.projectId || "",
    apiKey: requiredServerEnv.apiKey || "",
    databaseId: requiredServerEnv.databaseId || "",
  };
}

export function hasServerAppwriteConfig() {
  return Boolean(
    requiredServerEnv.endpoint &&
      requiredServerEnv.projectId &&
      requiredServerEnv.apiKey &&
      requiredServerEnv.databaseId,
  );
}
