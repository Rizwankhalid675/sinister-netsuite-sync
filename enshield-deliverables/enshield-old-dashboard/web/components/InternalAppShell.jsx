import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import { useRole } from "../lib/useRole";
import { logoutInternalSession } from "../lib/internalAuthClient";
import { ChangePasswordPage } from "../routes/changePassword";
import {
  getPageTitle,
  getVisibleNavigation,
  isNavigationItemActive,
} from "../lib/navigation";
import {
  getFocusWrapTarget,
  isEscapeKey,
  isOutsideInteractiveSurface,
} from "../lib/shellInteractions";
import "./App.css";

const NAV_ICON_PATHS = {
  DB: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  CL: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75",
  OR: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4",
  CM: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  ER: "M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  RP: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  FI: "M3 6h18v14H3zM3 10h18M16 15h2",
  AL: "M12 8v4l3 2M3.05 11a9 9 0 1 0 .5-3M3 3v5h5",
  ST: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20h-3v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.08 15a1.7 1.7 0 0 0-1.55-1H5v-3h.53a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06L8.8 5.94l.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1-1.55V4h3v.79a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.55 1H21v3h-.05a1.7 1.7 0 0 0-1.55 1z",
  US: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
};

const PAGE_DESCRIPTIONS = {
  Clients: "Manage connected stores, operational status, claims activity, and value in transit.",
  Orders: "Monitor protected orders and fulfillment activity across every connected store.",
  Claims: "Review, resolve, and audit protection claims from submission through closure.",
  Errors: "Investigate integration failures and safely replay recoverable deliveries.",
  Reports: "Analyze portfolio performance with consistent, exportable operational totals.",
  Finance: "Review shadow-ledger activity, approvals, reserves, and reconciliation evidence.",
  "Audit Log": "Trace security-sensitive actions and operational changes across the workspace.",
  Settings: "Configure protection behavior and storefront controls for assigned clients.",
  Users: "Manage access, roles, client assignments, and account lifecycle controls.",
};

function NavigationIcon({ code }) {
  return <svg className="esd-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={NAV_ICON_PATHS[code]} /></svg>;
}

export function InternalAppShell() {
  const location = useLocation();
  const { permissions, roleLabel, user, clients, selectedShopId, setSelectedShopId, loading, mustChangePassword } = useRole();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem("enshield.sidebar.collapsed") === "true"; } catch { return false; }
  });
  const [logoutMessage, setLogoutMessage] = useState("");
  const menuTriggerRef = useRef(null);
  const drawerRef = useRef(null);
  const notificationTriggerRef = useRef(null);
  const notificationPanelRef = useRef(null);
  const visibleNavigation = getVisibleNavigation(permissions);
  const title = getPageTitle(location.pathname);
  const accountName = user?.name || user?.email || roleLabel || "Account";
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    try { window.localStorage.setItem("enshield.sidebar.collapsed", String(sidebarCollapsed)); } catch { /* storage is optional */ }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (navigationOpen) {
      setNavigationOpen(false);
      menuTriggerRef.current?.focus();
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!navigationOpen) return undefined;
    const drawer = drawerRef.current;
    const focusables = Array.from(
      drawer?.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    );
    focusables[0]?.focus();

    const onKeyDown = (event) => {
      if (isEscapeKey(event)) {
        event.preventDefault();
        setNavigationOpen(false);
        menuTriggerRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        const target = getFocusWrapTarget(event, document.activeElement, focusables);
        if (target) {
          event.preventDefault();
          target.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigationOpen]);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    notificationPanelRef.current?.focus();
    const closeNotifications = () => {
      setNotificationsOpen(false);
      notificationTriggerRef.current?.focus();
    };
    const onKeyDown = (event) => {
      if (isEscapeKey(event)) closeNotifications();
    };
    const onPointerDown = (event) => {
      if (isOutsideInteractiveSurface(
        notificationPanelRef.current,
        notificationTriggerRef.current,
        event.target
      )) {
        closeNotifications();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [notificationsOpen]);

  if (loading) {
    return (
      <div className="esd-root esd-shell-loading" role="status" aria-live="polite">
        <span className="esd-loading-spinner" aria-hidden="true" />
        Loading your Enshield workspace…
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div className="esd-root">
        <ChangePasswordPage forced />
      </div>
    );
  }

  return (
    <div className={`esd-root ${sidebarCollapsed ? "esd-root--nav-collapsed" : ""}`}>
      <a className="esd-skip-link" href="#main-content">Skip to content</a>
      <button
        ref={menuTriggerRef}
        className="esd-mobile-menu"
        type="button"
        aria-label="Open navigation"
        aria-expanded={navigationOpen}
        onClick={() => setNavigationOpen(true)}
      >
        <span aria-hidden="true">☰</span>
      </button>

      {navigationOpen && (
        <button
          className="esd-nav-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => {
            setNavigationOpen(false);
            menuTriggerRef.current?.focus();
          }}
        />
      )}

      <aside
        ref={drawerRef}
        className={`esd-sidebar ${sidebarCollapsed ? "esd-sidebar--collapsed" : ""} ${navigationOpen ? "esd-sidebar--open" : ""}`}
        role={navigationOpen ? "dialog" : undefined}
        aria-modal={navigationOpen ? "true" : undefined}
        aria-label={navigationOpen ? "Navigation menu" : "Primary navigation"}
      >
        <button
          className="esd-drawer-close"
          type="button"
          aria-label="Close navigation"
          onClick={() => {
            setNavigationOpen(false);
            menuTriggerRef.current?.focus();
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="esd-logo" aria-label="Enshield" role="img">
          <span aria-hidden="true">E</span>
        </div>
        <button
          className="esd-sidebar-toggle"
          type="button"
          aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          <span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
        </button>
        <nav className="esd-nav-list" aria-label="Primary">
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`esd-navitem ${
                isNavigationItemActive(location.pathname, item.path)
                  ? "esd-navitem--active"
                  : ""
              }`}
              aria-current={isNavigationItemActive(location.pathname, item.path) ? "page" : undefined}
              title={item.label}
            >
              <NavigationIcon code={item.short} />
              <span className="esd-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div
        className="esd-shell-body"
        inert={navigationOpen ? true : undefined}
        aria-hidden={navigationOpen ? "true" : undefined}
      >
        <header className="esd-shell-header">
          <div className="esd-page-heading">
            <h1 className="esd-title">{title}</h1>
            {PAGE_DESCRIPTIONS[title] ? <p>{PAGE_DESCRIPTIONS[title]}</p> : null}
          </div>
          <div className="esd-shell-actions">
            {clients.length > 1 ? (
              <label className="esd-client-picker">
                <span className="esd-visually-hidden">Client context</span>
                <select value={selectedShopId} onChange={(event) => setSelectedShopId(event.target.value)}>
                  <option value="all">All assigned clients</option>
                  {clients.map((client) => <option key={client.shopId} value={client.shopId}>{client.name}</option>)}
                </select>
              </label>
            ) : null}
            <button
              ref={notificationTriggerRef}
              type="button"
              className="esd-icon-button"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <span aria-hidden="true">○</span>
            </button>
            <span className="esd-account">{accountName}</span>
            <button
              type="button"
              className="esd-link-button"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                setLogoutMessage("");
                let serverFailed = false;
                await logoutInternalSession({
                  onFailure: () => {
                    serverFailed = true;
                    setLogoutMessage(
                      "The server could not confirm sign-out. This dashboard is no longer usable; returning to sign in."
                    );
                  },
                  navigate: () => {
                    window.setTimeout(
                      () => window.location.assign("/internal-login"),
                      serverFailed ? 1200 : 0
                    );
                  },
                });
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
          {logoutMessage ? (
            <p className="esd-error" role="alert" aria-live="assertive">
              {logoutMessage}
            </p>
          ) : null}
          {notificationsOpen && (
            <section
              ref={notificationPanelRef}
              className="esd-notifications"
              aria-label="Notifications panel"
              tabIndex="-1"
            >
              <p>There are no new notifications.</p>
              <button
                type="button"
                className="esd-btn"
                onClick={() => {
                  setNotificationsOpen(false);
                  notificationTriggerRef.current?.focus();
                }}
              >
                Close
              </button>
            </section>
          )}
        </header>

        <motion.main
          className="esd-main"
          id="main-content"
          tabIndex="-1"
          key={location.pathname}
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18, ease: "easeOut" }}
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}
