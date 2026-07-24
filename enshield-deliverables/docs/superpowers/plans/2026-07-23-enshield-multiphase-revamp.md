# Enshield Multi-Phase Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every production-code change uses test-driven development.

**Goal:** Deliver a secure internal multi-client Enshield operations dashboard, backed by Gadget, plus a non-cash-moving finance shadow ledger and a complete pre-production verification package.

**Architecture:** The standalone internal dashboard is the target surface. Shopify remains the commerce source, Gadget owns normalized operational models and access-controlled APIs, and the finance MVP is a shadow subledger until owners approve posting rules. Merchant embedded settings remain separate from internal operations.

**Tech Stack:** Gadget, Shopify, JavaScript/TypeScript, React 19, React Router 7, Vite 7, Node test runner, Playwright/Vitest when added.

## Global Constraints

- Work only in development/staging; never deploy production without explicit authorization.
- Never expose credentials, customer PII, tokens, or raw webhook secrets in code, logs, reports, or tests.
- Internal operators may access only stores assigned by policy; merchants may access only their own shop.
- All backend permissions fail closed and are enforced server-side.
- All signed webhooks verify the raw body and are idempotent.
- Money used for accounting is stored as integer minor units plus ISO currency.
- Posted finance records are immutable; corrections use linked reversals.
- Finance remains shadow/read-only until owner/CPA rules are approved.
- Each task starts with a failing test, implements the minimum change, and reruns covering tests.

---

### Task 1: Phase 2 security boundary

**Files:** `api/lib/permissions.js`, `api/routes/api/*`, `api/actions/*`, `accessControl/permissions.gadget.ts`, `tests/phase2-authorization.test.mjs`

- [x] Add failing authorization tests for foreign `shopId`, missing identity, unknown role, and direct action invocation.
- [x] Derive tenant identity from the authenticated session for every administrative route/action.
- [x] Reject client-supplied foreign shop identifiers.
- [x] Make the role catalog either immutable or authoritative; Phase 2 uses immutable seeded roles.
- [x] Run authorization and regression tests.

### Task 2: Shopify webhook verification and idempotency

**Files:** `api/lib/verifyShopifyWebhook.js`, `api/routes/webhooks/cart/POST-update.js`, `api/models/webhookReceipt/schema.gadget.ts`, `tests/phase2-webhook.test.mjs`

- [x] Add failing tests for valid, missing, malformed, and tampered HMAC plus duplicate delivery.
- [x] Verify the raw request body with timing-safe comparison.
- [x] Persist a unique delivery key before external side effects.
- [x] Redact tokens and payload PII from logs.
- [x] Run webhook and regression tests.

### Task 3: Canonical protection pricing and detection

**Files:** `api/lib/protection.js`, `api/lib/metrics.js`, insurance-variant route/action files, order sync files, `tests/phase2-protection.test.mjs`

- [x] Add failing fixtures where Shopify Protect and Enshield attributes disagree.
- [x] Define one Enshield protection marker and one cents-safe pricing function.
- [x] Replace duplicated formulas and whole-dollar rounding.
- [x] Test cancellations, partial/full refunds, base amount, percentage, and boundary cents.

### Task 4: Claims permissions, metrics, and reconciliation

**Files:** claim actions/schema, dashboard metrics route, `api/actions/reconcileClients.js`, `tests/phase2-claims.test.mjs`

- [x] Add role-transition tests for edit, approve, pay, reopen, and close.
- [x] Enforce same-shop client/order relationships.
- [x] Connect open-claim metrics to actual claim statuses.
- [x] Recompute client claim count and value in transit idempotently.
- [x] Run claims, metrics, tenancy, and regression tests.

### Task 5: Durable integration delivery and operational errors

**Files:** new `integrationDelivery` model/actions, Enshield send actions, `GET-errors.js`, tests.

- [x] Test unique idempotency keys, retries, permanent failure, replay, and redacted logs.
- [x] Replace direct fire-and-forget calls with a persisted outbox/delivery record.
- [x] Add bounded retry and visible failed-delivery state.
- [x] Expose a permission-gated operational errors API.

### Task 6: Phase 3 shared internal dashboard shell

**Files:** `web/components/dashboard/*`, `web/components/App.jsx`, `web/lib/dashboardNavigation.js`, frontend tests.

- [x] Add route/navigation/permission tests.
- [x] Build one route-aware responsive shell for Dashboard, Clients, Orders, Claims, Errors, Reports, Settings, and Users.
- [x] Move `RoleProvider` to the authenticated root.
- [x] Remove duplicate in-page navigation.

### Task 7: Phase 3 operational pages

**Files:** dashboard, clients, orders, claims, errors, reports, settings, users routes and APIs.

- [x] Add success, empty, loading, forbidden, error, pagination, filter, and mobile tests.
- [x] Implement real API-backed pages without fabricated records.
- [x] Add accessible textual statuses and chart alternatives.
- [x] Implement robust quoted CSV export.
- [x] Keep merchant storefront/metafield settings separate.

### Task 8: Frontend verification lane

**Files:** package scripts, Vitest/Testing Library/Playwright configuration and tests.

- [x] Add unit/component/browser test commands.
- [x] Test keyboard navigation, responsive widths, reduced motion, and accessibility.
- [x] Add visual comparisons against approved dashboard mockups.

### Task 9: Phase 4 shadow-ledger foundation

**Files:** new finance model schemas/actions, `api/lib/finance/*`, tests.

- [x] Add integer-minor-unit and currency tests.
- [x] Add financial event, ledger account, accounting period, journal entry, and journal line models.
- [x] Enforce balanced per-currency journals, idempotency, immutable posting, reversal, closed periods, and two-person approval.
- [x] Keep all entries in shadow mode with no external posting or payment initiation.

### Task 10: Phase 4 AR/AP, reserves, reconciliation, and reports

**Files:** finance document/allocation/reserve/payment/reconciliation models, routes/pages, tests.

- [x] Add allocation, reserve roll-forward, reconciliation, concurrency, and separation-of-duties tests.
- [x] Implement operational AR/AP drafts, claim reserves, recorded payment confirmations, CSV reconciliation, and exception queues.
- [x] Implement trial balance, ledger detail, ageing, reserve roll-forward, payment register, reconciliation exceptions, and audit export.
- [x] Do not enable automatic payments, tax, FX, bank feeds, or external accounting sync.

### Task 11: Full pre-production verification and reports

**Files:** tests and QA reports only.

- [ ] Run lint/type/build/unit/integration/browser/security/secret/data/finance checks.
- [ ] Reconcile representative Shopify and Gadget records.
- [ ] Fix all Blocker/Critical/High findings and rerun affected plus regression tests.
- [x] Produce technical results, issues/solutions, go-live checklist, and executive summary.

## Owner/CPA Gates

Production finance posting remains blocked until written approval covers revenue ownership, merchant commercial terms, chart of accounts, recognition timing, claim reserves/liabilities, payment authority, legal entities, fiscal calendar, currencies/FX, tax, retention, and authoritative-system migration.
