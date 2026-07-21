# Commerce SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a commerce-first technical SEO foundation for the Sinister Diesel V2 storefront without changing its visual design or Miva commerce behavior.

**Architecture:** Extend the existing shared `cssui-global-head.mvt` pipeline for canonical, robots, social metadata, and global schema, while keeping product/category-specific values in their Miva page contexts. Add source-level regression contracts and rendered-route inspection so dynamic metadata remains valid and private workflows stay out of search indexes.

**Tech Stack:** Miva Merchant Template Language, JSON-LD/schema.org, HTML metadata, Node.js `assert`, MMT deployment, Playwright-based release inspection.

## Global Constraints

- Preserve all existing canonical public URLs.
- Do not alter the V2 design, component geometry, typography, or responsive behavior.
- Do not edit or overwrite unrelated uncommitted work.
- Do not expose API keys, customer details, session cookies, or private page contents in tests or logs.
- Do not submit orders or trigger external financial transactions during verification.
- Keep Miva template syntax compatible with the deployed store and existing MMT workflow.

---

### Task 1: Establish SEO regression contracts

**Files:**
- Create: `tests/v2-commerce-seo.test.js`

**Interfaces:**
- Consumes: shared head markup and V2 storefront/product/category/search templates.
- Produces: a Node test that fails when required metadata, index control, or schema contracts regress.

- [ ] **Step 1: Write the failing SEO contract**

Create a Node assertion test that reads `templates/cssui-global-head.mvt`, `templates/sfntv2.mvt`, `templates/prodv2.mvt`, `templates/ctgyv2.mvt`, `templates/ctgylistv2.mvt`, `templates/ctgyengv2.mvt`, and `templates/srchv2.mvt`. Assert that the shared head contains one canonical decision tree, a `noindex,follow` private-route branch, Open Graph/Twitter metadata, and Organization/WebSite JSON-LD; assert that product and category templates expose dynamic SEO inputs; assert that search is noindexed.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/v2-commerce-seo.test.js
```

Expected: failure on the first missing shared SEO contract.

- [ ] **Step 3: Confirm the test does not encode presentation requirements**

Review the test and ensure it asserts only head markup, schema, encoding, heading count, and indexability. It must not require CSS changes.

- [ ] **Step 4: Commit the failing contract**

```powershell
git add -- tests/v2-commerce-seo.test.js
git commit -m "test: define V2 commerce SEO contracts"
```

### Task 2: Implement shared canonical, robots, and social metadata

**Files:**
- Modify: `templates/cssui-global-head.mvt`

**Interfaces:**
- Consumes: `l.settings:page:code`, `l.settings:product`, `l.settings:category`, `l.settings:urls`, and store context.
- Produces: `g.sd2_seo_canonical`, `g.sd2_seo_title`, `g.sd2_seo_description`, `g.sd2_seo_image`, a single canonical element, route-appropriate robots directive, and share metadata.

- [ ] **Step 1: Define normalized shared SEO values**

Before metadata output, assign the canonical URL by page type: category canonical link for category pages, product canonical link for product/PATR pages, and `_self:auto` for other public pages. Derive product title/description/image from product values, category title/description from category values, and conservative store/page fallbacks for other pages.

- [ ] **Step 2: Add route-level index control**

Create an explicit, delimited private-route code list covering account, authentication, wish list, basket, checkout, order, return workflow, internal search, print, and feed templates. Emit:

```html
<meta name="robots" content="noindex,follow">
```

for those routes and avoid adding a redundant `index,follow` tag to ordinary public pages.

- [ ] **Step 3: Emit canonical and social tags once**

Replace the existing three-branch canonical markup with the normalized canonical value and add `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, optional `og:image`, `twitter:card`, `twitter:title`, `twitter:description`, and optional `twitter:image`. Use Miva entity encoding for every dynamic attribute.

- [ ] **Step 4: Run the SEO contract**

Run:

```powershell
node tests/v2-commerce-seo.test.js
```

Expected: shared metadata assertions pass; schema assertions may still fail until Task 3.

- [ ] **Step 5: Commit shared metadata**

```powershell
git add -- templates/cssui-global-head.mvt tests/v2-commerce-seo.test.js
git commit -m "feat: add shared V2 SEO metadata"
```

### Task 3: Add valid global and commerce structured data

**Files:**
- Modify: `templates/cssui-global-head.mvt`
- Modify: `templates/prodv2.mvt`
- Modify: `tests/v2-commerce-seo.test.js`

**Interfaces:**
- Consumes: normalized SEO values from Task 2 and live product/store fields.
- Produces: Organization/WebSite schema on the storefront and Product/Offer JSON-LD on product pages without fabricated ratings.

- [ ] **Step 1: Add storefront graph**

On the storefront page only, emit a JSON-LD `@graph` containing verified Organization and WebSite entities. Use `https://sinisterdiesel.com/` as the stable entity URL and the live search route for `SearchAction`; do not add unverified local-business properties.

- [ ] **Step 2: Replace product microdata with JSON-LD**

In `prodv2.mvt`, retain the visible product layout but emit one Product JSON-LD entity with dynamic name, canonical URL, description, SKU, optional image, brand, and an Offer containing USD price and live inventory availability. Omit review and aggregate-rating properties.

- [ ] **Step 3: Validate source-level JSON-LD contracts**

Extend the test to assert the required schema types, dynamic Miva values, Offer currency/availability, and absence of `aggregateRating` or placeholder values.

- [ ] **Step 4: Run the SEO test**

```powershell
node tests/v2-commerce-seo.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit structured data**

```powershell
git add -- templates/cssui-global-head.mvt templates/prodv2.mvt tests/v2-commerce-seo.test.js
git commit -m "feat: add V2 commerce structured data"
```

### Task 4: Correct page-specific metadata and semantic headings

**Files:**
- Modify: `templates/sfntv2.mvt`
- Modify: `templates/ctgyv2.mvt`
- Modify: `templates/ctgylistv2.mvt`
- Modify: `templates/ctgyengv2.mvt`
- Modify: `templates/srchv2.mvt`
- Modify: `tests/v2-commerce-seo.test.js`

**Interfaces:**
- Consumes: shared head fallbacks and live category/search data.
- Produces: authoritative commerce titles/descriptions, one H1 per public template path, and explicit noindex behavior for internal search.

- [ ] **Step 1: Add authoritative storefront metadata**

Give `sfntv2.mvt` a concise diesel-performance title and description before the shared head item so social fallbacks use the same messaging.

- [ ] **Step 2: Add category metadata inputs**

For all three V2 category templates, establish category-derived title and normalized description values before invoking the shared head. Preserve existing category canonicals and visible H1 output.

- [ ] **Step 3: Make internal search explicitly non-indexable**

Ensure `srchv2.mvt` receives `noindex,follow` through the shared route rule and keeps one dynamic H1 for query/no-query states.

- [ ] **Step 4: Test heading and metadata paths**

Extend the test to count literal/dynamic H1 paths per template and verify storefront/category descriptions are dynamic or explicit, never empty placeholders.

- [ ] **Step 5: Run SEO and existing regression suites**

```powershell
node tests/v2-commerce-seo.test.js
Get-ChildItem tests\*.test.js | ForEach-Object { node $_.FullName }
```

Expected: all tests print their success messages and exit 0.

- [ ] **Step 6: Commit page-specific SEO changes**

```powershell
git add -- templates/sfntv2.mvt templates/ctgyv2.mvt templates/ctgylistv2.mvt templates/ctgyengv2.mvt templates/srchv2.mvt tests/v2-commerce-seo.test.js
git commit -m "feat: refine V2 commerce page SEO"
```

### Task 5: Audit image and link semantics without changing presentation

**Files:**
- Modify only templates/partials identified by the audit.
- Modify: `tests/v2-commerce-seo.test.js`

**Interfaces:**
- Consumes: rendered V2 image/link markup.
- Produces: descriptive alt text for meaningful imagery, empty alt text for decorative imagery, and destination-specific internal links.

- [ ] **Step 1: Inventory image and generic-link output**

Use `rg` to locate `<img>` tags without `alt`, linked product/editorial images with empty alt text, and ambiguous standalone link labels in the active V2 templates and partials.

- [ ] **Step 2: Correct only confirmed semantic defects**

Add dynamic product/category names to meaningful image alt attributes and `alt=""` to decorative images. Preserve existing classes, dimensions, loading behavior, and visual copy.

- [ ] **Step 3: Add regression assertions for corrected components**

Assert that the corrected active components retain the required alt attributes and descriptive accessible names.

- [ ] **Step 4: Run all tests**

```powershell
Get-ChildItem tests\*.test.js | ForEach-Object { node $_.FullName }
```

Expected: exit 0 for every test.

- [ ] **Step 5: Commit semantic fixes**

Stage only the files confirmed by `git diff --name-only`, then commit:

```powershell
git commit -m "fix: improve V2 commerce content semantics"
```

### Task 6: Deploy and verify rendered SEO output

**Files:**
- Modify only if rendered verification identifies a reproducible SEO defect.

**Interfaces:**
- Consumes: completed source changes and the existing authenticated preview branch.
- Produces: verified live-preview metadata with no visual or commerce regressions.

- [ ] **Step 1: Run final local verification**

```powershell
git diff --check
Get-ChildItem tests\*.test.js | ForEach-Object { node $_.FullName }
mmt status
```

Expected: no whitespace errors, all tests pass, and MMT lists only intended deployable changes plus previously known user work.

- [ ] **Step 2: Push intended Miva files**

```powershell
mmt push --notes "Add commerce-first V2 technical SEO foundation"
```

Expected: MMT reports the intended template files as committed.

- [ ] **Step 3: Inspect representative rendered routes**

Run the existing release inspection against storefront, product, category, editorial, search, account, basket, and checkout routes at desktop and mobile widths. Capture title, meta description, canonical, robots, Open Graph values, JSON-LD parse status, H1 count, broken images, console errors, and horizontal overflow. Do not submit checkout or expose authentication data.

- [ ] **Step 4: Fix only reproducible failures and repeat verification**

For each failure, record the route, rendered evidence, and source owner; add a failing assertion before changing the template. Repeat the affected route and full test suite after the minimal fix.

- [ ] **Step 5: Record final state**

```powershell
mmt status
git status --short
```

Expected: no unpushed SEO template changes; unrelated pre-existing work remains untouched and identifiable.
