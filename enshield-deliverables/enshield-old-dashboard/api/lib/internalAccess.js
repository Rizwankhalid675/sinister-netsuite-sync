import { grantsForRole, requireIdentity } from "./permissions.js";

// Roles whose active assignments grant visibility into shop-less "legacy"
// records (clients imported from the old dashboard without a linked
// shopifyShop), in addition to their normally assigned shops. Kept narrow
// and explicit; do not widen without a corresponding permission review.
const GLOBAL_LEGACY_ROLES = new Set(["Super Admin", "Administrator"]);

function accessError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function selectAssignedShops(assignments, permission, requestedShopId) {
  const active = (assignments || []).filter((assignment) =>
    assignment?.status === "active" && assignment?.shopId
  );
  const activeShopIds = active.map((assignment) => String(assignment.shopId));
  if (new Set(activeShopIds).size !== activeShopIds.length) {
    throw accessError("Duplicate active shop assignments", 503);
  }
  const allowed = active
    .filter((assignment) => grantsForRole(assignment?.role?.name).includes(permission))
    .map((assignment) => String(assignment.shopId));
  const unique = [...new Set(allowed)];

  // Does this identity hold an active assignment (with a role that grants
  // this permission) for a role considered "global" for legacy-record
  // visibility? Legacy clients (shop === null) are only ever visible to
  // these roles, never inferred from shop assignments alone.
  const includesLegacy = active.some(
    (assignment) =>
      GLOBAL_LEGACY_ROLES.has(assignment?.role?.name) &&
      grantsForRole(assignment?.role?.name).includes(permission)
  );

  if (requestedShopId != null && requestedShopId !== "" && requestedShopId !== "all") {
    const requested = String(requestedShopId);
    if (!unique.includes(requested)) throw accessError("Forbidden", 403);
    return { shopIds: [requested], includesLegacy: false };
  }
  if (!unique.length && !includesLegacy) throw accessError("Forbidden", 403);
  return { shopIds: unique, includesLegacy };
}

export async function resolveInternalOperator({ api, session, now = new Date(), maxAgeMs = 12 * 60 * 60 * 1000 }) {
  const personId = session?.get("personId");
  if (typeof personId !== "string" || !personId.trim()) {
    throw accessError("Authentication required", 401);
  }
  const authenticatedAt = new Date(session?.get("internalAuthenticatedAt") || "");
  if (
    Number.isNaN(authenticatedAt.getTime()) ||
    authenticatedAt.getTime() > now.getTime() + 60_000 ||
    now.getTime() - authenticatedAt.getTime() > maxAgeMs
  ) {
    throw accessError("Internal session expired", 401);
  }
  const findOperator = api.internalOperator.maybeFindFirst?.bind(api.internalOperator) ??
    api.internalOperator.findFirst.bind(api.internalOperator);
  const operator = await findOperator({
    filter: {
      AND: [
        { personId: { equals: personId.trim() } },
        { status: { equals: "active" } },
      ],
    },
    select: { id: true, personId: true, name: true, email: true, status: true },
  });
  if (!operator) throw accessError("Forbidden", 403);
  const assignments = await api.operatorShopAssignment.findMany({
    filter: {
      AND: [
        { operatorId: { equals: operator.id } },
        { status: { equals: "active" } },
      ],
    },
    first: 250,
    select: {
      id: true, status: true, shopId: true,
      shop: { id: true, name: true, domain: true },
      role: { id: true, name: true },
    },
  });
  if (assignments.hasNextPage) {
    throw accessError("Assignment limit exceeded", 503);
  }
  return { operator, assignments: [...assignments] };
}

export async function requireInternalAccess(
  context,
  permission,
  requestedShopId
) {
  let identity;
  try {
    identity = await resolveInternalOperator(context);
  } catch (error) {
    if (error?.statusCode !== 403) throw error;
    const appIdentity = await requireIdentity(context);
    identity = {
      operator: null,
      appUser: appIdentity.user,
      assignments: [{
        shopId: String(appIdentity.shopId),
        status: "active",
        role: { name: appIdentity.roleKey },
      }],
    };
  }
  const { shopIds, includesLegacy } = selectAssignedShops(
    identity.assignments,
    permission,
    requestedShopId
  );
  return {
    ...identity,
    shopIds,
    includesLegacy,
  };
}

/**
 * Build a filter matching records belonging to the given shop IDs. If
 * `includesLegacy` is true, also matches shop-less legacy records
 * (shop === null) — only ever set for identities holding an active
 * assignment with a global role (see GLOBAL_LEGACY_ROLES).
 */
export function shopIdFilter(shopIds, includesLegacy = false) {
  if (!Array.isArray(shopIds)) {
    throw accessError("Forbidden", 403);
  }
  if (!shopIds.length && !includesLegacy) {
    throw accessError("Forbidden", 403);
  }
  const clauses = shopIds.map((id) => ({ shopId: { equals: id } }));
  if (includesLegacy) {
    clauses.push({ shopId: { isSet: false } });
  }
  if (!clauses.length) throw accessError("Forbidden", 403);
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}
