const SAFE_ID = /^[A-Za-z0-9._~-]{1,200}$/;

export function assignmentKeyFor(operatorId, shopId) {
  const operator = String(operatorId || "");
  const shop = String(shopId || "");
  if (!SAFE_ID.test(operator) || !SAFE_ID.test(shop)) {
    const error = new Error("Invalid assignment identity");
    error.statusCode = 400;
    throw error;
  }
  return `${operator}:${shop}`;
}

export function requireOwnerProvisioning({ trigger }) {
  if (trigger?.type !== "background-action") {
    const error = new Error("Owner provisioning is required");
    error.statusCode = 403;
    throw error;
  }
}
