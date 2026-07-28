import crypto from "node:crypto";
import { ROLE_NAMES } from "./permissions.js";

const CREATE_FIELDS = new Set([
  "name",
  "email",
  "role",
  "status",
  "accessScope",
  "allowedShopIds",
  "department",
]);
const UPDATE_FIELDS = new Set([
  "name",
  "email",
  "role",
  "status",
  "accessScope",
  "allowedShopIds",
  "department",
]);

const ACCESS_SCOPES = new Set(["all_stores", "specific_stores", "department"]);
const DEPARTMENTS = new Set([
  "none",
  "finance",
  "claims",
  "operations",
  "support",
  "administration",
]);

function validateFields(input, allowed) {
  for (const key of Object.keys(input || {})) {
    if (!allowed.has(key)) {
      const error = new Error(`appUser field "${key}" is immutable or unsupported`);
      error.statusCode = 400;
      throw error;
    }
  }
}

export function normalizePersonId(value) {
  const normalized =
    typeof value === "string" ? value.trim().normalize("NFKC") : "";
  if (
    !normalized ||
    normalized.length > 200 ||
    !/^[A-Za-z0-9._|~-]+$/.test(normalized)
  ) {
    const error = new Error("personId is required and has an invalid format");
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

// Server-side unique person ID generator. Super Admin never supplies this —
// it is minted here and checked for collisions by the caller (create.js)
// against existing appUser.personId/shopPersonKey values before use.
export function generatePersonId() {
  // Format: P-<10 random base32-ish chars>, uppercase, unambiguous alphabet.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const bytes = crypto.randomBytes(10);
  let suffix = "";
  for (let i = 0; i < bytes.length; i++) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return `P-${suffix}`;
}

export function buildShopPersonKey(shopId, personId) {
  if (!shopId) throw new Error("shopId is required");
  return `${String(shopId)}:${normalizePersonId(personId)}`;
}

export function validateAccessScopeInput(input) {
  const accessScope = input?.accessScope;
  if (accessScope !== undefined && !ACCESS_SCOPES.has(accessScope)) {
    const error = new Error("accessScope is invalid");
    error.statusCode = 400;
    throw error;
  }

  if (input?.allowedShopIds !== undefined) {
    if (
      !Array.isArray(input.allowedShopIds) ||
      !input.allowedShopIds.every(
        (id) => typeof id === "string" || typeof id === "number"
      )
    ) {
      const error = new Error("allowedShopIds must be an array of shop ids");
      error.statusCode = 400;
      throw error;
    }
    if (accessScope === "specific_stores" && input.allowedShopIds.length === 0) {
      const error = new Error(
        "allowedShopIds is required when accessScope is specific_stores"
      );
      error.statusCode = 400;
      throw error;
    }
  }

  if (input?.department !== undefined && !DEPARTMENTS.has(input.department)) {
    const error = new Error("department is invalid");
    error.statusCode = 400;
    throw error;
  }
  if (
    accessScope === "department" &&
    input?.department !== undefined &&
    input.department === "none"
  ) {
    const error = new Error(
      "department must be set to a real department when accessScope is department"
    );
    error.statusCode = 400;
    throw error;
  }
}

export function validateAppUserCreateInput(input) {
  validateFields(input, CREATE_FIELDS);
  validateAccessScopeInput(input);
}

export function validateAppUserUpdateInput(input) {
  validateFields(input, UPDATE_FIELDS);
  validateAccessScopeInput(input);
}

export function roleLinkId(role) {
  return role?._link ?? role?.id ?? null;
}

export function validateCanonicalRole(role, requestedRoleId) {
  if (
    !role ||
    String(role.id) !== String(requestedRoleId) ||
    !ROLE_NAMES.includes(role.name)
  ) {
    const error = new Error("Requested role is not a canonical allowed role");
    error.statusCode = 400;
    throw error;
  }
  return String(role.id);
}
