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
- [ ] Configure and run lint. **BLOCKED:** no lint script/configuration. Owner: Engineering.
- [ ] Configure and run static typechecking. **BLOCKED:** no typecheck script/project configuration. Owner: Engineering.
- [ ] Bundle size warning reviewed and accepted or reduced. Owner: Frontend.

## External and staging gates

- [ ] Run authorized Gadget sync/codegen and confirm all schemas/actions compile in Gadget Development. Owner: Gadget engineer.
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
