import { ROLE_NAMES } from "./permissions.js";

const CREATE_FIELDS = new Set(["name", "email", "personId", "role", "status"]);
const UPDATE_FIELDS = new Set(["name", "email", "role", "status"]);

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

export function buildShopPersonKey(shopId, personId) {
  if (!shopId) throw new Error("shopId is required");
  return `${String(shopId)}:${normalizePersonId(personId)}`;
}

export function validateAppUserCreateInput(input) {
  validateFields(input, CREATE_FIELDS);
  normalizePersonId(input?.personId);
}

export function validateAppUserUpdateInput(input) {
  validateFields(input, UPDATE_FIELDS);
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
