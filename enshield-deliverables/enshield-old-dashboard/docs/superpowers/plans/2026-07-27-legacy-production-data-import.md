# Legacy Production Data Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the five Laravel/Nova production clients and their source-neutral operational history into Gadget development without writing to production or storing production API credentials.

**Architecture:** A local, one-time Playwright importer reads authenticated Nova GET endpoints, normalizes only operational fields, and posts bounded batches to a development-only authenticated route. Gadget stores legacy orders separately from Shopify-managed orders, then dashboard and order-list routes aggregate both sources behind the existing RBAC boundary.

**Tech Stack:** Gadget models/actions, Fastify routes, Node.js, Playwright CDP, Node test runner.

## Global Constraints

- Production Laravel/Nova is GET-only; never submit forms or call mutation endpoints.
- Do not import customer email, phone, street address, API credentials, session cookies, or order detail payloads.
- Imports must be idempotent using stable `nova:<resource>:<id>` source keys.
- Import writes are development-only and require an authenticated Super Admin/Administrator session.
- Existing Shopify synchronization remains the source of truth for the installed development Shopify shop.

---

### Task 1: Source-neutral legacy schemas

**Files:**
- Create: `api/models/legacyOrder/schema.gadget.ts`
- Create: `api/models/legacyClaim/schema.gadget.ts`
- Modify: `api/models/client/schema.gadget.ts`
- Test: `tests/legacy-import.test.mjs`

**Interfaces:**
- Produces: unique legacy source keys and client relationships used by the importer and read routes.

- [ ] Write schema-contract tests requiring source, legacy ID, platform, normalized money, status, timestamps, and client relationships while prohibiting customer PII fields.
- [ ] Run `node --test tests/legacy-import.test.mjs` and verify it fails because the schemas do not exist.
- [ ] Add the minimal schemas and legacy platform/source fields to `client`.
- [ ] Rerun the focused test and verify it passes.

### Task 2: Pure Nova normalization

**Files:**
- Create: `scripts/lib/normalizeNovaExport.js`
- Test: `tests/legacy-import.test.mjs`

**Interfaces:**
- Produces: `normalizeClient(resource)`, `normalizeOrder(resource)`, and `normalizeClaim(resource)` returning PII-free records.

- [ ] Add tests for Miva/Shopify platform preservation, cents conversion, relationship IDs, status normalization, and PII removal.
- [ ] Run the focused test and verify missing exports fail it.
- [ ] Implement the three pure normalizers with strict allowlists.
- [ ] Rerun the focused test and verify it passes.

### Task 3: Development-only idempotent ingestion route

**Files:**
- Create: `api/routes/api/POST-import-legacy-production.js`
- Create: `api/lib/legacyImport.js`
- Test: `tests/legacy-import.test.mjs`

**Interfaces:**
- Consumes: normalized batches of at most 100 records.
- Produces: `{ created, updated, unchanged, rejected }` counts per resource.

- [ ] Add tests requiring production-environment rejection, privileged internal access, a 100-record limit, stable-key upserts, and transactional client/order/claim writes.
- [ ] Run the focused test and verify the route/helper absence fails it.
- [ ] Implement validation and idempotent upserts without logging payload data.
- [ ] Rerun focused and authorization tests.

### Task 4: Local authenticated Nova reader

**Files:**
- Create: `scripts/import-nova-production-to-development.js`
- Test: `tests/legacy-import.test.mjs`

**Interfaces:**
- Consumes: production CDP URL, development URL, and an already authenticated development browser session.
- Produces: paginated GET-only imports in dependency order: clients, orders, claims.

- [ ] Add source tests requiring GET-only Nova calls, bounded pagination, no secret persistence, and dry-run summaries.
- [ ] Verify tests fail before adding the script.
- [ ] Implement dry-run by default and explicit `--apply` for development ingestion.
- [ ] Verify dry-run reports 5 clients, 9,256 orders, and 1 claim without writing.

### Task 5: Unified dashboard and order reads

**Files:**
- Modify: `api/routes/api/GET-dashboard-metrics.js`
- Modify: `api/routes/api/GET-orders.js`
- Modify: `api/lib/metrics.js`
- Test: `tests/dashboard-auth-regression.test.mjs`
- Test: `tests/legacy-import.test.mjs`

**Interfaces:**
- Consumes: Shopify-managed and legacy source-neutral order records.
- Produces: one range-consistent dashboard contract with accurate `dataSources.shopify` and `dataSources.miva` statuses.

- [ ] Add failing tests for combined counts, client filtering, currency safety, Miva status, latest-order ordering, and duplicate suppression for the installed development shop.
- [ ] Implement a unified internal order projection and feed it to existing metric derivation.
- [ ] Rerun focused tests, then `yarn test` and `yarn test:e2e`.

### Task 6: Deploy, import, reconcile, and verify

**Files:**
- Modify only if verification exposes a tested defect.

**Interfaces:**
- Produces: synchronized Gadget development data and boss-review evidence.

- [ ] Run `ggt push` to development only.
- [ ] Run importer dry-run and compare counts against Nova.
- [ ] Run importer with `--apply`, rerun it, and verify the second run creates zero duplicates.
- [ ] Reconcile client rollups and verify five clients plus Shopify/Miva dashboard totals.
- [ ] Run `yarn test`, `yarn test:e2e`, `yarn build`, and authenticated desktop/mobile checks.
- [ ] Verify `ggt status` reports local and development environment files unchanged.
