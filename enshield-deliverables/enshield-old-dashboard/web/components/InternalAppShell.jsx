import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useRole } from "../lib/useRole";
import { logoutInternalSession } from "../lib/internalAuthClient";
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

export function InternalAppShell() {
  const location = useLocation();
  const { permissions, roleLabel, user, clients, selectedShopId, setSelectedShopId, loading } = useRole();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState("");
  const menuTriggerRef = useRef(null);
  const drawerRef = useRef(null);
  const notificationTriggerRef = useRef(null);
  const notificationPanelRef = useRef(null);
  const visibleNavigation = getVisibleNavigation(permissions);
  const title = getPageTitle(location.pathname);
  const accountName = user?.name || user?.email || roleLabel || "Account";

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

  return (
    <div className="esd-root">
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
        className={`esd-sidebar ${navigationOpen ? "esd-sidebar--open" : ""}`}
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
              <span className="esd-nav-short" aria-hidden="true">{item.short}</span>
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
          <h1 className="esd-title">{title}</h1>
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

        <main className="esd-main" id="main-content" tabIndex="-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
