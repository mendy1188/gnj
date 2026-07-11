import "server-only";

import crypto from "node:crypto";

const HASH_PREFIX = "scrypt";
const HASH_KEY_LENGTH = 64;

export function hashPassword(password) {
  const normalizedPassword = String(password || "");

  if (normalizedPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto
    .scryptSync(normalizedPassword, salt, HASH_KEY_LENGTH)
    .toString("hex");

  return `${HASH_PREFIX}:${salt}:${derivedKey}`;
}

export function verifyPassword(password, passwordHash) {
  const normalizedPassword = String(password || "");
  const normalizedHash = String(passwordHash || "");
  const [prefix, salt, expectedHash] = normalizedHash.split(":");

  if (
    prefix !== HASH_PREFIX ||
    !salt ||
    !expectedHash ||
    expectedHash.length !== HASH_KEY_LENGTH * 2
  ) {
    return false;
  }

  const derivedKey = crypto
    .scryptSync(normalizedPassword, salt, HASH_KEY_LENGTH)
    .toString("hex");

  return crypto.timingSafeEqual(
    Buffer.from(derivedKey, "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}
