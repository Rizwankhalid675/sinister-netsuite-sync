# V2 Release Candidate Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an evidence-backed publish-readiness decision for the authenticated `Revamp_v2` storefront while preserving its approved visual design.

**Architecture:** Audit the hosted Miva branch through the user's authenticated Chrome debugging session, classify reproducible failures by shared component or route template, and correct root causes in the canonical CSS, JavaScript, or MVT source. Every production edit receives a failing regression assertion first, is deployed through MMT, and is rechecked on the hosted branch.

**Tech Stack:** Miva Merchant/MVT, shared CSS, dependency-free browser JavaScript, Node.js tests, Chrome DevTools Protocol, Miva MMT.

## Global Constraints

- Preserve the approved V2 layout and identity; adjust defects, sizing, typography, accessibility, and responsive behavior only.
- Keep Miva as the commerce engine and preserve native URLs, forms, account state, catalog data, analytics, and integrations.
- Do not expose session cookies, MMT keys, payment data, or account credentials in files or reports.
- Do not submit the final paid order, create a charge, trigger fulfillment, delete account data, or log the user out.
- Store temporary crawl scripts and screenshots outside the repository.
- Deploy only identified MMT files and confirm `mmt status` is clean after every push.

---

### Task 1: Route and Flow Inventory

**Files:**
- Read: `V2_STRUCTURE.md`
- Read: hosted internal links through Chrome DevTools Protocol
- Create outside repository: `%TEMP%/sd2-v2-release-20260721/release-audit.js`

- [ ] Enumerate public, catalog, help, editorial, account, basket, and checkout destinations without following logout, delete, external, or mutating links.
- [ ] Record the screen identity, URL, authentication state, and expected shared shell for every destination.
- [ ] Deduplicate query variants while retaining representative search, vehicle, product, and account states.

### Task 2: Hosted Desktop and Mobile Crawl

**Files:**
- Create outside repository: `%TEMP%/sd2-v2-release-20260721/release-audit.js`
- Create outside repository: `%TEMP%/sd2-v2-release-20260721/report.json`

- [ ] Load every inventory route at 1440x900 and 390x844 through the authenticated Chrome context.
- [ ] Capture page identity, meaningful body content, V2 shell presence, document overflow, broken loaded images, visible undersized controls, unexpected font families, console errors, and uncaught exceptions.
- [ ] Save screenshots only for failures and representative release-critical states.
- [ ] Exercise header, mega menu, search, Garage, accordion, tabs, pagination, account navigation, basket, and checkout controls without invoking destructive actions.

### Task 3: Root-Cause Classification

**Files:**
- Read: `css/sd2-global.css`
- Read: `js/sd2-v2-components.js`
- Read: affected `templates/*.mvt` and `partials/*.mvt`

- [ ] Reproduce each finding consistently on its exact route and viewport.
- [ ] Compare the failing surface with the nearest working canonical V2 component.
- [ ] Identify whether the defect originates in shared CSS, shared JavaScript, MVT markup/data, third-party content, or an external service.
- [ ] Exclude hidden drawers, transformed non-interactive scenery, lazy media outside the viewport, and third-party warnings that do not affect users.

### Task 4: Regression Tests and Minimal Fixes

**Files:**
- Modify: the smallest applicable file under `tests/*.test.js`
- Modify only when proven: `css/sd2-global.css`, `js/sd2-v2-components.js`, affected MVT templates or partials

- [ ] Add one focused assertion reproducing the first confirmed defect.
- [ ] Run the assertion and confirm it fails for the expected missing behavior.
- [ ] Implement the smallest root-cause correction in the canonical component.
- [ ] Run the focused test and the full Node test suite.
- [ ] Repeat the red-green cycle independently for each additional confirmed defect.

### Task 5: Hosted Deployment and Recheck

**Files:**
- Deploy only modified MMT-managed files

- [ ] Run `mmt status` and review the exact deployment set.
- [ ] Push the identified files with a specific release-audit note.
- [ ] Confirm `mmt status` reports `No files modified`.
- [ ] Reload the exact failing URL and viewport in authenticated Chrome.
- [ ] Verify computed styles, rendered geometry, interaction state, overflow, and console health after deployment.

### Task 6: Commerce and Account Release Gate

**Files:**
- Read only through hosted browser state unless a reproducible defect requires Task 4

- [ ] Verify dashboard, order history/detail, addresses, payment, subscriptions, wish lists, rewards, returns, settings, password, and Garage destinations.
- [ ] Verify product selection, quantity controls, add-to-cart, basket totals, coupon field behavior, and checkout navigation using reversible state.
- [ ] Progress checkout only to the final review boundary; do not activate `Place Order`, charge a payment method, or trigger fulfillment.
- [ ] Recheck desktop and mobile layouts for every release-critical commerce and account screen reached.

### Task 7: Final Verification and Publish Decision

**Files:**
- Read: `%TEMP%/sd2-v2-release-20260721/report.json`
- Run: every `tests/*.test.js`

- [ ] Run a fresh full hosted crawl and require zero unexplained runtime errors, page-level horizontal overflow, blank pages, framework overlays, or broken critical interactions.
- [ ] Run the complete local regression suite and require zero failures.
- [ ] Confirm MMT reports no unpublished storefront files.
- [ ] Report tested routes, viewports, interactions, fixes, external limitations, and a clear publish-ready or not-ready decision.
