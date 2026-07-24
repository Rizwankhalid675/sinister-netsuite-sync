import { PERMISSIONS, requireIdentity } from "./permissions.js";

const APPROVAL_STATUSES = new Set([
  "Approved",
  "Partially Approved",
  "Denied",
  "Reopened",
  "Closed",
]);

const PAYMENT_STATUSES = new Set(["Payment Pending", "Paid"]);
const EDITABLE_FIELDS = new Set([
  "status",
  "reason",
  "claimValueMinor",
  "claimCurrency",
  "transitionNote",
]);
const STATUS_ONLY_FIELDS = new Set(["status", "transitionNote"]);

export function validateMinorCurrencyPair(amountMinor, currency, label) {
  const normalizedCurrency =
    typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    !/^[A-Z]{3}$/.test(normalizedCurrency)
  ) {
    const error = new Error(
      `${label} amount must be nonnegative integer minor units with ISO currency`
    );
    error.statusCode = 400;
    throw error;
  }
  return { amountMinor, currency: normalizedCurrency };
}

export function validateClaimUpdateFields(input = {}) {
  for (const key of Object.keys(input)) {
    if (!EDITABLE_FIELDS.has(key)) {
      const error = new Error(`Claim field "${key}" is immutable or unsupported`);
      error.statusCode = 400;
      throw error;
    }
  }
}

export function requiredPermissionsForClaimUpdate(
  input,
  fromStatus,
  editPermission = PERMISSIONS.EDIT_CLAIMS
) {
  validateClaimUpdateFields(input);
  const toStatus = input?.status ?? fromStatus;
  const required = new Set([
    permissionForClaimChange(fromStatus, toStatus),
  ]);
  if (Object.keys(input || {}).some((key) => !STATUS_ONLY_FIELDS.has(key))) {
    required.add(editPermission);
  }
  return [...required];
}

export function permissionForClaimChange(fromStatus, toStatus) {
  if (PAYMENT_STATUSES.has(toStatus)) return PERMISSIONS.PAY_CLAIMS;
  if (APPROVAL_STATUSES.has(toStatus)) return PERMISSIONS.APPROVE_CLAIMS;
  return PERMISSIONS.EDIT_CLAIMS;
}

export function requireClaimChangePermission(
  permissions,
  fromStatus,
  toStatus
) {
  const required = permissionForClaimChange(fromStatus, toStatus);
  if (!Array.isArray(permissions) || !permissions.includes(required)) {
    const error = new Error(`Forbidden: ${required} permission required`);
    error.statusCode = 403;
    throw error;
  }
  return required;
}

export async function authorizeClaimChange(
  { api, session },
  fromStatus,
  toStatus
) {
  const identity = await requireIdentity({ api, session });
  requireClaimChangePermission(identity.permissions, fromStatus, toStatus);
  return identity;
}

export function relationId(record, key) {
  return record?.[`${key}Id`] ?? record?.[key]?.id ?? null;
}

function sameShopFilter(id, shopId) {
  return {
    AND: [
      { id: { equals: id } },
      { shopId: { equals: shopId } },
    ],
  };
}

export async function validateClaimRelationships({
  api,
  shopId,
  clientId,
  orderId,
}) {
  if (!shopId || !clientId) {
    const error = new Error("Claim shop and client are required");
    error.statusCode = 400;
    throw error;
  }

  const client = await api.client.findFirst({
    filter: sameShopFilter(clientId, shopId),
    select: { id: true },
  });
  if (!client) {
    const error = new Error("Forbidden: client does not belong to claim shop");
    error.statusCode = 403;
    throw error;
  }

  if (orderId) {
    const order = await api.shopifyOrder.findFirst({
      filter: sameShopFilter(orderId, shopId),
      select: { id: true },
    });
    if (!order) {
      const error = new Error("Forbidden: order does not belong to claim shop");
      error.statusCode = 403;
      throw error;
    }
  }
}
