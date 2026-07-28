// Password hashing + one-time token helpers.
// Uses Node's built-in crypto (scrypt) so no extra dependency is required.
// Format stored in appUser.passwordHash: "scrypt:<saltHex>:<hashHex>"

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb);

const KEY_LEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

/** Hash a plaintext password. Returns a string safe to store in the DB. */
export async function hashPassword(plaintext) {
  if (!plaintext || typeof plaintext !== "string" || plaintext.length < 8) {
    throw new Error("Password must be a string of at least 8 characters");
  }
  const salt = randomBytes(16);
  const derived = await scrypt(plaintext, salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Verify a plaintext password against a stored hash. Timing-safe. */
export async function verifyPassword(plaintext, stored) {
  if (!plaintext || !stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(plaintext, salt, expected.length, SCRYPT_PARAMS);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Generate a human-typeable temp password, e.g. "Xf7q-Kd92-Lm4p". */
export function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const group = () =>
    Array.from(randomBytes(4))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return `${group()}-${group()}-${group()}`;
}

/** Generate a URL-safe opaque token for email confirmation / password reset. */
export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Hash a token before storing it (so DB leaks don't expose usable tokens). */
export async function hashToken(token) {
  const salt = Buffer.alloc(16, 0); // deterministic salt: tokens are single-use, high-entropy already
  const derived = await scrypt(token, salt, 32, { N: 1024, r: 8, p: 1 });
  return derived.toString("hex");
}

export async function verifyToken(token, storedHash) {
  if (!token || !storedHash) return false;
  const derived = await hashToken(token);
  const a = Buffer.from(derived, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Standard expiry windows. */
export const TOKEN_TTL_MS = {
  emailConfirmation: 1000 * 60 * 60 * 24 * 3, // 3 days
  passwordReset: 1000 * 60 * 60 * 2, // 2 hours
};

export function expiryFromNow(ms) {
  return new Date(Date.now() + ms);
}
