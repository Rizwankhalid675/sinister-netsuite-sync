import { grantsForRole } from "./permissions.js";

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
  if (requestedShopId != null && requestedShopId !== "" && requestedShopId !== "all") {
    const requested = String(requestedShopId);
    if (!unique.includes(requested)) throw accessError("Forbidden", 403);
    return [requested];
  }
  if (!unique.length) throw accessError("Forbidden", 403);
  return unique;
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
  const operator = await api.internalOperator.findFirst({
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
  const identity = await resolveInternalOperator(context);
  return {
    ...identity,
    shopIds: selectAssignedShops(identity.assignments, permission, requestedShopId),
  };
}

export function shopIdFilter(shopIds) {
  if (!Array.isArray(shopIds) || !shopIds.length) {
    throw accessError("Forbidden", 403);
  }
  return shopIds.length === 1
    ? { shopId: { equals: shopIds[0] } }
    : { OR: shopIds.map((id) => ({ shopId: { equals: id } })) };
}
