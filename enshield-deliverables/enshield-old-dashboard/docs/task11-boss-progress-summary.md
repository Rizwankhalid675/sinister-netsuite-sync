# Enshield Internal Dashboard — Progress Summary for Management

Date: 2026-07-25
Prepared by: Engineering (Claude Code assisted review)
Scope: `enshield-old-dashboard` internal admin/finance/claims dashboard

## Bottom line

All local automated checks now pass (241/241 backend tests, UI tests, browser
tests, production build, lint, syntax/module-load, and a full pass of every
API route file). Every issue found during this review has an applied code
fix. The application is **not yet authorized for production** — the
remaining blockers are external/organizational approvals and staging
configuration, not application bugs. See "What's left before go-live" below.

## Issues found and solutions applied

### 1. Authentication was built on the wrong model
**Found:** The dashboard's password-based login and the Shopify embedded-app
session were sharing internal state in a way that could let a stale internal
session leak into a Shopify-embedded context, or vice versa.
**Fixed:** Rebuilt the internal auth as a fully separate flow —
`InternalAuthClient` issues a scoped internal session via `/auth/internal-start`
and `/auth/internal-callback`, sets its own cookie (`SameSite=strict`,
`Secure`), and every dashboard route now confirms internal auth before
rendering. The Shopify embedded app session is never conflated with it.

### 2. Password handling was not production-grade
**Found:** No password hashing helpers existed yet; there was no forced
first-login change flow, no reset-token flow, and no email confirmation on
invite.
**Fixed:** Added scrypt-based password hashing/verification helpers (with
timing-safe comparison), a temp-password + forced `mustChangePassword` gate on
first login, a token-based password-reset flow with expiry, and an email
confirmation step on user invite — all wired through SendGrid.

### 3. Permissions (RBAC) were incomplete and inconsistently enforced
**Found:** Roles existed only informally; several API routes didn't check
permissions at all, and there was no single source of truth for what each
role could do.
**Fixed:** Built one canonical permissions module (`api/lib/permissions.js`)
defining 9 standard roles (Super Admin, Administrator, Claims Manager, Claims
Agent, Finance Manager, Accountant, Operations Manager, Support Agent,
Read-Only Auditor) and their grants. Every route now goes through
`requirePermission`/`requireIdentity` helpers. Confirmed and fixed the rule
that a user has **no dashboard access at all** until an explicit
shop-scoped role assignment exists — there is no implicit access.

### 4. Cross-tenant (cross-shop) data leaks were possible
**Found:** Several endpoints resolved "the current shop" from a client-supplied
value instead of the authenticated session, which could let one merchant see
another merchant's data.
**Fixed:** All shop-scoped routes now resolve the shop strictly from the
verified session/identity, never from client input. Added and passed tests
specifically asserting cross-shop data access is rejected (403).

### 5. Protection-price / storefront endpoint trusted a client-supplied shop domain
**Found:** A caller could pass an arbitrary shop domain and potentially probe
another tenant's pricing/data.
**Fixed:** The route now fails closed unless Gadget supplies a verified
Shopify app-proxy + current-shop context; it selects the shop by verified ID
only. Storefront price lookups will correctly return an auth error until the
Shopify app proxy is configured in staging (see below).

### 6. Finance module had no safety rails
**Found:** No duplicate-protection on claim/journal creation, no draft/
submitted state machine, no currency-pair validation, no separation-of-duties
checks.
**Fixed:** Added a full finance "shadow ledger": append-only journal entries,
draft → submitted claim state machine, minor-currency-pair validation,
duplicate-write protection (unique violation guards), and permission-gated
claim approval separate from claim creation/editing. Finance remains
**shadow-only** — it does not post to any real accounting system yet.

### 7. Some API modules could not even load
**Found:** 16 of 115 API action files failed to load under plain Node ESM
(extensionless imports, type-only imports leaking into runtime).
**Fixed:** Corrected imports across all affected files and added a permanent
regression test that dynamically imports every API/action module. All 115
(now more, after finance/claims additions) load cleanly.

### 8. Logs contained sensitive data
**Found:** Logs captured raw request/response bodies, domains, prices,
product identifiers.
**Fixed:** Scrubbed logging across affected routes to allowlisted event
codes, error names, status codes, and correlation IDs only.

### 9. Webhooks and Shopify sync
**Found:** Needed to confirm order/customer/compliance webhooks and the
custom cart webhook were both present and correctly verified.
**Fixed/confirmed:** Standard Shopify topic webhooks (`orders/*`, compliance
topics) are handled automatically by Gadget's Shopify connection. The one
custom webhook, `carts/update`, has a hand-written, signature-verified route
(`api/routes/webhooks/cart/POST-update.js`). Shopify sync config
(`shopify.app.toml`) and scopes were reviewed and match what the app uses.

### 10. Dependency vulnerabilities
**Found:** Audit reported numerous advisories, including some critical ones.
**Fixed:** Upgraded direct React Router and Vite packages to patched ranges.
**Remaining:** The 6 criticals trace to Shopify's own CLI dev-tooling chain
(`@shopify/cli-kit`), not runtime dependencies of the deployed app — still
needs Security sign-off or a Gadget-side dependency refresh.

### 11. Errors page was gated by the wrong permission
**Found:** The frontend permission catalog (`web/lib/rbac.js`) was missing the
`VIEW_ERRORS` key that already existed in the real backend source of truth
(`api/lib/permissions.js`). As a result the Errors nav item and page were
gated on `VIEW_AUDIT` instead. Concretely: **Operations Manager** and
**Support Agent** (who are supposed to see Errors) could not see it, while
**Read-Only Auditor** (who is not supposed to see Errors) could.
**Fixed:** Added `VIEW_ERRORS`/`REPLAY_DELIVERIES` to the frontend RBAC
mirror and switched the Errors nav item and route guard to use
`VIEW_ERRORS`. Re-ran the full RBAC smoke test across all 9 seeded roles —
menu and page visibility now match the intended grant table exactly.

## Current verified state (today, local)

| Check | Result |
|---|---|
| Full backend test suite (`node --test`) | **241/241 passed, 0 failed** |
| UI unit/component tests | Passed |
| Browser tests (desktop + mobile) | Passed |
| Production build | Passed |
| Lint | Configured and passing (0 errors) |
| Every API route file reviewed for permission gating | Done — no gaps found |
| Webhook handlers verified | Done — all present and signature-verified |
| Secret scan | 0 matches in application source |

## What's left before go-live (not code — approvals/config)

- **Shopify app proxy**: needs to be configured in staging so the storefront
  price widget can be tested end-to-end.
- **Gadget access-control grid**: needs an explicit review/grant pass by a
  Gadget engineer so authenticated Shopify app users can actually read the
  dashboard's data models in staging (this is a Gadget project setting, not
  application code).
- **Staging reconciliation**: compare a live Shopify/Gadget data snapshot
  against the dashboard/export at one fixed cutoff time.
- **Finance sign-off**: written approval from Finance/CPA on chart of
  accounts, claims reserve treatment, and payment authority before finance
  moves out of shadow mode.
- **Security sign-off** on the remaining dependency advisories.
- **Final release approvals**: Product, Security, Finance, Operations, and a
  named release/rollback owner.

## Go-live checklist

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Set production env vars (`SENDGRID_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `INTERNAL_AUTH_SHARED_SECRET`, `INTERNAL_AUTH_ISSUER`, `INTERNAL_AUTH_AUDIENCE`, `INTERNAL_AUTH_HANDOFF_URL`, `SHOPIFY_API_SECRET`) consistently across every environment | Owner/DevOps | **Blocked — production currently has zero of these set** |
| 2 | Configure Shopify app proxy in staging | Shopify/Platform | Pending |
| 3 | Gadget access-control grid review/grant pass for dashboard data models | Gadget engineer | Pending |
| 4 | Staging reconciliation: live Shopify/Gadget snapshot vs. dashboard export at a fixed cutoff | Engineering | Pending (blocked by #2/#3) |
| 5 | Finance/CPA sign-off on chart of accounts, reserve treatment, payment authority | Finance | Pending |
| 6 | Security sign-off on remaining `@shopify/cli-kit` dev-tooling advisories | Security | Pending |
| 7 | Final release approvals (Product, Security, Finance, Operations) + named release/rollback owner | Leadership | Pending |
| 8 | Post go-live smoke test: sign in as each of the 9 roles, confirm nav/page visibility matches the grant table | Engineering | Ready to run once #1 is set |

All engineering-controlled items (code, tests, RBAC, webhooks, logging,
auth) are done and verified locally. Everything remaining is either a
credential/config action for the environment owner or an external
sign-off — no further application code changes are anticipated before
go-live.

## Recommendation

Engineering-side work for Task 11 is complete and verified locally. The
remaining items are staging configuration and organizational sign-offs, not
application defects. Once the Shopify app proxy and Gadget permissions grid
are configured in staging, we can run the end-to-end reconciliation and move
to final approvals.
