# PDP Dossier Navigation and Desktop Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair all PDP dossier links and improve the desktop information hierarchy without changing the mobile design.

**Architecture:** Use route-safe product URLs as the server-rendered navigation baseline, then layer a small page-scoped JavaScript enhancement for smooth same-page navigation and active state. Add desktop-only CSS refinements within the existing V2 component system.

**Tech Stack:** Miva Merchant Template Language, CSS, vanilla JavaScript, Node test runner.

## Global Constraints

- Preserve native anchors as a no-JavaScript fallback.
- Do not change product data or FAQ copy.
- Do not increase mobile typography or disrupt horizontal tab scrolling.
- Respect reduced-motion preferences.

---

### Task 1: Lock the navigation regression

**Files:**
- Create: `tests/v2-pdp-dossier-navigation.test.js`
- Test: `templates/prod-product_display.mvt`
- Test: `js/sd2-v2-components.js`
- Test: `css/sd2-global.css`

- [ ] **Step 1: Write a failing source contract**

Assert that all five links use `&mvte:product:link;#...`, that the navigation has a dossier enhancement hook, and that desktop/mobile CSS contracts exist.

- [ ] **Step 2: Verify the test fails for the bare Overview link**

Run: `node --test tests/v2-pdp-dossier-navigation.test.js`

Expected: FAIL because `href="#description"` still exists.

### Task 2: Repair route-safe navigation and interaction

**Files:**
- Modify: `templates/prod-product_display.mvt`
- Modify: `js/sd2-v2-components.js`
- Test: `tests/v2-pdp-dossier-navigation.test.js`

- [ ] **Step 1: Replace bare fragments with product-scoped URLs**

Use `href="&mvte:product:link;#description"` and the equivalent for specifications, installation, reviews, and FAQ. Add `data-v2-pdp-jumpnav` to the navigation.

- [ ] **Step 2: Add progressive same-page behavior**

Initialize each `[data-v2-pdp-jumpnav]` once. For a clicked link whose hash matches a section, prevent the redundant navigation, set `aria-current`, update history, and scroll with reduced-motion awareness. Use an `IntersectionObserver` to keep the active state synchronized while scrolling.

- [ ] **Step 3: Verify the focused test passes**

Run: `node --test tests/v2-pdp-dossier-navigation.test.js`

Expected: PASS.

### Task 3: Refine desktop visual hierarchy

**Files:**
- Modify: `css/sd2-global.css`
- Test: `tests/v2-pdp-dossier-navigation.test.js`

- [ ] **Step 1: Add desktop-only dossier refinements**

At `min-width: 901px`, increase navigation padding, label size, weight, and active-state treatment. Increase the FAQ question/answer scale and preserve comfortable line lengths.

- [ ] **Step 2: Preserve the mobile contract**

At `max-width: 640px`, retain horizontal overflow, compact labels, and the existing section scale.

- [ ] **Step 3: Run focused and full regression tests**

Run: `node --test tests/v2-pdp-dossier-navigation.test.js`

Run: `node --test tests/*.test.js`

Expected: all tests pass.

### Task 4: Deploy and rendered verification

**Files:**
- Deploy: `templates/prod-product_display.mvt`
- Deploy: `js/sd2-v2-components.js`
- Deploy: `css/sd2-global.css`

- [ ] **Step 1: Push only the changed storefront files**

Run: `mmt push --notes "Fix PDP dossier navigation and desktop hierarchy"`

- [ ] **Step 2: Verify desktop and mobile interaction**

Open a V2 product page, click every dossier link, confirm the URL remains on the product route, confirm each section is visible, and inspect active states at desktop and mobile widths.

- [ ] **Step 3: Check console and screenshots**

Confirm no relevant errors or layout regressions and capture final desktop/mobile evidence outside the repository.

