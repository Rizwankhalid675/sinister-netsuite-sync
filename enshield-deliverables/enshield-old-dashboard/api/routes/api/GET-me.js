import { grantsForRole, requireIdentity } from "../../lib/permissions.js";
import { resolveInternalOperator } from "../../lib/internalAccess.js";

// Two disjoint principal families share the "personId" session key:
// 1. internalOperator (cross-shop platform staff, set via /auth/internal-callback)
// 2. appUser / shop principal (per-store, set via /auth/login or the embedded
//    Shopify app session with no personId set)
// Try the operator resolution first (fails closed with 401/403 if no operator
// session exists), then fall back to the per-shop identity resolution used by
// every other API route so appUsers and shop principals get a consistent /api/me.
const route = async ({ reply, api, logger, session }) => {
  try {
    let payload;
    try {
      const { operator, assignments } = await resolveInternalOperator({ api, session });
      const assignmentPermissions = assignments.map((item) => grantsForRole(item.role?.name));
      const permissions = assignmentPermissions.length
        ? assignmentPermissions[0].filter((permission) =>
            assignmentPermissions.every((grants) => grants.includes(permission))
          )
        : [];
      const clients = assignments.map((item) => ({
        shopId: item.shopId,
        name: item.shop?.name || item.shop?.domain || item.shopId,
        roleKey: item.role?.name,
        permissions: grantsForRole(item.role?.name),
      }));
      payload = {
        roleKey: clients.length === 1 ? clients[0].roleKey : "Assigned operator",
        roleLabel: clients.length === 1 ? clients[0].roleKey : "Assigned operator",
        permissions,
        clients,
        user: {
          id: operator.id,
          name: operator.name,
          email: operator.email,
          principalType: "internal_operator",
        },
        mustChangePassword: false,
      };
    } catch (operatorError) {
      // No operator session present/valid — fall back to the per-shop
      // appUser identity. Bare shop-principal sessions (embedded Shopify
      // app with no personId — i.e. no confirmed dashboard person) must
      // NOT resolve a /me identity; they are storefront-only principals
      // and should be rejected here so the internal dashboard fails closed.
      if (!session?.get("personId")) {
        const error = new Error("Authentication required");
        error.statusCode = 401;
        throw error;
      }
      const identity = await requireIdentity({ api, session });
      if (identity.roleKey === "Shop merchant" || identity.user?.principalType === "shop") {
        const error = new Error("Authentication required");
        error.statusCode = 401;
        throw error;
      }
      payload = {
        roleKey: identity.roleKey,
        roleLabel: identity.roleKey,
        permissions: identity.permissions,
        clients: [],
        user: identity.user,
        accessScope: identity.accessScope,
        allowedShopIds: identity.allowedShopIds,
        department: identity.department,
        mustChangePassword: Boolean(identity.mustChangePassword),
      };
    }
    await reply.send(payload);
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "GET /api/me failed");
    const statusCode = [401, 403, 503].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ roleKey: null, roleLabel: null, permissions: [], clients: [], user: null, error: statusCode === 500 ? "Failed to resolve identity" : error.message });
  }
};
export default route;
