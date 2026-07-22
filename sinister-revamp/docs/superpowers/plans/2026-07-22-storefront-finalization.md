# Sinister Diesel V2 Storefront Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Correct verified navigation, interaction, semantic, and responsive defects across the active V2 storefront without changing its visual design or commerce behavior.

**Architecture:** Keep Miva Merchant as the rendering and commerce engine. Apply narrowly scoped template/JavaScript corrections, protect each behavior with source-contract or browser regression tests, and publish only the files tracked by MMT. Known inactive placeholders are outside this release unless a rendered active route proves they are reachable.

**Tech Stack:** Miva templates, vanilla JavaScript, shared V2 CSS, Node test runner, Playwright, MMT.

## Global Constraints

- Preserve Miva forms, URL tokens, basket attributes, pricing, checkout, and business logic.
- Preserve the approved V2 visual system; fixes may improve consistency and accessibility but may not redesign pages.
- Do not place test artifacts or screenshots in the repository.
- Do not modify unrelated user files or MMT state.
- Do not place real orders or perform irreversible production transactions.
- Every production correction requires a failing regression test first.

### Task 1: Correct active account navigation

**Files:**
- Modify: `templates/acln.mvt`
- Modify: `partials/sd2-v2-account-dashboard.mvt`
- Modify: `partials/sd2-v2-account-quick-actions.mvt`
- Test: `tests/account-address-routing.test.js`

- [ ] Add a source-contract test proving all account dashboard/listing links use the live CABK address-list route rather than ACAD.
- [ ] Run the focused test and confirm it fails for the existing incorrect links.
- [ ] Replace only the incorrect address-list URL tokens.
- [ ] Run the focused test and the full suite.

### Task 2: Repair active-page semantics and interaction contracts

**Files:**
- Modify: `templates/install-hub.mvt`
- Modify: `templates/bask.mvt`
- Modify: `templates/blog-content.mvt`
- Modify: `templates/sfnt.mvt`
- Modify: `js/sd2-motion.js`
- Modify: `js/sd2-v2-components.js`
- Test: `tests/storefront-interaction-integrity.test.js`

- [ ] Add focused failing contracts for unique IDs, meaningful controls/links, correctly paired form labels, valid comment-form structure, and associated/roving tabs.
- [ ] Remove the duplicate install-hub anchor ID while preserving the hero destination.
- [ ] Convert the shipping-protection close hotspot to a semantic button and label/protect the policy link.
- [ ] Give blog reply/comment fields unique label targets, valid nesting, and keyboard-operable reply toggles without changing submission data.
- [ ] Associate homepage tab controls and panels and synchronize inactive panel accessibility state.
- [ ] Make PDP tabs use roving `tabindex` while preserving existing panel switching.
- [ ] Run focused and full tests.

### Task 3: Validate and correct rendered responsive regressions

**Files:**
- Modify only active templates/CSS/JavaScript implicated by reproducible browser failures.
- Test: `tests/rendered-storefront-contract.test.js` or a focused existing browser harness.

- [ ] Reproduce every desktop/mobile agent finding on the branch preview.
- [ ] Add a failing automated assertion for each reproducible repository-owned defect.
- [ ] Apply the smallest V2-consistent fix.
- [ ] Verify representative homepage, category, product, basket/checkout, help, blog, and account routes at desktop and mobile widths.

### Task 4: Release verification and deployment

- [ ] Run all Node tests and any browser regression scripts.
- [ ] Check MMT status and review the exact diff for unrelated changes.
- [ ] Push the verified files to the preview branch with a precise MMT note.
- [ ] Re-run smoke tests against the published preview.
- [ ] Run a final whole-branch review and resolve any Critical or Important findings.
- [ ] Commit only intentional repository changes and report verified remaining external blockers separately.
