# Enshield Go-Live Checklist

Date: 2026-07-23  
Current decision: **NO-GO for production; local verification is not production authorization.**

## Local engineering gates

- [x] Backend/control automated tests pass.
- [x] UI unit/component tests pass.
- [x] Desktop and mobile Playwright checks pass.
- [x] Production frontend build passes.
- [x] All API JavaScript files pass syntax checks.
- [x] All API/action modules load locally.
- [x] Targeted secret scan has no application-source matches.
- [x] Protection-variant route fails closed without a verified Shopify tenant.
- [x] Finance invariants pass in shadow mode.
- [x] Configure and run lint. **DONE:** ESLint configured and run — 0 errors, 136 warnings (all unused-var style, non-blocking).
- [x] Full node --test suite passes. **DONE:** 39/39 test files passed, 0 failures.
- [ ] Configure and run static typechecking. **STILL BLOCKED:** `package.json` declares `"typecheck": "tsc --noEmit"`, but no `tsconfig.json` exists anywhere in the repo. The script silently does nothing (prints tsc CLI help) rather than type-checking — it has never actually run. Owner: Engineering.
- [ ] Bundle size warning reviewed and accepted or reduced. Owner: Frontend.
- [x] Dependency audit run (yarn audit, since repo uses yarn.lock not package-lock.json). **DONE:** 168 advisories (6 critical, 84 high, 53 moderate, 15 low) across 909 packages. All 6 criticals (form-data, liquidjs, simple-git) trace to the `@shopify/cli-kit` dev-tooling chain used by `@shopify/app`/`@shopify/create-app`, not runtime dependencies of the deployed app — but they still represent risk to any developer machine invoking Shopify CLI. Advisories not yet cleared or formally accepted. Owner: Security.
- [x] RBAC verified across all 9 standard roles (Super Admin, Administrator, Claims Manager, Claims Agent, Finance Manager, Accountant, Operations Manager, Support Agent, Read-Only Auditor) — single source of truth in `api/lib/permissions.js` (`ROLE_GRANTS`), seeded idempotently via `seedAppRoles.js`, enforced via `requirePermission`/`requireIdentity`. Confirmed the shop-scoped role lives on `operatorShopAssignment.role`, not on `internalOperator` directly — an operator has no dashboard access until an `operatorShopAssignment` (operator + shop + role) exists.

## External and staging gates

- [x] Run authorized Gadget sync/codegen and confirm all schemas/actions compile in Gadget Development. **DONE:** confirmed live via GraphQL introspection against `enshield-shipping-protection--development` — `operatorShopAssignment` and other models exist with fields matching the app code. Schema is in sync.
- [ ] **NEW FINDING:** Gadget access-control permissions grid (`accessControl/permissions`) has almost every model's read/create/update/delete **unchecked** for both the `shopify-app-users` role and `unauthenticated`, including `operatorShopAssignment`, `client`, `claim`, `journalEntry`, `ledgerAccount`, `reconciliationRun`, `payableDocument`, `receivableDocument`, and most others. Only `shopifyCart`, `shopifyOrder`, `shopifyShop`, and `shopifySync` show `read` enabled (with a filter configured) for `shopify-app-users`. This means even a correctly authenticated Shopify app user currently cannot read most dashboard data models via the Gadget API — a live-data pass of the dashboard would fail closed almost everywhere beyond storefront-native models, independent of the app's own internal RBAC (`api/lib/permissions.js`) which operates one layer above this grid. Owner: Gadget engineer — needs explicit review/grant of the correct model permissions before any staging or production data flow can work end-to-end.
- [ ] Upgrade Gadget generated runtime/client dependencies and clear or formally accept the remaining audit advisories. Owners: Gadget engineer and Security.
- [ ] Configure the Shopify app proxy and route the theme request through it. Owners: Shopify engineer and Gadget engineer.
- [ ] Verify signed app-proxy requests, rejection of direct requests, and tenant binding in staging. Owner: Security/QA.
- [ ] Test internal IdP login, callback, logout, expiry, disabled operator, and role changes in staging. Owners: Identity and Security.
- [ ] Reconcile representative Shopify orders, refunds, protection snapshots, claims, and Gadget metrics at one documented cutoff. **BLOCKED / NOT RUN:** no authorized same-cutoff staging source snapshot. Owners: Data/QA.
- [ ] Generate the new metadata-rich CSV and reconcile totals to the same source snapshot. Owners: Data/Finance.
- [ ] Exercise delivery retries, webhook replay, and error queue against staging integrations. Owners: Integrations/QA.
- [ ] Confirm monitoring, alerting, redaction, retention, backup, rollback, and incident runbooks. Owners: Operations/Security.

## Finance gates

- [x] Local shadow-ledger invariants and separation-of-duties tests pass.
- [ ] Written approval for revenue ownership and merchant commercial terms.
- [ ] Approved chart of accounts and recognition timing.
- [ ] Approved claims reserve/liability treatment.
- [ ] Named payment authority and two-person approval policy.
- [ ] Approved legal entities, fiscal calendar, currencies/FX, tax, and retention rules.
- [ ] Authoritative-system migration and opening-balance plan.

Owners: Parley/Product, Mieke/Finance, CPA/controller, and Legal as applicable.

No automatic payment, bank feed, tax, FX, external accounting posting, or production finance posting may be enabled until every finance gate is signed.

## Release authorization

- [ ] Product sign-off.
- [ ] Security sign-off.
- [ ] Finance/CPA sign-off.
- [ ] Operations support sign-off.
- [ ] Named release owner and rollback owner.
- [ ] Explicit production deployment authorization.
