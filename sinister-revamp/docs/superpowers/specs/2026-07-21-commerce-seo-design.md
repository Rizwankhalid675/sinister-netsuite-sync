# Commerce SEO Design

## Objective

Improve organic visibility and search-result quality for Sinister Diesel product and category pages while preserving the approved V2 design, existing URLs, Miva commerce behavior, pricing, inventory, fitment, and third-party integrations.

The primary success criterion is a technically sound, crawlable commerce catalog whose metadata and structured data are derived from live Miva records. Editorial and local-search expansion are outside this implementation pass.

## Scope

This pass covers:

- Product, category, storefront, editorial, blog, search, account, basket, checkout, and utility template indexing behavior.
- Page titles, meta descriptions, canonical URLs, robots directives, Open Graph metadata, and Twitter card metadata.
- Product, Offer, BreadcrumbList, Organization, WebSite, and SearchAction structured data where the underlying page data supports each type.
- Heading hierarchy, internal-link semantics, image alternative text, and duplicate metadata checks.
- Automated source-level tests and rendered-page verification on representative public and private routes.

This pass does not cover:

- URL migrations, redirects, taxonomy redesign, navigation redesign, or visual layout changes.
- Fabricated reviews, ratings, availability, prices, business facts, or keywords.
- New editorial landing pages, backlink campaigns, local listings, paid search, or analytics strategy.
- Changes to checkout, payment, fitment, inventory, pricing, or order behavior.

## Architecture

### Shared SEO foundation

The existing shared head pipeline remains the source of canonical and common metadata behavior. Reusable logic belongs in the global head or a narrowly scoped shared SEO partial/resource, following the patterns already used by the active Miva templates. Page templates retain responsibility for page-specific values such as product names, category descriptions, and editorial summaries.

Metadata must be emitted exactly once per rendered document. Page-specific metadata takes precedence over generic fallbacks. Dynamic values must use Miva's context-aware encoding appropriate to HTML attributes or JSON.

### Public commerce pages

Product pages receive dynamic title, description, canonical, share image, and Product/Offer schema derived from the active Miva product record. Price, currency, SKU, URL, availability, image, and description are included only when their source values exist and are valid. No review or aggregate-rating schema is emitted unless verified review data is present in the rendered Miva context.

Category pages receive dynamic title, description, canonical, social metadata, a single descriptive H1, and breadcrumb schema. Faceted or parameterized views canonicalize to the base category unless an existing, intentional indexable landing page has its own canonical record.

The storefront receives Organization and WebSite schema, including SearchAction only when the target URL matches the live Miva search route. Static/editorial pages use their explicit titles and descriptions with shared social fallbacks.

### Index control

Public product, category, storefront, policy, guide, and editorial pages remain indexable unless an existing business rule says otherwise.

Account, login, password, wish-list management, basket, checkout, order, return workflow, internal search-result, print, feed, and other customer-specific or transactional pages emit `noindex,follow`. Canonicals must not make private or transactional URLs appear indexable.

Robots directives are template-driven rather than dependent on CSS classes or JavaScript. Existing `robots.txt` behavior is audited but is not used as a substitute for page-level `noindex`.

### Structured data

Structured data uses JSON-LD and valid schema.org types. Each graph is derived from rendered page data and must pass JSON parsing after Miva expansion. The implementation avoids duplicate Product or Organization entities when an existing integration already renders an equivalent valid entity.

Breadcrumb items use canonical public URLs. Product Offer availability reflects live inventory state. Organization facts are limited to verified company data already present on the site.

### Content and accessibility signals

Each indexable page has one primary H1. Subsequent headings follow a logical hierarchy without changing visual styling. Linked images and meaningful product/editorial images receive descriptive alternative text; decorative imagery uses an empty `alt` value. Link text must describe its destination without altering established calls to action unnecessarily.

## Data Flow and Fallbacks

1. The active Miva page supplies page, product, category, store, URL, image, price, inventory, and custom-field data.
2. Page-specific templates establish SEO values when authoritative data exists.
3. Shared head logic fills only missing generic metadata and emits the canonical/robots/social elements once.
4. Structured-data builders omit unavailable optional properties rather than outputting empty or placeholder values.
5. HTML and JSON values are encoded for their output contexts.

Product descriptions are stripped of HTML and normalized for metadata. A concise product-name-and-brand fallback is used only when no usable description exists. Category metadata uses the configured category SEO fields first, then the category description, then a conservative category-name fallback.

## Safety Constraints

- Preserve all existing canonical public URLs.
- Do not alter the V2 design, component geometry, typography, or responsive behavior.
- Do not edit or overwrite unrelated uncommitted work.
- Do not expose API keys, customer details, session cookies, or private page contents in tests or logs.
- Do not submit orders or trigger external financial transactions during verification.
- Keep Miva template syntax compatible with the deployed store and existing MMT workflow.

## Verification

Automated tests will assert:

- Indexable representative templates contain a title, description, canonical, and exactly one H1 path.
- Transactional and internal-search templates emit `noindex,follow`.
- Product and category metadata use dynamic Miva values and safe fallbacks.
- JSON-LD blocks contain the required schema types and no placeholder data.
- Canonical and social URL fields do not use customer-specific query strings.
- Existing V2 release and presentation tests continue to pass.

Rendered verification will cover representative storefront, category, product, editorial, search, account, basket, and checkout pages at desktop and mobile widths. The audit will inspect source output, document head, heading order, canonical URL, robots directive, schema parsing, broken images, console errors, and horizontal overflow. Public validation tools may be used for rendered markup, but they will not receive authenticated pages or secrets.

## Completion Criteria

The SEO pass is complete when:

- Shared metadata and index-control rules are consistent across active templates.
- Representative public pages expose valid canonical metadata and appropriate structured data.
- Private and transactional routes are excluded from indexing.
- Automated SEO and existing regression tests pass.
- Rendered desktop/mobile checks show no design or commerce regression.
- MMT reports only the intended SEO files before deployment, and the pushed result is verified on the live preview branch.
