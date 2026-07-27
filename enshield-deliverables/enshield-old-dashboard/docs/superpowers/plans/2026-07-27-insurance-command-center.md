# Insurance Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a modern, minimal, responsive Enshield insurance CRM/ERP dashboard using the existing Gadget APIs, RBAC, and Framer Motion.

**Architecture:** Keep the authenticated shell and dashboard endpoint boundaries intact. Correct the percentage display contract, split the dashboard route into focused presentation components inside the existing module, and restyle the shell/dashboard with responsive CSS. Validate with source-contract tests, React tests, Playwright desktop/mobile tests, and an authenticated live development smoke test.

**Tech Stack:** React 19, React Router 7, Framer Motion 11, Gadget routes, CSS, Node test runner, Vitest, Playwright, axe-core.

## Global Constraints

- Do not deploy or mutate production.
- Preserve existing Shopify/Gadget APIs, authentication, tenancy, and role permissions.
- Do not fabricate Miva totals; show Miva as unavailable until authenticated read access exists.
- Use Framer Motion only for functional 150–350 ms transitions and honor `prefers-reduced-motion`.
- Maintain WCAG AA contrast, keyboard access, and responsive desktop/mobile layouts.
- Add no new runtime dependency.

---

### Task 1: Correct percentage presentation

**Files:**
- Modify: `web/routes/dashboard.jsx`
- Modify: `tests/dashboard-auth-regression.test.mjs`
- Test: `tests/phase1-core.test.mjs`

**Interfaces:**
- Consumes: `insuranceMetrics.attachRate` and `refundsReturns.refundRate` as numbers in the backend's 0–100 convention.
- Produces: `fmtPercentValue(value): string`, displaying `100` as `100.0%` without multiplying again.

- [ ] **Step 1: Write the failing source-contract test**

```js
assert.match(dashboardSource, /function fmtPercentValue\(v\)/);
assert.doesNotMatch(dashboardSource, /return `\$\{\(v \* 100\)/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dashboard-auth-regression.test.mjs`
Expected: FAIL because the existing `fmtPct` multiplies API percentages by 100.

- [ ] **Step 3: Implement the explicit formatter**

```jsx
function fmtPercentValue(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Number(v).toFixed(1)}%`;
}
```

Replace attach/refund uses of `fmtPct` with `fmtPercentValue`. Keep delta formatting unchanged because deltas remain ratios.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/dashboard-auth-regression.test.mjs tests/phase1-core.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/routes/dashboard.jsx tests/dashboard-auth-regression.test.mjs tests/phase1-core.test.mjs
git commit -m "fix: display dashboard percentages with correct units"
```

### Task 2: Build the balanced command-center dashboard

**Files:**
- Modify: `web/routes/dashboard.jsx`
- Modify: `web/routes/dashboard.css`
- Modify: `tests/dashboard-auth-regression.test.mjs`

**Interfaces:**
- Consumes: the existing `/api/dashboard-metrics` response, `selectedShopId`, `PERMISSIONS.EXPORT_REPORTS`, and current formatters.
- Produces: `SourceStatus`, `MetricTile`, `ActivityChart`, `HealthPanel`, and `RecentOrders` presentation components rendered by `DashboardTab`.

- [ ] **Step 1: Add failing structural assertions**

```js
for (const component of ["SourceStatus", "MetricTile", "ActivityChart", "HealthPanel", "RecentOrders"]) {
  assert.match(dashboardSource, new RegExp(`function ${component}\\(`));
}
assert.match(dashboardSource, /aria-label="Dashboard metrics"/);
assert.match(dashboardSource, /No records fall in this period/);
```

- [ ] **Step 2: Run the structural test red**

Run: `node --test tests/dashboard-auth-regression.test.mjs`
Expected: FAIL on missing component boundaries and empty-range copy.

- [ ] **Step 3: Extract presentation components and rebuild hierarchy**

Implement these stable props:

```jsx
function SourceStatus({ dataSources }) {}
function MetricTile({ label, value, helper, tone = "default", loading = false }) {}
function ActivityChart({ activity, year, currency, onPreviousYear, onNextYear }) {}
function HealthPanel({ title, summary, rows }) {}
function RecentOrders({ orders, currency, canExport }) {}
```

Render the page in this order: command header, compact source status, primary summary, supporting KPI grid, activity/claims workspace, health panels, recent orders. When the selected range contains no orders, render `No records fall in this period. Choose All time to view the full history.` without hiding the range controls.

- [ ] **Step 4: Implement the visual system**

In `dashboard.css`, add/adjust command-center tokens and classes:

```css
.esd-root { --esd-navy: #101d2f; --esd-teal: #087f88; --esd-surface: #ffffff; --esd-workspace: #eef2f5; }
.esd-command-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(280px, .75fr); gap: 16px; }
.esd-kpi-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 640px) { .esd-kpi-strip { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; } }
```

Use one-pixel borders, subtle elevation, compact status chips, tabular numerals, and no decorative gradients outside the primary summary surface.

- [ ] **Step 5: Run focused tests and build**

Run: `node --test tests/dashboard-auth-regression.test.mjs && yarn build`
Expected: PASS, with only the existing chunk-size warning.

- [ ] **Step 6: Commit**

```bash
git add web/routes/dashboard.jsx web/routes/dashboard.css tests/dashboard-auth-regression.test.mjs
git commit -m "feat: redesign dashboard as insurance command center"
```

### Task 3: Polish shell navigation and responsive behavior

**Files:**
- Modify: `web/components/InternalAppShell.jsx`
- Modify: `web/routes/dashboard.css`
- Modify: `tests/frontend/shell-interactions.test.jsx`
- Modify: `tests/e2e/internal-dashboard.spec.js`

**Interfaces:**
- Consumes: existing navigation entries, route permissions, account identity, client selector, and notification drawer behavior.
- Produces: icon-plus-label desktop navigation, icon tooltips while collapsed, and the existing accessible mobile drawer.

- [ ] **Step 1: Add failing shell behavior tests**

Assert that navigation links expose full accessible names (`Dashboard`, `Clients`, `Orders`, `Claims`, `Errors`, `Reports`, `Finance`, `Audit Log`, `Settings`, `Users`) and that the desktop rail has a toggle with `aria-expanded`.

- [ ] **Step 2: Run the shell tests red**

Run: `yarn vitest run tests/frontend/shell-interactions.test.jsx`
Expected: FAIL on the missing desktop rail toggle or labels.

- [ ] **Step 3: Implement the shell polish**

Add a local semantic icon map using inline SVG components—no dependency. Each link renders icon plus label; collapsed mode retains `aria-label` and a CSS tooltip. Preserve permission filtering and mobile drawer focus management. Store the desktop collapsed preference in `localStorage` under `enshield.sidebar.collapsed`.

- [ ] **Step 4: Add responsive dashboard assertions**

Update Playwright expectations to verify the KPI strip does not widen the document, the mobile menu opens/closes, the order list is readable at 390×844, and All time changes `aria-pressed` and reveals real metric content.

- [ ] **Step 5: Run component and browser tests**

Run: `yarn vitest run tests/frontend/shell-interactions.test.jsx && yarn test:e2e`
Expected: PASS on desktop and mobile Chromium with zero axe violations.

- [ ] **Step 6: Commit**

```bash
git add web/components/InternalAppShell.jsx web/routes/dashboard.css tests/frontend/shell-interactions.test.jsx tests/e2e/internal-dashboard.spec.js
git commit -m "feat: polish responsive CRM navigation shell"
```

### Task 4: Development deployment and visual QA

**Files:**
- Modify only if a verified defect is found: files from Tasks 1–3
- Test: `tests/e2e/internal-dashboard.spec.js`

**Interfaces:**
- Consumes: Gadget development URL and existing development credentials.
- Produces: synchronized Gadget development files and desktop/mobile screenshot evidence outside the repository.

- [ ] **Step 1: Run the complete automated suite**

Run: `yarn test && yarn test:e2e && yarn build`
Expected: 247 Node tests, 26+ Vitest tests, all Playwright projects, and Vite build pass.

- [ ] **Step 2: Push only to Gadget development**

Run: `ggt status && ggt push && ggt status`
Expected: local and development environment files match; production is not selected or deployed.

- [ ] **Step 3: Run authenticated live Chrome QA**

At 1440×1000 and 390×844: sign in, open `/dashboard`, select All time, verify page identity, meaningful DOM, no framework overlay, no relevant console error, correct `100.0%` attach rate, consistent `$12,968.63` values, source status, viewport containment, and responsive recent orders.

- [ ] **Step 4: Capture screenshot evidence outside the repository**

Save to the operating-system temporary directory as `enshield-command-center-desktop.png` and `enshield-command-center-mobile.png`.

- [ ] **Step 5: Final status report**

Report automated results, live values, screenshots, known Miva limitation, and any non-blocking build warnings. Do not deploy production.
