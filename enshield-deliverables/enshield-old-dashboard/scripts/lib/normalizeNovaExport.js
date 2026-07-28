const valueFor = (resource, attribute) =>
  resource?.fields?.find((field) => field?.attribute === attribute)?.value;

const fieldFor = (resource, attribute) =>
  resource?.fields?.find((field) => field?.attribute === attribute);

function legacyId(resource) {
  const value = resource?.id;
  if (value == null || String(value).trim() === "") {
    throw new Error("Nova resource requires a legacy ID");
  }
  return String(value);
}

function relationshipId(resource, attribute) {
  const value = fieldFor(resource, attribute)?.belongsToId;
  if (value == null || String(value).trim() === "") {
    throw new Error(`Nova resource requires a ${attribute} relationship`);
  }
  return String(value);
}

function minorUnits(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Nova resource requires nonnegative money");
  }
  return Math.round((amount + Number.EPSILON) * 100);
}

function text(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizedStatus(value, fallback) {
  return text(value, fallback).toLowerCase().replace(/\s+/g, "_");
}

export function normalizeClient(resource) {
  const id = legacyId(resource);
  return {
    sourceKey: `nova:client:${id}`,
    legacyId: id,
    storeName: text(valueFor(resource, "client_name"), `Legacy client ${id}`),
    storeId: text(valueFor(resource, "store_id"), `legacy-${id}`),
    platform: text(valueFor(resource, "platform"), "Unknown"),
    apiEnabled: valueFor(resource, "api_enabled") === true,
    customerSince: valueFor(resource, "customer_since") || null,
    status: valueFor(resource, "api_enabled") === true ? "active" : "paused",
  };
}

export function normalizeOrder(resource, platformByClient = new Map()) {
  const id = legacyId(resource);
  const legacyClientId = relationshipId(resource, "client");
  const status = normalizedStatus(valueFor(resource, "status"), "unknown");
  const explicitShipped = valueFor(resource, "is_shipped");
  return {
    sourceKey: `nova:order:${id}`,
    legacyId: id,
    legacyClientId,
    platform: text(platformByClient.get(legacyClientId), "Unknown"),
    orderNumber: text(valueFor(resource, "order_id"), id),
    valueMinor: minorUnits(valueFor(resource, "value")),
    protectionCostMinor: minorUnits(valueFor(resource, "on_shield_cost")),
    taxMinor: minorUnits(valueFor(resource, "tax")),
    shippingMinor: minorUnits(valueFor(resource, "shipping_cost")),
    currency: "USD",
    status,
    isShipped: typeof explicitShipped === "boolean"
      ? explicitShipped
      : ["shipped", "fulfilled", "delivered", "complete"].includes(status),
    trackingNumber: text(valueFor(resource, "tracking_number")) || null,
    placedAt: valueFor(resource, "created_at") || null,
  };
}

export function normalizeClaim(resource, platformByClient = new Map()) {
  const id = legacyId(resource);
  const legacyClientId = relationshipId(resource, "client");
  const orderField = fieldFor(resource, "order");
  const legacyOrderId = orderField?.belongsToId == null
    ? null
    : String(orderField.belongsToId);
  return {
    sourceKey: `nova:claim:${id}`,
    legacyId: id,
    legacyClientId,
    legacyOrderId,
    platform: text(platformByClient.get(legacyClientId), "Unknown"),
    claimValueMinor: minorUnits(valueFor(resource, "value")),
    currency: "USD",
    status: normalizedStatus(valueFor(resource, "status"), "unknown"),
    submittedAt: valueFor(resource, "created_at") || null,
  };
}
