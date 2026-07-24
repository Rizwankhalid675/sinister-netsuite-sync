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

// DEV-ONLY ESCAPE HATCH: set to true only for the duration of the nested
// internalOperator.create() call made from api/actions/seedDevOperator.js.
// Gadget does NOT propagate the outer action's trigger.actionApiIdentifier
// to nested model-action calls (the nested create sees its own native
// trigger), so we can't detect "called from seedDevOperator" via `trigger`
// alone. This explicit, function-scoped flag is the narrowest alternative:
// it is only ever set true inside seedDevOperator's own request lifecycle,
// synchronously wraps the single `api.internalOperator.create()` call, and
// is reset in a `finally` block even if that call throws. It has no effect
// on any other request because each request gets a fresh module state in
// Gadget's execution model. Production is still unaffected: seedDevOperator
// itself throws immediately when NODE_ENV === "production", before this
// flag is ever set.
let devSeedInProgress = false;

export function withDevSeedEscape(fn) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("withDevSeedEscape must never run in production");
  }
  devSeedInProgress = true;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      devSeedInProgress = false;
    });
}

export function requireOwnerProvisioning({ trigger }) {
  if (trigger?.type === "background-action") return;

  if (process.env.NODE_ENV !== "production" && devSeedInProgress) {
    return;
  }

  const error = new Error("Owner provisioning is required");
  error.statusCode = 403;
  throw error;
}

// DEV/INIT-ONLY ESCAPE HATCH: identical shape to devSeedInProgress above, but
// its own flag/function pair so it is scoped strictly to appRole.create being
// invoked from within api/actions/seedAppRoles.js's bootstrap loop. appRole
// has no create action exposed to normal callers (see
// api/models/appRole/actions/create.js's header for why), so this is the only
// legitimate way any appRole record is ever created. Reset in `finally` even
// on error; fresh module state per request means it can't leak across
// requests. Production is unaffected: seedAppRoles callers still go through
// this same NODE_ENV check.
let appRoleSeedInProgress = false;

export function withAppRoleSeedEscape(fn) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("withAppRoleSeedEscape must never run in production");
  }
  appRoleSeedInProgress = true;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      appRoleSeedInProgress = false;
    });
}

export function requireAppRoleSeedEscape() {
  if (process.env.NODE_ENV !== "production" && appRoleSeedInProgress) {
    return;
  }
  const error = new Error("appRole.create can only be invoked from the seedAppRoles bootstrap");
  error.statusCode = 403;
  throw error;
}
