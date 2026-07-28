// RBAC permission catalog + role grants — single source of truth.
// Imported by: backend route/permission checks, the appRole seed data,
// and (via /api/me) the frontend Gate/can() helper. Keep this the ONLY
// place role->permission mappings are defined.

/** Every permission key the app understands. Grouped by area for readability. */
export const PERMISSIONS = Object.freeze({
  // Shopify merchant storefront configuration. These are the only capabilities
  // available to a shop-only session that cannot identify a person.
  VIEW_STOREFRONT_CONFIGURATION: "view_storefront_configuration",
  MANAGE_STOREFRONT_CONFIGURATION: "manage_storefront_configuration",

  // Dashboard / reporting
  VIEW_DASHBOARD: "view_dashboard",
  VIEW_REPORTS: "view_reports",
  EXPORT_REPORTS: "export_reports",

  // Clients
  VIEW_CLIENTS: "view_clients",
  EDIT_CLIENTS: "edit_clients",

  // Claims
  VIEW_CLAIMS: "view_claims",
  EDIT_CLAIMS: "edit_claims",
  APPROVE_CLAIMS: "approve_claims",
  PAY_CLAIMS: "pay_claims",

  // Orders / operations
  VIEW_ORDERS: "view_orders",
  MANAGE_ORDERS: "manage_orders",
  VIEW_ERRORS: "view_errors",
  REPLAY_DELIVERIES: "replay_deliveries",

  // Finance (Phase 3+, keys reserved now so roles are stable)
  VIEW_FINANCE: "view_finance",
  EDIT_FINANCE: "edit_finance",

  // Users / roles / platform
  VIEW_USERS: "view_users",
  MANAGE_USERS: "manage_users",
  VIEW_AUDIT: "view_audit",
  MANAGE_SETTINGS: "manage_settings",
});

const ALL = Object.freeze(Object.values(PERMISSIONS));

/**
 * Role -> granted permission keys.
 * Names MUST match the appRole "name" enum in api/models/appRole/schema.gadget.ts.
 */
export const ROLE_GRANTS = Object.freeze({
  "Super Admin": ALL,
  Administrator: Object.freeze(
    ALL.filter((p) => p !== PERMISSIONS.EDIT_FINANCE)
  ),
  "Claims Manager": Object.freeze([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.EDIT_CLAIMS,
    PERMISSIONS.APPROVE_CLAIMS,
    PERMISSIONS.PAY_CLAIMS,
    PERMISSIONS.VIEW_ORDERS,
  ]),
  "Claims Agent": Object.freeze([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.EDIT_CLAIMS,
    PERMISSIONS.VIEW_ORDERS,
  ]),
  "Finance Manager": Object.freeze([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.PAY_CLAIMS,
    PERMISSIONS.VIEW_FINANCE,
    PERMISSIONS.EDIT_FINANCE,
  ]),
  Accountant: Object.freeze([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.VIEW_FINANCE,
  ]),
  "Operations Manager": Object.freeze([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.EDIT_CLIENTS,
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.VIEW_ORDERS,
    PERMISSIONS.MANAGE_ORDERS,
    PERMISSIONS.VIEW_ERRORS,
    PERMISSIONS.REPLAY_DELIVERIES,
  ]),
  "Support Agent": Object.freeze([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.VIEW_ORDERS,
    PERMISSIONS.VIEW_ERRORS,
  ]),
  "Read-Only Auditor": Object.freeze([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.VIEW_ORDERS,
    PERMISSIONS.VIEW_FINANCE,
    PERMISSIONS.VIEW_AUDIT,
  ]),
  // General low-privilege internal staff account: basic day-to-day
  // visibility without edit/approve/finance/admin capabilities.
  Staff: Object.freeze([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.VIEW_ORDERS,
  ]),
});

/** The 10 role names, in display order. */
export const ROLE_NAMES = Object.freeze(Object.keys(ROLE_GRANTS));
const NO_GRANTS = Object.freeze([]);
const SHOPIFY_APP_SESSION_ROLE = "shopify-app-users";
export const SHOP_PRINCIPAL_KEY = "Shop Merchant";
export const SHOP_PRINCIPAL_GRANTS = Object.freeze([
  PERMISSIONS.VIEW_STOREFRONT_CONFIGURATION,
  PERMISSIONS.MANAGE_STOREFRONT_CONFIGURATION,
]);

/** Returns the permission-key array for a role name (empty if unknown). */
export function grantsForRole(roleName) {
  return ROLE_GRANTS[roleName] || NO_GRANTS;
}

/** True if the given permission-key list includes `permission`. */
export function can(permissionList, permission) {
  return Array.isArray(permissionList) && permissionList.includes(permission);
}

/**
 * Resolve the identity Gadget can actually prove for this Shopify app:
 * an authenticated shop principal. The session model has shopId/roles but no
 * person identifier, so this deliberately does not pretend to identify an
 * appUser. Per-person RBAC requires a future identity-provider/session change.
 *
 * A shop principal is deliberately separate from the nine internal app roles.
 * It receives only the two storefront-configuration capabilities above. An
 * appUser assignment cannot be resolved or honored without a person identifier,
 * so every internal capability fails closed until identity architecture changes.
 * Missing/malformed/stale roles, a missing shop, or an unknown shop fail closed.
 */
export async function requireIdentity({ api, session }) {
  const sessionShop = session?.get("shop");
  const shopId = session?.get("shopId") ??
    sessionShop?.id ??
    sessionShop?._link ??
    sessionShop;
  const roles = session?.get("roles");
  const personId = session?.get("personId");
  const hasShopifyAppRole = Array.isArray(roles) &&
    roles.length === 1 &&
    roles[0] === SHOPIFY_APP_SESSION_ROLE;

  // Standalone dashboard logins have a verified person session but do not
  // receive Shopify's derived shopId field in the route context. Resolve the
  // one active membership by personId and derive its tenant from that record.
  if ((!shopId || !hasShopifyAppRole) && personId && session?.get("internalAuthenticatedAt")) {
    const authenticatedAt = new Date(session.get("internalAuthenticatedAt")).getTime();
    const sessionIsFresh = Number.isFinite(authenticatedAt) &&
      Date.now() - authenticatedAt >= 0 &&
      Date.now() - authenticatedAt <= 12 * 60 * 60 * 1000;
    if (sessionIsFresh) {
      const memberships = await api.appUser.findMany({
        filter: {
          AND: [
            { personId: { equals: personId } },
            { status: { equals: "active" } },
          ],
        },
        first: 2,
        select: {
          id: true, name: true, email: true, personId: true, shopId: true,
          status: true, accessScope: true, allowedShopIds: true,
          department: true, mustChangePassword: true, role: { name: true },
        },
      });
      const appUser = memberships.length === 1 && !memberships.hasNextPage
        ? memberships[0]
        : null;
      const roleKey = appUser?.role?.name;
      if (appUser?.shopId && ROLE_GRANTS[roleKey]) {
        return {
          user: {
            id: appUser.id, name: appUser.name, email: appUser.email,
            personId: appUser.personId, principalType: "person", role: roleKey,
          },
          mustChangePassword: Boolean(appUser.mustChangePassword),
          shopId: appUser.shopId,
          roleKey,
          permissions: grantsForRole(roleKey),
          accessScope: appUser.accessScope || "department",
          allowedShopIds: Array.isArray(appUser.allowedShopIds)
            ? appUser.allowedShopIds.map(String)
            : [],
          department: appUser.department || "none",
        };
      }
    }
  }
  if (
    !shopId ||
    !hasShopifyAppRole
  ) {
    const error = new Error("Authentication required");
    error.statusCode = 401;
    throw error;
  }

  const shop = await api.shopifyShop.findFirst({
    filter: { id: { equals: shopId } },
    select: { id: true },
  });
  if (!shop) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  if (personId) {
    const normalizedPersonId =
      typeof personId === "string" ? personId.trim().normalize("NFKC") : "";
    if (!normalizedPersonId || !/^[A-Za-z0-9._|~-]+$/.test(normalizedPersonId)) {
      const error = new Error("Forbidden");
      error.statusCode = 403;
      throw error;
    }
    const memberships = await api.appUser.findMany({
      filter: {
        AND: [
          {
            shopPersonKey: {
              equals: `${String(shopId)}:${normalizedPersonId}`,
            },
          },
          { shopId: { equals: shopId } },
          { personId: { equals: normalizedPersonId } },
          { status: { equals: "active" } },
        ],
      },
      first: 2,
      select: {
        id: true,
        name: true,
        email: true,
        personId: true,
        status: true,
        accessScope: true,
        allowedShopIds: true,
        department: true,
        mustChangePassword: true,
        role: { name: true },
      },
    });
    const appUser =
      memberships.length === 1 && !memberships.hasNextPage
        ? memberships[0]
        : null;
    const roleKey = appUser?.role?.name;
    if (!appUser || !ROLE_GRANTS[roleKey]) {
      const error = new Error("Forbidden");
      error.statusCode = 403;
      throw error;
    }
    return {
      user: {
        id: appUser.id,
        name: appUser.name,
        email: appUser.email,
        personId: appUser.personId,
        principalType: "person",
        role: roleKey,
      },
      mustChangePassword: Boolean(appUser.mustChangePassword),
      shopId,
      roleKey,
      permissions: grantsForRole(roleKey),
      accessScope: appUser.accessScope || "department",
      allowedShopIds: Array.isArray(appUser.allowedShopIds)
        ? appUser.allowedShopIds.map(String)
        : [],
      department: appUser.department || "none",
    };
  }

  const user = {
    id: `shop:${shopId}`,
    name: "Shop merchant",
    email: null,
    principalType: "shop",
    role: null,
  };

  return {
    user,
    shopId,
    roleKey: SHOP_PRINCIPAL_KEY,
    permissions: SHOP_PRINCIPAL_GRANTS,
    // Shop-only sessions are inherently scoped to their single shop.
    accessScope: "specific_stores",
    allowedShopIds: [String(shopId)],
    department: "none",
  };
}

/**
 * Return the list of shop IDs an identity is allowed to see, or `null` to
 * mean "all stores" (Super Admin / all_stores scope — caller should apply
 * no shop filter in that case). Department-scoped users are treated as
 * "all stores" for the purpose of shop filtering; the department itself is
 * used elsewhere to filter by record type/department, not by shop.
 */
export function allowedShopIdsForIdentity(identity) {
  const scope = identity?.accessScope || "department";
  if (scope === "all_stores") return null;
  if (scope === "department") return null;
  return Array.isArray(identity?.allowedShopIds)
    ? identity.allowedShopIds.map(String)
    : [];
}

/**
 * Assert that a specific shop ID is visible to this identity. Throws 403 if
 * the identity's accessScope excludes it (only relevant for specific_stores).
 */
export function assertShopVisible(identity, shopId) {
  const allowed = allowedShopIdsForIdentity(identity);
  if (allowed === null) return; // all_stores or department scope: unrestricted by shop
  if (!allowed.includes(String(shopId))) {
    const error = new Error("Forbidden: shop is outside your access scope");
    error.statusCode = 403;
    throw error;
  }
}

export async function requirePermission({ api, session }, permission) {
  const { user, permissions } = await requireIdentity({ api, session });
  if (!permissions.includes(permission)) {
    const error = new Error(
      "Forbidden: person identity required for internal capability"
    );
    error.statusCode = 403;
    throw error;
  }

  return user;
}

/**
 * Authorize an administrative call and return the session-derived shop ID.
 * A supplied shop ID is only a consistency assertion; it never becomes the
 * source of tenant identity.
 */
export async function requireShopPermission(
  { api, session },
  permission,
  requestedShopId
) {
  const identity = await requireIdentity({ api, session });
  const { shopId, permissions } = identity;
  if (!permissions.includes(permission)) {
    const error = new Error(
      "Forbidden: person identity required for internal capability"
    );
    error.statusCode = 403;
    throw error;
  }

  const targetShopId = requestedShopId != null ? requestedShopId : shopId;

  // Session shop must always be within the identity's allowed scope.
  assertShopVisible(identity, shopId);

  if (requestedShopId != null) {
    // Explicit cross-shop request (e.g. Super Admin/Admin querying another
    // store's data): must be within the identity's access scope.
    assertShopVisible(identity, requestedShopId);
  }

  return targetShopId;
}

/**
 * Resolve tenancy for global actions. Browser/API invocations must authenticate
 * and match the session shop. Sessionless background actions are accepted only
 * on Gadget's internal background-action path so install/webhook queues keep
 * working without making the API action itself tenant-selectable.
 */
export async function authorizeActionShop(
  { api, session, trigger, params },
  permission
) {
  const requestedShopId = params?.shopId;

  if (trigger?.type === "background-action" && !session) {
    if (!requestedShopId) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      throw error;
    }
    return requestedShopId;
  }

  if (trigger?.type !== "api") {
    const error = new Error("Authentication required");
    error.statusCode = 401;
    throw error;
  }

  return requireShopPermission(
    { api, session },
    permission,
    requestedShopId
  );
}
