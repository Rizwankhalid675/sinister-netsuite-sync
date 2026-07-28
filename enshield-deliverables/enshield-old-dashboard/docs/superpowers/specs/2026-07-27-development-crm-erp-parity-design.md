# Enshield Development CRM/ERP Parity Design

## Objective

Turn the Gadget development environment into a review-ready insurance operations CRM/ERP that matches the recovered Laravel production system's operational reporting while keeping production read-only and finance in shadow mode.

## Release boundary

This release includes dashboards, clients, orders, claims, integration health, reporting, user roles, audit visibility, and usable shadow-accounting screens. It does not initiate payments, post to banks, mutate production Laravel, redirect production Miva traffic, or install the development Shopify app on production stores.

## Data architecture

- Gadget remains the development source of truth.
- Native Shopify records and imported Laravel records are projected into source-neutral order and claim contracts.
- Legacy orders preserve `is_shipped`, status, tracking number, monetary fields, source platform, client relationship, and source timestamps.
- Client value-in-transit and open-claim counts are derived from related records using the same rules as Laravel, not trusted from stale cached counters.
- Legacy claims appear beside native claims and remain read-only until explicitly migrated into the native claim workflow.
- A development-only Miva-compatible API accepts the recovered Laravel payload shape, authenticates with development-specific hashed credentials, and performs idempotent order/tracking/cancellation writes.

## Reporting

- Dashboard and Reports use one shared aggregation contract and identical range semantics.
- Reports show formatted currency, totals, source/client filters, protection performance, fulfillment, refunds, claims, and CSV export.
- Values expose data freshness, source, record counts, and truncation state.
- Reconciliation tests compare Laravel-style `is_shipped = false` totals against Gadget projections.

## CRM/ERP presentation

- Preserve the compact dark navigation rail and light workspace.
- Use a consistent page header, toolbar, filter bar, KPI cards, data tables, badges, pagination, loading states, empty states, and error recovery.
- Use Framer Motion only for restrained page entry, KPI reveal, expandable panels, modal transitions, and navigation state. Honor reduced-motion preferences and avoid decorative continuous animation.
- Finance replaces the raw entity-ID-first screen with an assigned-client selector, summary cards, clear shadow-mode labeling, guided empty states, and task-oriented modules.
- Claims, errors, and audit pages explain why they are empty and provide relevant next actions without inventing data.

## Roles and permissions

- Backend permissions remain authoritative; frontend gates only control presentation.
- Super Admin: all development capabilities.
- Administrator: operational administration without security-boundary changes.
- Claims Manager/Adjuster: scoped claim review and transitions.
- Finance Manager/Analyst: shadow finance write/read separation.
- Operations Manager/Agent: orders, clients, integration errors, and reports as assigned.
- Auditor: read-only reports, finance evidence, and audit log.
- Merchant: assigned-store storefront and operational visibility only.
- Every route and mutation verifies identity, permission, and assigned client/shop server-side.

## Reliability and security

- No production writes or production credential copying.
- No customer address, email, phone, banking, API key, or arbitrary payload logging.
- Imports and Miva writes use stable idempotency keys.
- Imported legacy records are source-labelled and cannot be edited by native mutation routes.
- Integration failures create sanitized operational error records with retry classification.
- All pagination is bounded and reports explicitly signal truncation.

## Verification

- Test-first coverage for shipment projection, rollups, unified claims, Miva authentication/idempotency, report calculations, and permission enforcement.
- Full backend and frontend test suites.
- Production build.
- Headless Chromium review at desktop and mobile widths for Dashboard, Clients, Orders, Claims, Errors, Reports, Finance, Audit, Settings, and Users.
- Accessibility checks for keyboard navigation, focus, labels, contrast, reduced motion, and empty/error states.

## Acceptance criteria

- Five imported clients show nonzero production-style rollups where applicable.
- Imported closed claims appear in Claims while open-claim KPIs remain correct.
- Shipped orders no longer inflate value-in-transit.
- Dashboard and Reports reconcile to the same underlying records and filters.
- Shopify and Miva sources are visibly distinguishable and queryable.
- Finance is usable for shadow records without requiring a manually typed entity ID.
- Role previews and real identities cannot access unauthorized routes or mutations.
- No uncaught application error is visible during the headless route audit.
