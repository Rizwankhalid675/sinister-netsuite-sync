# Production-Parity Development and Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gadget development structurally match the production-connected Shopify integration, complete the dashboard/RBAC revamp, and prepare a controlled production deployment without allowing development tests to write to Laravel production.

**Architecture:** Keep environment identity, credentials, and external API destinations separate while sharing application code. Development uses its existing Shopify client ID, test store, and staging Laravel endpoint; production receives the production Shopify client ID and Laravel endpoint only during the release step. Laravel remains the Miva source of truth until it exposes a read API; Gadget continues to own Shopify ingestion and the revamped UI/RBAC.

**Tech Stack:** Gadget v1.5, React/Vite, Shopify managed installation, Shopify Admin API 2026-01, Node test runner, Vitest, GGT.

## Global Constraints

- Never run development order, refund, deletion, or tracking tests against `https://manage.enshield.com`.
- Do not copy production secrets into tracked files.
- Do not modify Laravel/Nova production.
- Do not deploy Gadget production until the launch verification task passes.
- Preserve the existing development Shopify client ID and production Shopify client ID in their respective TOML files.

---

### Task 1: Reconcile Shopify managed-install configuration

**Files:**
- Modify: `shopify.app.development.toml`
- Modify: `shopify.app.toml`
- Modify: `settings.gadget.ts`
- Test: `tests/phase1-core.test.mjs`

**Interfaces:**
- Consumes: Gadget Shopify connection settings and Shopify CLI TOML configuration.
- Produces: Matching API version, scopes, application URLs, redirects, and webhook subscriptions.

- [ ] **Step 1: Add a failing configuration consistency test**

Assert that both TOMLs use API version `2026-01`; development uses `https://enshield-shipping-protection--development.gadget.app/`; production uses `https://enshield-shipping-protection.gadget.app/`; and all three configurations contain exactly `read_checkouts,read_metafields,read_orders,read_products,write_checkouts,write_metafields,write_order_edits,write_orders,write_products` after sorting.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/phase1-core.test.mjs`

Expected: failure identifying the URL, API-version, and scope drift.

- [ ] **Step 3: Apply the minimal configuration correction**

Set both TOMLs and `settings.gadget.ts` to API version `2026-01`. Set each TOML application URL to its environment root. Add `read_checkouts`, `read_metafields`, and `write_metafields` to both TOMLs; add `write_order_edits` to Gadget settings. Retain existing client IDs and environment-specific callback/webhook hosts.

- [ ] **Step 4: Verify configuration locally and in Gadget development**

Run: `node --test tests/phase1-core.test.mjs`

Then push only Task 1 files to Gadget development with GGT and confirm the Gadget Problems panel no longer reports scope or application URL mismatches.

### Task 2: Isolate staging and production Laravel delivery destinations

**Files:**
- Modify: `api/lib/enshieldDelivery.js`
- Modify: `api/actions/sendOrderToEnshield.js`
- Modify: `api/actions/sendTrackingToEnshield.js`
- Modify: `tests/phase2-delivery.test.mjs`

**Interfaces:**
- Consumes: `ENSHIELD_API_KEY` and a new `ENSHIELD_API_BASE_URL` environment variable.
- Produces: `getEnshieldApiBaseUrl()` returning an HTTPS origin without a trailing slash; all delivery URLs derive from it.

- [ ] **Step 1: Add failing URL-construction tests**

Test that staging builds `https://staging.manage.enshield.com/api/orders/miva/123`, production builds `https://manage.enshield.com/api/orders/miva/123`, missing configuration fails closed, HTTP URLs are rejected, and trailing slashes normalize safely.

- [ ] **Step 2: Run the delivery tests and confirm failure**

Run: `node --test tests/phase2-delivery.test.mjs`

- [ ] **Step 3: Replace hard-coded hosts with validated configuration**

Implement one shared URL builder in `api/lib/enshieldDelivery.js`. Make every order, tracking, refund, and deletion delivery call use it. Do not log keys, request bodies, customer data, or raw upstream errors.

- [ ] **Step 4: Configure development only**

Set Gadget development `ENSHIELD_API_BASE_URL` to `https://staging.manage.enshield.com`. Leave production unset until the release task. Confirm the variable value is never committed.

- [ ] **Step 5: Verify delivery behavior**

Run: `node --test tests/phase2-delivery.test.mjs tests/phase2-security-behavior.test.mjs`

Use a non-writing validation request against staging `/api/auth`; do not submit an order during configuration verification.

### Task 3: Finish dashboard identity and RBAC behavior

**Files:**
- Modify: `api/lib/permissions.js`
- Modify: `api/lib/internalAccess.js`
- Modify: `api/routes/api/GET-me.js`
- Modify: `web/lib/rbac.js`
- Modify: `web/lib/useRole.jsx`
- Modify: `web/routes/users.jsx`
- Test: `tests/phase2-authorization.test.mjs`
- Test: `tests/phase3-internal-access.test.mjs`
- Test: `tests/frontend/role-provider.test.jsx`

**Interfaces:**
- Consumes: authenticated `appUser`, canonical `appRole`, active shop assignments, and explicit permission arrays.
- Produces: fail-closed `{ user, roleKey, permissions, allowedShopIds, accessScope }` identity data used by API routes and navigation.

- [ ] **Step 1: Add authorization matrix tests**

Cover Super Admin, Administrator, Claims Manager, Finance, Support, Analyst, and read-only users. Assert both allowed and forbidden API/UI behavior and cross-shop denial.

- [ ] **Step 2: Run backend and frontend RBAC tests and confirm any failures**

Run: `node --test tests/phase2-authorization.test.mjs tests/phase3-internal-access.test.mjs && yarn vitest run tests/frontend/role-provider.test.jsx`

- [ ] **Step 3: Implement only the missing authorization behavior**

Keep permission checks on every protected backend route; use frontend permission checks only for presentation. Reject missing, duplicate, inactive, or foreign-shop assignments.

- [ ] **Step 4: Verify the complete RBAC matrix**

Repeat the focused backend/frontend commands and manually verify Users, Clients, Orders, Claims, Finance, Settings, and Audit navigation with at least one privileged and one restricted development account.

### Task 4: Establish truthful dashboard data boundaries

**Files:**
- Modify: `web/routes/dashboard.jsx`
- Modify: `web/routes/clients.jsx`
- Modify: `web/routes/orders.jsx`
- Modify: `api/routes/api/GET-dashboard-metrics.js`
- Modify: `api/routes/api/GET-clients.js`
- Test: `tests/dashboard-auth-regression.test.mjs`
- Test: `tests/frontend/operational-page.test.jsx`

**Interfaces:**
- Consumes: Gadget Shopify records plus explicitly imported legacy client metadata.
- Produces: UI labels that distinguish Shopify development data from unavailable Laravel/Miva data.

- [ ] **Step 1: Add tests that prohibit misleading production totals**

Assert that copied Nova totals are never presented as live Gadget metrics and that unavailable Miva data displays an explicit source/status message rather than zero as if synchronization succeeded.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/dashboard-auth-regression.test.mjs && yarn vitest run tests/frontend/operational-page.test.jsx`

- [ ] **Step 3: Implement source-aware empty/error states**

Keep Shopify metrics live from Gadget. Label Miva/Laravel data unavailable until a read-only Laravel API or migration export is supplied. Do not poll Nova HTML or reuse a browser session as an application integration.

- [ ] **Step 4: Verify the dashboard with development records**

Confirm the existing development shop and 13 Shopify orders render, filters work, API failures remain visible, and no production total is represented as live.

### Task 5: Release gate and controlled production deployment

**Files:**
- Modify: `docs/LAUNCH_RUNBOOK.md`
- Verify: all application files and Gadget environment configuration

**Interfaces:**
- Consumes: tested development release, production Shopify client ID, production `ENSHIELD_API_KEY`, and production `ENSHIELD_API_BASE_URL`.
- Produces: deployed Gadget production with rollback criteria and smoke-test evidence.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: all backend and frontend tests pass with zero failures.

- [ ] **Step 2: Complete development smoke tests**

Verify internal login, dashboard, clients, orders, claims, users, roles, audit, Shopify installation, cart protection, order webhook ingestion, and staging delivery. Record request IDs without storing customer payloads.

- [ ] **Step 3: Prepare production variables without exposing values**

Set production `ENSHIELD_API_BASE_URL=https://manage.enshield.com` and the production `ENSHIELD_API_KEY` only after development tests pass. Verify variable names, not values, with `ggt var list --env production`.

- [ ] **Step 4: Deploy Gadget production deliberately**

Deploy the verified development version through Gadget’s production deployment workflow. Do not use a development push command against production.

- [ ] **Step 5: Run non-destructive production smoke tests**

Verify login, reads, Shopify OAuth callbacks, and webhook health. Do not create/refund/delete a real order solely for a smoke test. Confirm existing real Shopify traffic produces one idempotent Laravel delivery.

- [ ] **Step 6: Apply rollback criteria**

Roll back if authentication fails, tenant boundaries fail, Shopify webhooks reject, delivery duplicates occur, or production Laravel returns unexpected non-2xx responses. Preserve delivery receipts and trace IDs for diagnosis.
