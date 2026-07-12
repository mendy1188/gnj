import "server-only";

import { Client, Databases, ID, Query } from "appwrite";

import {
  DEFAULT_ROLE_DEFINITIONS,
  DEFAULT_ROLE_MODULES_BY_CODE,
  MODULE_DEFINITIONS,
} from "@/features/auth/session";
import { getServerAppwriteConfig, hasServerAppwriteConfig } from "@/lib/env";

const COLLECTIONS = {
  roles: "app_roles",
  users: "app_users",
};

function createDatabasesClient() {
  if (!hasServerAppwriteConfig()) {
    throw new Error("Missing Appwrite server configuration.");
  }

  const config = getServerAppwriteConfig();
  const client = new Client()
    .setEndpoint(config.apiBaseUrl)
    .setProject(config.projectId);

  client.headers["X-Appwrite-Key"] = config.apiKey;

  return {
    databases: new Databases(client),
    databaseId: config.databaseId,
  };
}

function parseModules(modulesValue) {
  if (!modulesValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(modulesValue);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeRoleDocument(document) {
  const allowedModules = new Set(
    DEFAULT_ROLE_MODULES_BY_CODE[document.code] || MODULE_DEFINITIONS.map((module) => module.key),
  );

  return {
    id: document.$id,
    code: document.code || "",
    name: document.name || "",
    status: document.status || "active",
    branchRequired: Boolean(document.branch_required),
    modules: parseModules(document.modules_json).filter((moduleKey) =>
      MODULE_DEFINITIONS.some((module) => module.key === moduleKey) &&
      allowedModules.has(moduleKey),
    ),
  };
}

function normalizeUserDocument(document) {
  return {
    id: document.$id,
    fullName: document.full_name || "",
    email: document.email || "",
    cashierQrCode: document.cashier_qr_code || document.$id || "",
    roleId: document.role_id || "",
    roleName: document.role_name || "",
    branchId: document.branch_station_id || "",
    branchName: document.branch_station_name || "",
    passwordHash: document.password_hash || "",
    mustChangePassword: Boolean(document.must_change_password),
    status: document.status || "active",
    createdAt: document.created_at || "",
    updatedAt: document.updated_at || "",
  };
}

function roleDocumentId(code) {
  return `role_${String(code || "").replaceAll(/[^a-z0-9_-]/gi, "").slice(0, 28)}`;
}

export async function ensureDefaultRoles() {
  const { databases, databaseId } = createDatabasesClient();
  const existingRolesResponse = await databases.listDocuments(
    databaseId,
    COLLECTIONS.roles,
    [Query.limit(100)],
  );

  const existingRolesByCode = new Map(
    (existingRolesResponse.documents || []).map((document) => [document.code, document]),
  );

  for (const role of DEFAULT_ROLE_DEFINITIONS) {
    const existingRole = existingRolesByCode.get(role.code);

    if (!existingRole) {
      await databases.createDocument(databaseId, COLLECTIONS.roles, roleDocumentId(role.code), {
        code: role.code,
        name: role.name,
        modules_json: JSON.stringify(role.modules),
        branch_required: role.branchRequired,
        status: "active",
      });
      continue;
    }

    const existingModules = parseModules(existingRole.modules_json);
    const nextModules = Array.from(new Set([...existingModules, ...role.modules]));

    if (
      existingRole.name === role.name &&
      Boolean(existingRole.branch_required) === role.branchRequired &&
      JSON.stringify(existingModules) === JSON.stringify(nextModules)
    ) {
      continue;
    }

    await databases.updateDocument(databaseId, COLLECTIONS.roles, existingRole.$id, {
      name: role.name,
      modules_json: JSON.stringify(nextModules),
      branch_required: role.branchRequired,
    });
  }
}

export async function listRoles() {
  await ensureDefaultRoles();

  const { databases, databaseId } = createDatabasesClient();
  const response = await databases.listDocuments(databaseId, COLLECTIONS.roles, [
    Query.limit(100),
    Query.orderAsc("name"),
  ]);

  return (response.documents || []).map(normalizeRoleDocument);
}

export async function getRoleById(roleId) {
  if (!roleId) {
    return null;
  }

  await ensureDefaultRoles();

  const { databases, databaseId } = createDatabasesClient();
  const document = await databases.getDocument(databaseId, COLLECTIONS.roles, roleId);

  return normalizeRoleDocument(document);
}

export async function findUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const { databases, databaseId } = createDatabasesClient();
  const response = await databases.listDocuments(databaseId, COLLECTIONS.users, [
    Query.equal("email", normalizedEmail),
    Query.limit(1),
  ]);

  const document = response.documents?.[0];
  return document ? normalizeUserDocument(document) : null;
}

export async function findUserByCashierQrCode(cashierQrCode) {
  const normalizedCode = String(cashierQrCode || "").trim();

  if (!normalizedCode) {
    return null;
  }

  const { databases, databaseId } = createDatabasesClient();
  const lookupValues = Array.from(
    new Set([
      normalizedCode,
      normalizedCode.toLowerCase(),
      normalizedCode.toUpperCase(),
    ].filter(Boolean)),
  );

  for (const lookupValue of lookupValues) {
    const response = await databases.listDocuments(databaseId, COLLECTIONS.users, [
      Query.equal("cashier_qr_code", lookupValue),
      Query.limit(1),
    ]);
    const document = response.documents?.[0];

    if (document) {
      return normalizeUserDocument(document);
    }
  }

  for (const lookupValue of lookupValues) {
    try {
      const userById = await databases.getDocument(
        databaseId,
        COLLECTIONS.users,
        lookupValue,
      );
      return normalizeUserDocument(userById);
    } catch {}
  }

  return null;
}

export async function getUserById(userId) {
  if (!userId) {
    return null;
  }

  const { databases, databaseId } = createDatabasesClient();
  const document = await databases.getDocument(databaseId, COLLECTIONS.users, userId);

  return normalizeUserDocument(document);
}

export async function listUsers() {
  const { databases, databaseId } = createDatabasesClient();
  const response = await databases.listDocuments(databaseId, COLLECTIONS.users, [
    Query.limit(100),
    Query.orderAsc("full_name"),
  ]);

  return (response.documents || []).map(normalizeUserDocument);
}

export async function createUserRecord({
  fullName,
  email,
  role,
  branchId,
  branchName,
  passwordHash,
  mustChangePassword = true,
}) {
  const { databases, databaseId } = createDatabasesClient();
  const timestamp = new Date().toISOString();
  const documentId = ID.unique();
  const cashierQrCode = documentId;

  const document = await databases.createDocument(
    databaseId,
    COLLECTIONS.users,
    documentId,
    {
      full_name: fullName,
      email: String(email || "").trim().toLowerCase(),
      cashier_qr_code: cashierQrCode,
      role_id: role.id,
      role_name: role.name,
      branch_station_id: branchId || "",
      branch_station_name: branchName || "",
      password_hash: passwordHash,
      must_change_password: mustChangePassword,
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    },
  );

  return normalizeUserDocument(document);
}

export async function updateUserPassword(
  userId,
  passwordHash,
  { mustChangePassword = false } = {},
) {
  const { databases, databaseId } = createDatabasesClient();
  const document = await databases.updateDocument(databaseId, COLLECTIONS.users, userId, {
    password_hash: passwordHash,
    must_change_password: mustChangePassword,
    updated_at: new Date().toISOString(),
  });

  return normalizeUserDocument(document);
}

export async function updateUserStatus(userId, status) {
  const normalizedStatus = ["active", "inactive"].includes(status)
    ? status
    : "inactive";
  const { databases, databaseId } = createDatabasesClient();
  const document = await databases.updateDocument(databaseId, COLLECTIONS.users, userId, {
    status: normalizedStatus,
    updated_at: new Date().toISOString(),
  });

  return normalizeUserDocument(document);
}

export async function deleteUserRecord(userId) {
  const { databases, databaseId } = createDatabasesClient();

  await databases.deleteDocument(databaseId, COLLECTIONS.users, userId);
}

export async function updateRoleModules(roleId, modules) {
  const role = await getRoleById(roleId);

  if (!role) {
    throw new Error("Role not found.");
  }

  const allowedModules = new Set(
    DEFAULT_ROLE_MODULES_BY_CODE[role.code] || MODULE_DEFINITIONS.map((module) => module.key),
  );
  const validModules = Array.from(
    new Set(
      (Array.isArray(modules) ? modules : []).filter((moduleKey) =>
        MODULE_DEFINITIONS.some((module) => module.key === moduleKey) &&
        allowedModules.has(moduleKey),
      ),
    ),
  );

  if (role.code === "admin" && !validModules.includes("admin")) {
    validModules.push("admin");
  }

  const { databases, databaseId } = createDatabasesClient();
  const document = await databases.updateDocument(databaseId, COLLECTIONS.roles, roleId, {
    modules_json: JSON.stringify(validModules),
  });

  return normalizeRoleDocument(document);
}
