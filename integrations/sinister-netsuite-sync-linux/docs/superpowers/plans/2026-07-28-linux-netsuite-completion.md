# Linux NetSuite Integration Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely complete and validate the Miva-to-NetSuite Linux integration today without creating duplicate or incorrectly priced NetSuite transactions.

**Architecture:** Keep the existing five-flow Node.js/PM2 service, but isolate order-to-NetSuite field and pricing resolution in a pure mapping module that can be tested without calling production APIs. Run read-only parity checks against recent Miva orders and NetSuite records before allowing any write flow, then cut over with exactly one active sync worker.

**Tech Stack:** Node.js 20, Miva JSON API, NetSuite REST/SuiteQL with OAuth 1.0a, node:test, PM2, Nginx.

## Global Constraints

- Never run the Windows and Linux sync workers simultaneously.
- Do not create, transform, approve, invoice, or apply a deposit during dry-run validation.
- Never print or commit `.env` credentials.
- A Miva order may create at most one NetSuite Sales Order, keyed by stable external ID.
- Unresolved or partially matched SKUs must be sent for manual review; they must not silently use an unrelated NetSuite item or price.

---

### Task 1: Recover the tested order-mapping work safely

**Files:**
- Modify: `flows/ordersToNetsuite.js`
- Create: `lib/orderMapping.js`
- Create: `test/orderMapping.test.js`
- Create: `scripts/dry-run-order-parity.js`

**Interfaces:**
- Consumes: Miva order objects and NetSuite item/Sales Order lookup results.
- Produces: pure mapping helpers used by the write flow and the read-only parity script.

- [ ] Create an isolated feature branch from the 8:38 snapshot and retain `safety/pre-0822-rollback-20260728` plus `stash@{0}` as recovery points.
- [ ] Restore the later mapping implementation from commit `f4d70bd`, then selectively apply the preserved stash rather than copying files manually.
- [ ] Run `node --test test/orderMapping.test.js` and record every failing assertion before editing implementation code.
- [ ] Confirm tests cover exact SKU matches, attribute-specific SKUs, kit/options, blemish/override fallback, quantities, discounts, shipping, tax, and manual-approval behavior.
- [ ] Commit only after `node --test test/orderMapping.test.js` passes.

### Task 2: Guarantee duplicate-safe Sales Order creation

**Files:**
- Modify: `netsuite.js`
- Modify: `flows/ordersToNetsuite.js`
- Test: `test/orderMapping.test.js`

**Interfaces:**
- Consumes: Miva order ID and the external ID format used by existing NetSuite Sales Orders.
- Produces: a read-before-write result that either reuses the existing Sales Order or permits exactly one create request.

- [ ] Add a failing test proving an existing external ID prevents `createSalesOrder` from being called.
- [ ] Use a parameterized SuiteQL lookup for the stable Miva external ID, escaping or rejecting unsafe values before query construction.
- [ ] Reconcile the local `synced_orders.json` record from NetSuite when the Sales Order already exists.
- [ ] Add an in-process lock so overlapping cron runs cannot create the same order twice.
- [ ] Run the focused tests and commit the duplicate-safety change.

### Task 3: Prove recent-order parity without writes

**Files:**
- Modify: `scripts/dry-run-order-parity.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: recent Miva orders plus read-only NetSuite item and transaction queries.
- Produces: a non-secret report containing order ID, expected total, mapped total, difference, SKU resolution, and duplicate status.

- [ ] Add scripts `test` (`node --test`) and `dry-run:orders` (`node scripts/dry-run-order-parity.js`) to `package.json`.
- [ ] Ensure dry-run code imports only pure mapping/read functions and cannot call POST, PATCH, PUT, DELETE, transforms, deposits, or invoices.
- [ ] Run parity against a small known set that includes a simple order, an attribute order, a kit/options order, a discount, shipping/tax, and an already-synced order.
- [ ] Require zero duplicate candidates, exact item resolution or explicit manual review, and a currency difference no greater than $0.01 per order.
- [ ] Save a redacted result and commit the validation tooling.

### Task 4: Validate invoice and deposit lifecycle

**Files:**
- Modify: `flows/invoices.js`
- Test: `test/invoices.test.js`

**Interfaces:**
- Consumes: an existing Sales Order, its approval/fulfillment state, and prior deposit/invoice tracking.
- Produces: no action until eligible; afterward, at most one deposit and one invoice with a recorded application result.

- [ ] Add tests for ineligible status, existing deposit, existing invoice, transform success, transform USER_ERROR with successful lookup, and deposit-application retry.
- [ ] Query NetSuite by external IDs before creating deposits or invoices; local JSON tracking alone is not sufficient.
- [ ] Never invoice unapproved or unfulfilled Sales Orders.
- [ ] Run invoice tests with mocked API calls; perform a live write test only in a NetSuite sandbox or with explicit approval for one designated order.
- [ ] Commit after all lifecycle tests pass.

### Task 5: Smoke-test the remaining four integration paths

**Files:**
- Test: `test/customers.test.js`
- Test: `test/shipments.test.js`
- Test: `test/products.test.js`
- Modify only if a test exposes a defect: `flows/customersToNetsuite.js`, `flows/shipmentsToMiva.js`, `flows/productSync.js`

**Interfaces:**
- Consumes: mocked Miva and NetSuite responses for customers, shipments, and product IDs.
- Produces: idempotent flow outcomes and explicit retryable/non-retryable errors.

- [ ] Test customer upsert idempotency and pagination.
- [ ] Test shipment replay does not create duplicate Miva shipments.
- [ ] Test product pagination beyond 500 records and correct Miva/NetSuite ID updates.
- [ ] Test one flow failure does not silently mark the entire cycle successful.
- [ ] Run `npm test` and commit only the fixes demonstrated by failing tests.

### Task 6: Harden and perform a controlled Linux cutover

**Files:**
- Modify: `package.json`
- Modify if required: `ecosystem.config.js`
- Modify: `DEPLOY.md`

**Interfaces:**
- Consumes: a tested commit, production `.env`, existing tracking JSON files, and PM2 configuration.
- Produces: one monitored Linux sync worker with a documented rollback command.

- [ ] Review `npm audit` findings and upgrade vulnerable packages without changing API behavior; rerun syntax and automated tests.
- [ ] Back up `logs/synced_orders.json`, `logs/synced_invoices.json`, and `logs/synced_customers.json` before deployment.
- [ ] Stop and verify the old Windows/other sync process is stopped before starting Linux PM2.
- [ ] Deploy the exact reviewed commit, run one manual cycle with writes disabled, then enable writes for one monitored cycle.
- [ ] Verify Sales Order counts, totals, duplicate external IDs, invoice/deposit state, shipment callbacks, PM2 health, and logs.
- [ ] If any gate fails, stop the Linux worker and restore the previous reviewed commit plus tracking-file backup.

## Release Gate

- [ ] `node --check` passes for every JavaScript file.
- [ ] `npm test` passes with no skipped critical-path tests.
- [ ] Dry-run parity passes for the representative order set.
- [ ] No duplicate external IDs or unexpected production writes occur.
- [ ] Credentials remain untracked and redacted from logs.
- [ ] Exactly one sync worker is active.

