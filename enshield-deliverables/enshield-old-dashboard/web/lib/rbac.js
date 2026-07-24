/**
 * ============================================================================
 * RBAC (Role-Based Access Control) — FRONTEND PROJECTION
 * ============================================================================
 *
 * IMPORTANT ARCHITECTURE NOTE
 * ---------------------------
 * This module is a *presentation/action-gating* layer that sits ON TOP of the
 * Shopify shop session. It does NOT replace, weaken, or touch the data-layer
 * tenancy guarantee.
 *
 * Tenancy (which SHOP's data you can read) is enforced at the data layer by the
 * access-control .gelly filters, e.g.:
 *
 *     filter ($session: Session) on shopifyOrder [ where shopId == $session.shopId ]
 *
 * Those filters are untouched. Every read still returns ONLY the current shop's
 * rows. RBAC here answers a *different* question: given a user who is already
 * inside an authenticated shop session, WHAT may they see and do in the UI.
 *
 * SINGLE SOURCE OF TRUTH
 * ----------------------
 * Role -> permission mapping lives in the BACKEND: api/lib/permissions.js. The
 * frontend does NOT re-derive grants. The current user's permission array is
 * delivered by GET /api/me (see web/lib/useRole.jsx) and `can()` below is a
 * pure array-membership check against that delivered list.
 *
 * This file therefore only mirrors the PERMISSION KEYS (so JSX can reference
 * them symbolically, e.g. PERMISSIONS.EXPORT_REPORTS) — it deliberately holds
 * NO role->grant table. Keys are snake_case to match the backend verbatim; there
 * is zero translation at the /api/me boundary.
 */

// ---- Permission keys (mirror of api/lib/permissions.js — MUST stay in sync) --
// snake_case, byte-identical to the backend so /api/me passes grants through raw.
export const PERMISSIONS = {
  // Shopify merchant storefront configuration
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

  // Finance
  VIEW_FINANCE: "view_finance",
  EDIT_FINANCE: "edit_finance",

  // Users / roles / platform
  VIEW_USERS: "view_users",
  MANAGE_USERS: "manage_users",
  VIEW_AUDIT: "view_audit",
  MANAGE_SETTINGS: "manage_settings",
};

// ---- Role keys (mirror of the appRole name enum — display labels too) --------
// The backend role NAMES are human-readable and double as UI labels, so there is
// no separate label table. Order is privilege-descending (for a switcher UI).
export const ROLE_ORDER = [
  "Super Admin",
  "Administrator",
  "Finance Manager",
  "Operations Manager",
  "Claims Manager",
  "Accountant",
  "Claims Agent",
  "Support Agent",
  "Read-Only Auditor",
];

// Least-privilege fallback is not one of the nine internal app roles.
export const DEFAULT_ROLE = "Unresolved";

/** Role key -> display label. Names ARE the labels; this is an identity helper. */
export function roleLabel(roleKey) {
  return roleKey || "Unknown";
}

/**
 * Does the delivered permission list grant `permission`?
 * `permissions` is the array from GET /api/me (NOT a role key). Pure membership.
 */
export function can(permissions, permission) {
  return Array.isArray(permissions) && permissions.includes(permission);
}
