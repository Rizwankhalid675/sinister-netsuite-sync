import { PERMISSIONS } from "./rbac.js";

export const INTERNAL_NAV_ITEMS = Object.freeze([
  { path: "/dashboard", label: "Dashboard", short: "DB", permission: PERMISSIONS.VIEW_DASHBOARD },
  { path: "/clients", label: "Clients", short: "CL", permission: PERMISSIONS.VIEW_CLIENTS },
  { path: "/orders", label: "Orders", short: "OR", permission: PERMISSIONS.VIEW_ORDERS },
  { path: "/claims", label: "Claims", short: "CM", permission: PERMISSIONS.VIEW_CLAIMS },
  { path: "/errors", label: "Errors", short: "ER", permission: PERMISSIONS.VIEW_AUDIT },
  { path: "/reports", label: "Reports", short: "RP", permission: PERMISSIONS.VIEW_REPORTS },
  { path: "/finance", label: "Finance", short: "FI", permission: PERMISSIONS.VIEW_FINANCE },
  { path: "/audit-log", label: "Audit Log", short: "AL", permission: PERMISSIONS.VIEW_AUDIT },
  { path: "/settings", label: "Settings", short: "ST", permission: PERMISSIONS.MANAGE_SETTINGS },
  { path: "/users", label: "Users", short: "US", permission: PERMISSIONS.VIEW_USERS },
]);

export function getVisibleNavigation(permissions) {
  const grants = new Set(Array.isArray(permissions) ? permissions : []);
  return INTERNAL_NAV_ITEMS.filter(({ permission }) => grants.has(permission));
}

export function getPageTitle(pathname) {
  if (pathname === "/") return "Dashboard";
  const item = INTERNAL_NAV_ITEMS.find(
    ({ path }) => pathname === path || pathname.startsWith(`${path}/`)
  );
  return item?.label ?? "Enshield";
}

export function isNavigationItemActive(pathname, itemPath) {
  if (itemPath === "/dashboard" && pathname === "/") return true;
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
