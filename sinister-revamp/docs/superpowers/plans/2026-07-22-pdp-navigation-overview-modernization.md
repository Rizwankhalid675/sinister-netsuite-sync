# PDP Navigation and Overview Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place the existing product dossier navigation before Product Overview and modernize legacy merchant-authored description content without changing that content or commerce behavior.

**Architecture:** Preserve the current Miva product templates and `&mvt:product:descrip;` data source. Make one structural reorder in both product-display templates, then add a final, narrowly scoped CSS normalization layer under `#description .sd2-v2-pdp-copy` so legacy inline presentation cannot leak into the rest of V2.

**Tech Stack:** Miva Merchant templates, CSS, Node.js contract tests, MMT preview deployment, Playwright visual verification.

## Global Constraints

- Keep the product hero, fitment panel, gallery, purchase console, and downstream sections unchanged.
- Preserve all merchant-authored Product Overview text and media.
- Preserve existing jump links, active-section tracking, sticky behavior, and responsive navigation styling.
- Do not alter pricing, attributes, quantity, wishlist, or add-to-cart behavior.
- Scope legacy-content normalization to `#description .sd2-v2-pdp-copy`.

---

### Task 1: Lock the navigation and content-normalization contracts

**Files:**
- Create: `tests/v2-pdp-overview-modernization.test.js`

**Interfaces:**
- Consumes: `.sd2-v2-product-tabs`, `#description`, and `.sd2-v2-pdp-copy` from the product templates.
- Produces: Regression coverage for template order and scoped CSS selectors.

- [ ] **Step 1: Write the failing contract test**

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const templates = [
  'templates/prod-product_display.mvt',
  'templates/prod-product_display-v2.mvt'
];

for (const file of templates) {
  const source = read(file);
  const nav = source.indexOf('<nav class="sd2-v2-product-tabs"');
  const overview = source.indexOf('<section class="sd2-v2-pdp-section" id="description"');
  assert.ok(nav > -1 && overview > -1 && nav < overview,
    `${file} must place dossier navigation before Product Overview`);
  assert.equal((source.match(/&mvt:product:descrip;/g) || []).length, 1,
    `${file} must preserve the merchant-authored description source exactly once`);
}

const css = read('css/sd2-global.css');
for (const selector of [
  '#description .sd2-v2-pdp-copy',
  '#description .sd2-v2-pdp-copy img',
  '#description .sd2-v2-pdp-copy table',
  '#description .sd2-v2-pdp-copy :is(iframe,video)'
]) assert.ok(css.includes(selector), `missing scoped Overview contract: ${selector}`);

console.log('PDP navigation placement and Overview modernization contracts verified');
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node tests/v2-pdp-overview-modernization.test.js`

Expected: FAIL because the navigation follows `#description` and the final scoped media/table selectors do not exist.

### Task 2: Move the dossier navigation before Product Overview

**Files:**
- Modify: `templates/prod-product_display.mvt`
- Modify: `templates/prod-product_display-v2.mvt`
- Test: `tests/v2-pdp-overview-modernization.test.js`

**Interfaces:**
- Consumes: Existing navigation markup and fragment URLs.
- Produces: Unchanged `.sd2-v2-product-tabs` markup immediately before `#description`.

- [ ] **Step 1: Move the existing navigation block in both templates**

Move the existing navigation block in each template without changing its class list, data attributes, links, or conditions. The registered product-display template's block is:

```mvt
<nav class="sd2-v2-product-tabs" aria-label="Product information">
  <a href="#specifications">Specifications</a>
  <mvt:if expr="NOT ISNULL l.settings:product:customfield_values:customfields:installation"><a href="#installation">Installation</a></mvt:if>
  <mvt:if expr="g.at_least_one_video"><a href="#videos">Videos</a></mvt:if>
  <a href="#reviews">Reviews</a><a href="#related-products">Related Products</a>
</nav>
```

The next element must be:

```mvt
<section class="sd2-v2-pdp-section" id="description" aria-labelledby="sd2-v2-summary-title">
```

- [ ] **Step 2: Run navigation regression tests**

Run: `node tests/v2-pdp-dossier-navigation.test.js && node tests/v2-final-site-audit.test.js`

Expected: PASS; all fragment URLs and active-section behavior remain intact.

### Task 3: Modernize legacy Product Overview presentation

**Files:**
- Modify: `css/sd2-global.css`
- Test: `tests/v2-pdp-overview-modernization.test.js`

**Interfaces:**
- Consumes: Arbitrary merchant HTML rendered inside `#description .sd2-v2-pdp-copy`.
- Produces: Responsive V2 prose, media, list, table, and embed presentation without DOM rewriting.

- [ ] **Step 1: Add the final scoped CSS normalization layer**

Append a named PDP Overview contract that:

```css
.sd2-v2-pdp #description .sd2-v2-pdp-copy {
  display:flow-root;
  width:100%;
  color:var(--sd2-text-mid);
  font-family:var(--sd2-font-body)!important;
  font-size:clamp(16px,1.15vw,18px)!important;
  line-height:1.72!important;
}
.sd2-v2-pdp #description .sd2-v2-pdp-copy > :is(p,ul,ol,h2,h3,h4,blockquote) {
  max-width:76ch;
}
.sd2-v2-pdp #description .sd2-v2-pdp-copy :is(h1,h2,h3,h4,h5,h6) {
  color:var(--sd2-text)!important;
  font-family:var(--sd2-font-display)!important;
  font-weight:600!important;
  line-height:1!important;
  letter-spacing:-.025em!important;
  text-wrap:balance;
}
.sd2-v2-pdp #description .sd2-v2-pdp-copy img {
  display:block;
  max-width:100%!important;
  height:auto!important;
  margin:clamp(24px,4vw,48px) auto;
  border-radius:18px;
  object-fit:contain;
}
.sd2-v2-pdp #description .sd2-v2-pdp-copy table {
  display:table;
  width:100%!important;
  max-width:100%;
  border-collapse:separate;
  border-spacing:0;
  overflow:hidden;
  border:1px solid var(--sd2-border);
  border-radius:16px;
}
.sd2-v2-pdp #description .sd2-v2-pdp-copy :is(iframe,video) {
  display:block;
  width:100%!important;
  max-width:100%;
  aspect-ratio:16/9;
  height:auto!important;
  border:0;
  border-radius:18px;
}
.sd2-v2-pdp #description .sd2-v2-pdp-copy :is(ul,ol) {
  display:grid;
  gap:10px;
  margin:20px 0 28px;
  padding-left:24px;
}
.sd2-v2-pdp #description .sd2-v2-pdp-copy a {
  color:var(--sd2-blue)!important;
  font-weight:650;
  text-decoration-thickness:1px;
  text-underline-offset:3px;
}
.sd2-v2-pdp #description .sd2-v2-pdp-copy figure {
  max-width:100%;
  margin:clamp(28px,5vw,56px) 0;
}
.sd2-v2-pdp #description .sd2-v2-pdp-copy :is(th,td) {
  padding:14px 16px!important;
  border:0!important;
  border-bottom:1px solid var(--sd2-border)!important;
  color:var(--sd2-text-mid)!important;
  font-family:var(--sd2-font-body)!important;
  font-size:15px!important;
  line-height:1.5!important;
  text-align:left;
}
.sd2-v2-pdp #description .sd2-v2-pdp-copy th {
  background:#eef3fb;
  color:var(--sd2-text)!important;
  font-weight:750!important;
}
@media (max-width:700px) {
  .sd2-v2-pdp #description .sd2-v2-pdp-copy { overflow-wrap:anywhere; }
  .sd2-v2-pdp #description .sd2-v2-pdp-copy img,
  .sd2-v2-pdp #description .sd2-v2-pdp-copy :is(iframe,video) { border-radius:12px; }
  .sd2-v2-pdp #description .sd2-v2-pdp-copy table {
    display:block;
    overflow-x:auto;
    -webkit-overflow-scrolling:touch;
  }
}
```

- [ ] **Step 2: Run the new contract test**

Run: `node tests/v2-pdp-overview-modernization.test.js`

Expected: PASS.

### Task 4: Deploy and verify representative live products

**Files:**
- Verify: `templates/prod-product_display.mvt`
- Verify: `templates/prod-product_display-v2.mvt`
- Verify: `css/sd2-global.css`

**Interfaces:**
- Consumes: Preview-branch Miva rendering and the current preview session.
- Produces: Live evidence that template order, content preservation, typography, and responsive media are correct.

- [ ] **Step 1: Run the complete local regression suite**

Run every `tests/*.test.js` file with Node.

Expected: All test files pass.

- [ ] **Step 2: Push only MMT-managed changes**

Run: `mmt status`

Expected: only the two product-display templates and `css/sd2-global.css` are listed.

Run: `mmt push --notes "Move PDP dossier nav and modernize legacy Overview content"`

Expected: listed files are committed to the preview branch.

- [ ] **Step 3: Verify desktop and mobile renderings**

Use the active preview cookies with Playwright because the Browser plugin is unavailable. Check at least one long air-intake description and one product containing a table or embedded media at `1440x1000` and `390x844`.

Expected:

- The dossier navigation appears between purchase area and Overview.
- All stored description text and media remain present.
- No horizontal overflow, broken images, HTTP errors, or console errors.
- Jump navigation and active states still work.
- Add to Cart, quantity, and wishlist controls remain unchanged.

- [ ] **Step 4: Confirm deployment state**

Run: `mmt status`

Expected: `No files modified`.
