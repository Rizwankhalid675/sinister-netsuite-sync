import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  INTERNAL_NAV_ITEMS,
  getVisibleNavigation,
  getPageTitle,
  isNavigationItemActive,
} from "../web/lib/navigation.js";
import {
  isEscapeKey,
  getFocusWrapTarget,
  isOutsideInteractiveSurface,
} from "../web/lib/shellInteractions.js";

const appSource = readFileSync(
  new URL("../web/components/App.jsx", import.meta.url),
  "utf8"
);
const shellSource = readFileSync(
  new URL("../web/components/InternalAppShell.jsx", import.meta.url),
  "utf8"
);
const dashboardSource = readFileSync(
  new URL("../web/routes/dashboard.jsx", import.meta.url),
  "utf8"
);
const clientsSource = readFileSync(
  new URL("../web/routes/clients.jsx", import.meta.url),
  "utf8"
);
const claimsSource = readFileSync(
  new URL("../web/routes/claims.jsx", import.meta.url),
  "utf8"
);
const usersSource = readFileSync(
  new URL("../web/routes/users.jsx", import.meta.url),
  "utf8"
);

test("canonical navigation defines all required internal routes once", () => {
  assert.deepEqual(
    INTERNAL_NAV_ITEMS.map(({ path }) => path),
    [
      "/dashboard",
      "/clients",
      "/orders",
      "/claims",
      "/errors",
      "/reports",
      "/finance",
      "/settings",
      "/users",
    ]
  );
  assert.equal(new Set(INTERNAL_NAV_ITEMS.map(({ path }) => path)).size, 9);
});

test("permission-aware navigation hides routes the principal cannot view", () => {
  const visible = getVisibleNavigation([
    "view_dashboard",
    "view_orders",
    "view_reports",
  ]);
  assert.deepEqual(
    visible.map(({ path }) => path),
    ["/dashboard", "/orders", "/reports"]
  );
});

test("page titles are route-aware and have a safe fallback", () => {
  assert.equal(getPageTitle("/"), "Dashboard");
  assert.equal(getPageTitle("/claims/123"), "Claims");
  assert.equal(getPageTitle("/settings"), "Settings");
  assert.equal(getPageTitle("/not-a-real-route"), "Enshield");
});

test("dashboard navigation treats both root and dashboard routes as active", () => {
  assert.equal(isNavigationItemActive("/", "/dashboard"), true);
  assert.equal(isNavigationItemActive("/dashboard", "/dashboard"), true);
  assert.equal(isNavigationItemActive("/dashboard/orders", "/dashboard"), true);
  assert.equal(isNavigationItemActive("/claims", "/dashboard"), false);
});

test("keyboard helpers recognize Escape and wrap focus at drawer boundaries", () => {
  const first = { id: "first" };
  const middle = { id: "middle" };
  const last = { id: "last" };
  const focusables = [first, middle, last];

  assert.equal(isEscapeKey({ key: "Escape" }), true);
  assert.equal(isEscapeKey({ key: "Enter" }), false);
  assert.equal(getFocusWrapTarget({ shiftKey: true }, first, focusables), last);
  assert.equal(getFocusWrapTarget({ shiftKey: false }, last, focusables), first);
  assert.equal(getFocusWrapTarget({ shiftKey: false }, middle, focusables), null);
});

test("outside-pointer helper excludes both panel and trigger descendants", () => {
  const panelChild = {};
  const triggerChild = {};
  const outside = {};
  const panel = { contains: (target) => target === panelChild };
  const trigger = { contains: (target) => target === triggerChild };

  assert.equal(isOutsideInteractiveSurface(panel, trigger, panelChild), false);
  assert.equal(isOutsideInteractiveSurface(panel, trigger, triggerChild), false);
  assert.equal(isOutsideInteractiveSurface(panel, trigger, outside), true);
});

test("authenticated root owns the only RoleProvider and the reusable shell", () => {
  assert.equal((appSource.match(/<RoleProvider>/g) || []).length, 1);
  assert.match(appSource, /<InternalAppShell\s*\/>/);
  assert.match(appSource, /path="orders"/);
  assert.match(appSource, /path="errors"/);
  assert.match(appSource, /path="reports"/);
  assert.match(appSource, /path="settings"/);
});

test("individual pages do not create duplicate role providers or navigation", () => {
  for (const source of [dashboardSource, clientsSource, claimsSource, usersSource]) {
    assert.doesNotMatch(source, /<RoleProvider>/);
    assert.doesNotMatch(source, /className="esd-sidebar"/);
  }
});

test("shell uses semantic, accessible navigation and mobile controls", () => {
  assert.match(shellSource, /<nav[^>]*aria-label="Primary"/);
  assert.match(shellSource, /aria-current=/);
  assert.match(shellSource, /aria-label="Open navigation"/);
  assert.match(shellSource, /aria-label="Notifications"/);
  assert.match(shellSource, /aria-label="Close navigation"/);
  assert.match(shellSource, /<main[^>]*id="main-content"/);
  assert.match(shellSource, /className="esd-skip-link"/);
  assert.match(shellSource, /role=\{navigationOpen \? "dialog"/);
  assert.match(shellSource, /aria-modal=\{navigationOpen \? "true"/);
  assert.match(shellSource, /inert=/);
  assert.match(shellSource, /role="status"/);
  assert.match(shellSource, /aria-live="polite"/);
  assert.match(shellSource, /getFocusWrapTarget/);
  assert.match(shellSource, /document\.addEventListener\("pointerdown"/);
});

test("operational routes use dedicated permission-gated pages", () => {
  assert.match(appSource, /path="orders"\s+element=\{<OrdersPage/);
  assert.match(appSource, /path="errors"\s+element=\{<ErrorsPage/);
  assert.match(appSource, /path="reports"\s+element=\{<ReportsPage/);
  assert.doesNotMatch(appSource, /ShellPlaceholderPage/);
});

test("tables are horizontally contained at narrow widths", () => {
  const css = readFileSync(
    new URL("../web/routes/dashboard.css", import.meta.url),
    "utf8"
  );
  const shellCss = readFileSync(
    new URL("../web/components/App.css", import.meta.url),
    "utf8"
  );
  assert.match(css, /\.esd-table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.esd-table\s*\{[^}]*min-width:/s);
  assert.match(shellCss, /\.esd-sidebar\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(shellCss, /\.esd-sidebar--open\s*\{[^}]*visibility:\s*visible/s);
});
