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
  if (trigger?.type === "background-action") return;

  // DEV-ONLY ESCAPE HATCH: allow the one-off seedDevOperator action to
  // provision the initial internalOperator from a direct API/enqueue call
  // in non-production environments, since there is no existing operator
  // yet to legitimately trigger a background action. This still requires
  // an authenticated Gadget platform session (the playground) — it does
  // not weaken production access control, which is unaffected because
  // seedDevOperator itself throws when NODE_ENV === "production".
  if (process.env.NODE_ENV !== "production" && trigger?.actionApiIdentifier === "seedDevOperator") {
    return;
  }

  const error = new Error("Owner provisioning is required");
  error.statusCode = 403;
  throw error;
}
