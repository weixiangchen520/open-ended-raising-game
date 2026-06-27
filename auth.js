import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

const PASSWORD_ALGORITHM = "pbkdf2";
const PASSWORD_DIGEST = "sha256";
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;

export function hashPassword(password, salt = randomBytes(18).toString("base64url")) {
  const key = pbkdf2Sync(
    String(password),
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST
  ).toString("base64url");
  return [
    PASSWORD_ALGORITHM,
    PASSWORD_DIGEST,
    PASSWORD_ITERATIONS,
    salt,
    key
  ].join(":");
}

export function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split(":");
  if (parts.length !== 5) return false;
  const [algorithm, digest, iterationsText, salt, expectedKey] = parts;
  const iterations = Number(iterationsText);
  if (algorithm !== PASSWORD_ALGORITHM || digest !== PASSWORD_DIGEST || !Number.isInteger(iterations)) {
    return false;
  }

  try {
    const actual = pbkdf2Sync(String(password), salt, iterations, PASSWORD_KEY_LENGTH, digest);
    const expected = Buffer.from(expectedKey, "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function loadAccounts(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
  return accounts
    .map((account) => normalizeAccount(account))
    .filter(Boolean);
}

export function findAccount(accounts, login) {
  const needle = normalizeLogin(login);
  return (accounts || []).find((account) => normalizeLogin(account.login) === needle) || null;
}

export function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    login: account.login,
    displayName: account.displayName || account.login,
    role: account.role || "player"
  };
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function parseCookies(header = "") {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index < 0) return cookies;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (key) cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

export function loginFingerprint(login) {
  return createHash("sha256").update(normalizeLogin(login)).digest("hex").slice(0, 16);
}

function normalizeAccount(rawAccount) {
  if (!rawAccount || typeof rawAccount !== "object") return null;
  const login = String(rawAccount.login || "").trim();
  const passwordHash = String(rawAccount.passwordHash || "").trim();
  if (!login || !passwordHash) return null;
  const id = safeAccountId(rawAccount.id || login);
  return {
    id,
    login,
    displayName: String(rawAccount.displayName || login).trim(),
    role: String(rawAccount.role || "player").trim(),
    passwordHash
  };
}

function normalizeLogin(login) {
  return String(login || "").trim().toLowerCase();
}

function safeAccountId(value) {
  return String(value || "account")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "account";
}
