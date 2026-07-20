# V2 Editorial Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize the eleven remaining legacy content pages on a responsive V2 editorial layout without changing their live content sources or integrations.

**Architecture:** Add a shared editorial component family to `css/sd2-global.css`, then mark each Miva template with a purpose-specific variant. Preserve all Miva items and third-party integrations while removing duplicated legacy sidebars and constraining generated content.

**Tech Stack:** Miva Merchant templates, ReadyTheme content sections, CSS, Node-based static regression checks, Playwright Chromium visual verification.

## Global Constraints

- Preserve all existing legal copy, links, live Miva output, forms, reviews, videos, and third-party scripts.
- Preserve the V2 global header and footer.
- Do not modify unrelated working-tree changes.
- Verify desktop and mobile layouts.

---

### Task 1: Add static regression coverage

**Files:**
- Create: `tests/v2-editorial-pages.test.js`

**Interfaces:**
- Consumes: affected Miva templates and shared CSS.
- Produces: a zero-dependency Node regression command for page variants, removed legacy sidebars, and preserved integrations.

- [ ] Write assertions for every scoped template, required variant, preserved dynamic item, and prohibited legacy sidebar.
- [ ] Run `node tests/v2-editorial-pages.test.js` and confirm it fails against the current templates.
- [ ] Keep the failing output as the red phase evidence.

### Task 2: Implement the shared editorial CSS system

**Files:**
- Modify: `css/sd2-global.css`

**Interfaces:**
- Consumes: `data-v2-editorial-page` and `data-editorial-variant` template attributes.
- Produces: shared hero clearance, prose, directory, embed, media, dynamic-content, and responsive rules.

- [ ] Add tokens and structural rules scoped to the editorial page attributes.
- [ ] Add typography and generated-markup normalization without altering third-party iframe internals.
- [ ] Add tablet/mobile breakpoints and reduced-motion-safe behavior.

### Task 3: Migrate prose and directory templates

**Files:**
- Modify: `templates/salerestr.mvt`
- Modify: `templates/policies-terms-conditions.mvt`
- Modify: `templates/race-parts-notice.mvt`
- Modify: `templates/smap.mvt`
- Modify: `templates/sinister-notice.mvt`

**Interfaces:**
- Consumes: shared editorial CSS variants.
- Produces: semantic single-column prose and full-width directory pages.

- [ ] Apply prose or directory variant attributes and page-specific hooks.
- [ ] Remove duplicated `static_navigation` sidebars.
- [ ] Preserve sequence, navigation-set, sitemap, and ReadyTheme content-section items exactly.

### Task 4: Migrate embed and media templates

**Files:**
- Modify: `templates/dlrq.mvt`
- Modify: `templates/mildisc.mvt`
- Modify: `templates/rewards.mvt`

**Interfaces:**
- Consumes: shared embed and media-guide variants.
- Produces: responsive Monday/Klaviyo surfaces and constrained rewards media.

- [ ] Apply the embed/media variants.
- [ ] Restructure dealer instructions into the shared workflow surface while preserving the PDF and Monday URLs.
- [ ] Preserve the Klaviyo script/form identifier and rewards sequence output.

### Task 5: Normalize dynamic and campaign templates

**Files:**
- Modify: `templates/blog.mvt`
- Modify: `templates/customer-reviews.mvt`
- Modify: `templates/spons.mvt`

**Interfaces:**
- Consumes: shared blog, reviews, and campaign compatibility rules.
- Produces: legible dynamic results and stable sponsor-page spacing.

- [ ] Add stable variant hooks around existing live output.
- [ ] Remove the reviews legacy About sidebar while preserving the Shopper Approved content section.
- [ ] Preserve Scots Blogger metadata/items and sponsor form content section.

### Task 6: Verify implementation

**Files:**
- Test: `tests/v2-editorial-pages.test.js`
- Create temporarily, then remove: visual QA artifacts under `scratch/`

**Interfaces:**
- Consumes: completed templates and CSS.
- Produces: static test output and desktop/mobile screenshot evidence.

- [ ] Run `node tests/v2-editorial-pages.test.js` and confirm all assertions pass.
- [ ] Run available repository validation commands and inspect the full diff.
- [ ] Render representative prose, directory, embed, dynamic, and campaign fixtures in Playwright at desktop and mobile sizes.
- [ ] Inspect screenshots for header clearance, overflow, hierarchy, responsive collapse, and footer separation.
- [ ] Remove temporary QA artifacts and report any intentional limitations.
