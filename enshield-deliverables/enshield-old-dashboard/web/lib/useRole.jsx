import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { can as rbacCan, roleLabel, DEFAULT_ROLE, PERMISSIONS } from "./rbac";

/**
 * Role context — exposes the CURRENT user's role + a `can(permission)` helper
 * to the component tree.
 *
 * Where do capabilities come from?
 * --------------------------------
 * On mount the provider fetches GET /api/me. The current Shopify session has a
 * shop ID but no person identifier, so the backend deliberately returns only a
 * least-privilege Shop Merchant principal and its two storefront-configuration
 * capabilities. It does not select or bypass an appUser/appRole assignment.
 * All nine internal roles fail closed until a future identity provider adds a
 * stable person key. We hold the delivered { roleKey, permissions } and answer
 * `can(p)` by pure membership in the delivered array — NO frontend grant table.
 *
 * Until /api/me returns we fail SAFE (no permissions). This never affects data
 * tenancy: permitted reads are still scoped to $session.shopId.
 *
 * `setOverride` remains inert for shop-only sessions because they never receive
 * MANAGE_USERS. A future person-authenticated internal administrator may use
 * the backend-gated preview path without moving a grant table into the browser.
 */
const RoleContext = createContext(null);

// Fail-safe identity used before /api/me resolves and on any fetch error.
const SAFE_IDENTITY = {
  roleKey: DEFAULT_ROLE,
  permissions: [],
  user: null,
  clients: [],
  mustChangePassword: false,
};

export function RoleProvider({ children }) {
  const [identity, setIdentity] = useState(SAFE_IDENTITY);
  const [loading, setLoading] = useState(true);
  // Optional local role override for admin testing (see header). null = off.
  const [override, setOverride] = useState(null);
  const [selectedShopId, setSelectedShopId] = useState("all");

  const fetchIdentity = async ({ isMounted } = {}) => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      const data = await res.json();
      if (isMounted && !isMounted()) return;
      if (res.ok && Array.isArray(data.permissions)) {
        setIdentity({
          roleKey: data.roleKey ?? DEFAULT_ROLE,
          permissions: data.permissions,
          user: data.user ?? null,
          clients: Array.isArray(data.clients) ? data.clients : [],
          mustChangePassword: Boolean(data.mustChangePassword),
        });
      } else {
        setIdentity(SAFE_IDENTITY); // fail closed
      }
    } catch {
      if (!isMounted || isMounted()) setIdentity(SAFE_IDENTITY); // fail closed
    } finally {
      if (!isMounted || isMounted()) setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    fetchIdentity({ isMounted: () => alive });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(() => {
    // When an admin override is active, gate on the override's role grants
    // instead of the real identity — a local, non-persistent preview only.
    const baseEffective =
      override && Array.isArray(override.permissions) ? override : identity;
    const selectedClient = selectedShopId === "all"
      ? null
      : identity.clients.find((client) => String(client.shopId) === selectedShopId);
    const effective = selectedClient && Array.isArray(selectedClient.permissions)
      ? { roleKey: selectedClient.roleKey, permissions: selectedClient.permissions }
      : baseEffective;
    return {
      roleKey: effective.roleKey,
      roleLabel: roleLabel(effective.roleKey),
      permissions: effective.permissions,
      user: identity.user,
      clients: identity.clients,
      mustChangePassword: identity.mustChangePassword,
      selectedShopId,
      setSelectedShopId: (shopId) => {
        if (shopId === "all" || identity.clients.some((client) => String(client.shopId) === String(shopId))) {
          setSelectedShopId(String(shopId));
        }
      },
      loading,
      // Admin testing override. Pass a { roleKey, permissions } shape or null
      // to clear. Only meaningful if the real user can MANAGE_USERS.
      setOverride,
      isOverriding: Boolean(override),
      can: (permission) => rbacCan(effective.permissions, permission),
      refreshIdentity: () => fetchIdentity(),
    };
  }, [identity, override, loading, selectedShopId]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    // Fail safe (least privilege) rather than throwing and blanking the app.
    return {
      roleKey: DEFAULT_ROLE,
      roleLabel: roleLabel(DEFAULT_ROLE),
      permissions: [],
      user: null,
      clients: [],
      mustChangePassword: false,
      selectedShopId: "all",
      setSelectedShopId: () => {},
      loading: false,
      setOverride: () => {},
      isOverriding: false,
      can: () => false,
      refreshIdentity: () => {},
    };
  }
  return ctx;
}

/** Convenience gate component: renders children only if permission is granted. */
export function Gate({ permission, fallback = null, children }) {
  const { can } = useRole();
  return can(permission) ? children : fallback;
}

export { PERMISSIONS };
