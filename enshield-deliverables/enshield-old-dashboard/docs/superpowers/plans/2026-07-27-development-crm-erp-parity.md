# Development CRM/ERP Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gadget development a review-ready insurance operations CRM/ERP whose imported Laravel, native Shopify, reporting, claims, and shadow-finance behavior is accurate, secure, and visually consistent.

**Architecture:** Preserve source-specific records but project them through shared source-neutral read contracts. Laravel-compatible Miva ingestion writes only to development legacy models using hashed per-client credentials and stable source keys. Server-side RBAC and tenancy remain authoritative; the React UI consumes bounded APIs and applies one restrained motion/design system.

**Tech Stack:** Gadget v1.5, JavaScript/TypeScript Gadget schemas, React 19, React Router 7, Framer Motion 11, Node test runner, Vitest, Playwright.

## Global Constraints

- Do not write to Laravel production, Gadget production, or production Shopify/Miva stores.
- Finance remains shadow mode and never initiates payments or posts externally.
- Do not persist or log customer PII, API secrets, banking data, or arbitrary inbound payloads.
- Every read and mutation must authenticate, authorize a named permission, and enforce assigned-client tenancy.
- Pagination and aggregation must be bounded and disclose truncation.
- Motion must honor `prefers-reduced-motion` and may not use continuous decorative animation.

---

### Task 1: Laravel shipment parity and source-neutral projections

**Files:**
- Modify: `api/models/legacyOrder/schema.gadget.ts`
- Modify: `scripts/lib/normalizeNovaExport.js`
- Modify: `api/lib/legacyImport.js`
- Modify: `api/lib/unifiedOrders.js`
- Modify: `scripts/import-nova-production-to-development.js`
- Test: `tests/legacy-import.test.mjs`

**Interfaces:**
- Produces: `projectLegacyOrder(order)` with accurate `fulfillmentStatus`, cancellation, tracking, and source fields.
- Adds legacy fields: `isShipped:boolean`, `trackingNumber:string`.

- [ ] **Step 1: Write failing normalization/projection tests**

```js
assert.equal(normalizeOrder(novaShippedOrder).isShipped, true);
assert.equal(projectLegacyOrder({ isShipped: true, status: "shipped" }).fulfillmentStatus, "fulfilled");
assert.equal(projectLegacyOrder({ isShipped: false, status: "placed" }).fulfillmentStatus, "unfulfilled");
```

- [ ] **Step 2: Run the focused test and confirm it fails for missing fields**

Run: `node --test tests/legacy-import.test.mjs`

- [ ] **Step 3: Add schema fields and carry them through normalization, upsert, and projection**

```js
const fulfilled = order?.isShipped === true || ["shipped", "fulfilled", "delivered", "complete"].includes(status);
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `node --test tests/legacy-import.test.mjs`

### Task 2: Derived client rollups and unified claims

**Files:**
- Create: `api/lib/legacyRollups.js`
- Create: `api/lib/unifiedClaims.js`
- Modify: `api/routes/api/GET-clients.js`
- Modify: `api/routes/api/GET-claims.js`
- Modify: `api/routes/api/GET-dashboard-metrics.js`
- Modify: `web/routes/claims.jsx`
- Test: `tests/legacy-parity.test.mjs`
- Test: `tests/frontend/operational-page.test.jsx`

**Interfaces:**
- Produces: `deriveLegacyClientRollups(clients, orders, claims)` returning `{ valueInTransitMinor, valueInTransitCurrency, claimCount }` by client ID.
- Produces: `projectLegacyClaim(record)` returning the existing Claims row contract plus `source:"legacy"` and `readOnly:true`.

- [ ] **Step 1: Write failing tests for Laravel-equivalent rollups and closed legacy claim visibility**

```js
assert.deepEqual(deriveLegacyClientRollups([client], [placed, shipped], [open, closed]).get("c1"), {
  valueInTransitMinor: placed.valueMinor,
  valueInTransitCurrency: "USD",
  claimCount: 1,
});
assert.equal(projectLegacyClaim(closed).status, "Closed");
```

- [ ] **Step 2: Run tests and confirm missing exports fail**

Run: `node --test tests/legacy-parity.test.mjs`

- [ ] **Step 3: Implement bounded rollup loading and merge native/legacy claim pagination**

```js
const open = !["closed", "paid", "denied", "cancelled"].includes(normalizedStatus);
```

- [ ] **Step 4: Render legacy claims with a read-only source badge and no mutation actions**

- [ ] **Step 5: Run backend and frontend focused tests**

Run: `node --test tests/legacy-parity.test.mjs && yarn test:ui --run tests/frontend/operational-page.test.jsx`

### Task 3: Shared reporting contract

**Files:**
- Create: `api/lib/operationalReport.js`
- Modify: `api/routes/api/GET-dashboard-metrics.js`
- Modify: `web/routes/reports.jsx`
- Modify: `web/routes/dashboard.jsx`
- Test: `tests/operational-report.test.mjs`
- Test: `tests/dashboard-auth-regression.test.mjs`

**Interfaces:**
- Produces: `buildOperationalReport(orders, claims, { range, year, now })` with summary, monthly rows, source/client splits, fulfillment, protection, refunds, and claims.

- [ ] **Step 1: Write a failing reconciliation test proving dashboard/report totals use identical inputs**

```js
assert.deepEqual(report.summary, dashboardFromSameFixture.summary);
```

- [ ] **Step 2: Run and observe the missing shared report failure**

Run: `node --test tests/operational-report.test.mjs`

- [ ] **Step 3: Extract the pure report builder and have dashboard/report consumers use it**

- [ ] **Step 4: Format report currency, totals, source/client filters, freshness, and CSV output**

- [ ] **Step 5: Run focused report and dashboard tests**

Run: `node --test tests/operational-report.test.mjs tests/dashboard-auth-regression.test.mjs`

### Task 4: Development-only Miva-compatible ingestion

**Files:**
- Create: `api/models/clientApiCredential/schema.gadget.ts`
- Create: `api/lib/mivaIngestion.js`
- Create: `api/routes/api/POST-miva-orders-[orderId].js`
- Create: `api/routes/api/POST-miva-orders-[orderId]-shipped.js`
- Create: `api/routes/api/POST-miva-orders-[orderId]-tracking.js`
- Create: `api/routes/api/DELETE-miva-orders-[orderId].js`
- Test: `tests/miva-ingestion.test.mjs`

**Interfaces:**
- Consumes: `X-API-KEY`, Laravel-compatible order body, path `orderId`.
- Produces: `authenticateMivaClient(api, headerKey)` and idempotent create/ship/track/cancel results.

- [ ] **Step 1: Write failing tests for missing/invalid keys, duplicate orders, valid create, shipping, tracking, and cancellation**

```js
assert.equal(await authenticateMivaClient(api, "wrong"), null);
assert.equal(result.sourceKey, `miva:${client.id}:${orderId}`);
```

- [ ] **Step 2: Run and confirm missing ingestion modules fail**

Run: `node --test tests/miva-ingestion.test.mjs`

- [ ] **Step 3: Implement SHA-256 credential fingerprints, constant-time comparison, allowlisted payload normalization, and stable source keys**

- [ ] **Step 4: Implement bounded route handlers disabled when `NODE_ENV === "production"`**

- [ ] **Step 5: Run focused ingestion/security tests**

Run: `node --test tests/miva-ingestion.test.mjs tests/phase1-security.test.mjs`

### Task 5: CRM/ERP visual system and task-oriented pages

**Files:**
- Create: `web/components/MotionPrimitives.jsx`
- Create: `web/components/WorkspacePage.jsx`
- Modify: `web/components/App.css`
- Modify: `web/components/InternalAppShell.jsx`
- Modify: `web/routes/dashboard.css`
- Modify: `web/routes/dashboard.jsx`
- Modify: `web/routes/clients.jsx`
- Modify: `web/routes/orders.jsx`
- Modify: `web/routes/claims.jsx`
- Modify: `web/routes/errors.jsx`
- Modify: `web/routes/reports.jsx`
- Modify: `web/routes/finance.jsx`
- Modify: `web/routes/auditLog.jsx`
- Modify: `web/routes/internalSettings.jsx`
- Modify: `web/routes/users.jsx`
- Test: `tests/frontend/shell-interactions.test.jsx`
- Test: `tests/frontend/finance-page.test.jsx`
- Test: `tests/frontend/operational-page.test.jsx`

**Interfaces:**
- Produces: `WorkspacePage`, `MotionPage`, `MotionCard`, and consistent header/toolbar/content slots.

- [ ] **Step 1: Write failing component tests for reduced motion, page landmarks, assigned-client Finance selector, and actionable empty states**

```jsx
expect(screen.getByRole("main")).toHaveAttribute("aria-labelledby");
expect(screen.getByLabelText(/client/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run targeted UI tests and confirm the desired landmarks/selectors are absent**

Run: `yarn test:ui --run tests/frontend/shell-interactions.test.jsx tests/frontend/finance-page.test.jsx tests/frontend/operational-page.test.jsx`

- [ ] **Step 3: Implement shared page primitives and restrained Framer Motion variants with reduced-motion handling**

```js
const transition = prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" };
```

- [ ] **Step 4: Convert Finance from raw entity-ID entry to assigned-client/entity selection and guided modules**

- [ ] **Step 5: Apply consistent hierarchy, filters, cards, tables, source badges, loading, empty, and error states across all pages**

- [ ] **Step 6: Run targeted UI tests**

Run: `yarn test:ui --run tests/frontend/shell-interactions.test.jsx tests/frontend/finance-page.test.jsx tests/frontend/operational-page.test.jsx`

### Task 6: RBAC and server-route permission audit

**Files:**
- Modify: `api/lib/permissions.js`
- Modify: `web/lib/rbac.js`
- Modify: `web/lib/navigation.js`
- Modify: affected `api/routes/api/*`
- Test: `tests/phase2-authorization.test.mjs`
- Test: `tests/phase3-internal-access.test.mjs`
- Test: `tests/frontend/role-provider.test.jsx`

**Interfaces:**
- Produces matching backend/frontend permission identifiers and server-side route coverage for every navigation destination and mutation.

- [ ] **Step 1: Write failing role-matrix tests for Super Admin, Administrator, Claims, Finance, Operations, Auditor, and Merchant roles**

- [ ] **Step 2: Run authorization tests and record exact mismatches**

Run: `node --test tests/phase2-authorization.test.mjs tests/phase3-internal-access.test.mjs`

- [ ] **Step 3: Make the backend permission map authoritative and align frontend labels/navigation without adding frontend grants**

- [ ] **Step 4: Verify every mutation and sensitive read calls the correct server authorization helper before data access**

- [ ] **Step 5: Run authorization and role-provider tests**

Run: `node --test tests/phase2-authorization.test.mjs tests/phase3-internal-access.test.mjs && yarn test:ui --run tests/frontend/role-provider.test.jsx`

### Task 7: Data reconciliation and development refresh

**Files:**
- Modify: `scripts/import-nova-production-to-development.js`
- Create: `scripts/reconcile-development-parity.js`
- Test: `tests/legacy-import.test.mjs`
- Test: `tests/legacy-parity.test.mjs`

**Interfaces:**
- Produces a metadata-only reconciliation summary with counts and money totals by source/client/status; never writes or logs PII.

- [ ] **Step 1: Write a failing reconciliation-output test**

- [ ] **Step 2: Run it and confirm missing reconciliation behavior**

Run: `node --test tests/legacy-import.test.mjs tests/legacy-parity.test.mjs`

- [ ] **Step 3: Implement idempotent refresh and reconciliation using bounded pages and explicit mismatch exit status**

- [ ] **Step 4: Refresh development from the read-only Laravel browser session and run reconciliation**

Run: `node scripts/import-nova-production-to-development.js --apply && node scripts/reconcile-development-parity.js`

### Task 8: Full verification and headless browser audit

**Files:**
- Modify: `tests/e2e/internal-dashboard.spec.js`
- Create: `tests/e2e/crm-erp-route-audit.spec.js`

**Interfaces:**
- Produces desktop/mobile screenshots and automated assertions for every internal route and role-gated navigation state.

- [ ] **Step 1: Add failing E2E assertions for every route, no uncaught errors, responsive layout, keyboard focus, source labels, and reduced motion**

- [ ] **Step 2: Run the E2E audit and address only evidenced failures**

Run: `yarn test:e2e`

- [ ] **Step 3: Run complete backend/frontend tests**

Run: `yarn test`

- [ ] **Step 4: Run the production bundle build**

Run: `yarn build`

- [ ] **Step 5: Run Gadget diagnostics and verify development record counts**

Run: `ggt status && ggt problems --env development`

- [ ] **Step 6: Review generated headless screenshots at 1440x1000 and 390x844 and record any remaining launch blockers**
