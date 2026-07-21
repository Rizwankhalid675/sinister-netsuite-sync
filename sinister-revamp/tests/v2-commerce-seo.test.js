const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const head = read('templates/cssui-global-head.mvt');
const storefront = read('templates/sfntv2.mvt');
const product = read('templates/prodv2.mvt');
const search = read('templates/srchv2.mvt');
const installOverview = read('templates/install-part-overviews.mvt');
const categories = [
  'templates/ctgyv2.mvt',
  'templates/ctgylistv2.mvt',
  'templates/ctgyengv2.mvt'
].map((file) => ({ file, source: read(file) }));

assert.match(head, /g\.sd2_seo_canonical/,
  'shared head must normalize the canonical URL before output');
assert.equal((head.match(/<link rel="canonical"/g) || []).length, 1,
  'shared head must emit exactly one canonical element');
assert.match(head, /g\.sd2_seo_private_page_codes/,
  'shared head must maintain an explicit private/transactional route list');
assert.match(head, /<meta name="robots" content="noindex,follow">/,
  'private and transactional routes must emit noindex,follow');

for (const property of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url']) {
  assert.ok(head.includes(`property="${property}"`), `shared head must emit ${property}`);
}
for (const name of ['twitter:card', 'twitter:title', 'twitter:description']) {
  assert.ok(head.includes(`name="${name}"`), `shared head must emit ${name}`);
}

assert.match(head, /"@type":\s*"Organization"/,
  'storefront graph must identify Sinister Diesel as an Organization');
assert.match(head, /Sinister Diesel Performance Parts \| Powerstroke, Duramax .* Cummins/,
  'shared head must keep the active storefront social title commerce-specific');
assert.match(head, /Duramax ' \$ asciichar\(38\) \$ ' Cummins/,
  'storefront social title must emit a literal ampersand rather than a double-encoded entity');
assert.match(head, /"@type":\s*"WebSite"/,
  'storefront graph must describe the public WebSite');
assert.match(head, /"@type":\s*"SearchAction"/,
  'WebSite schema must expose the live site-search action');
assert.match(head, /g\.sd2_seo_search_target/,
  'SearchAction must build a valid target from the active search URL');
assert.doesNotMatch(head, /SRCHV2:auto;\?Search=/,
  'SearchAction must not append a second question mark to Miva search URLs');
assert.match(head, /g\.sd2_seo_page_code EQ 'PATR'[\s\S]*"@type":\s*"Product"/,
  'shared head must emit Product JSON-LD for every active product route');
assert.match(head, /"@type":\s*"BreadcrumbList"/,
  'shared head must emit breadcrumb schema for commerce landing pages');
assert.match(head, /substring\( g\.sd2_seo_description, 1, 197 \)/,
  'shared metadata must cap social and schema descriptions at 200 characters');

assert.match(storefront, /<title>Diesel Performance Parts for Powerstroke, Duramax &amp; Cummins \| Sinister Diesel<\/title>/,
  'storefront must have an authoritative commerce title');
assert.match(storefront, /<meta name="description" content="Shop fitment-first diesel performance parts/,
  'storefront must have an authoritative commerce description');
assert.equal((storefront.match(/<h1\b/g) || []).length, 1,
  'storefront template must expose one primary H1');

for (const { file, source } of categories) {
  assert.match(source, /l\.settings:category:page_title/,
    `${file} must prefer the configured category page title`);
  assert.match(source, /l\.settings:category:stripped_descrip/,
    `${file} must normalize the category description for metadata`);
  assert.match(source, /<meta name="description" content="&mvte:category:stripped_descrip;">/,
    `${file} must expose a category-derived meta description`);
  assert.equal((source.match(/<h1\b/g) || []).length, 1,
    `${file} must expose one primary H1`);
}

assert.match(head, /"@type":\s*"Offer"/,
  'shared product JSON-LD must include an Offer');
assert.match(head, /"priceCurrency":\s*"USD"/,
  'shared product Offer must declare USD');
assert.match(head, /schema\.org\/(?:InStock|OutOfStock)/,
  'shared product Offer must use live inventory availability');
assert.doesNotMatch(head, /aggregateRating/,
  'product schema must not fabricate aggregate ratings');
assert.doesNotMatch(head, /\[Placeholder\]|TBD/,
  'product SEO markup must not contain placeholder data');
assert.doesNotMatch(product, /<script type="application\/ld\+json">/,
  'product template must defer schema to the shared head to prevent duplicate Product entities');

assert.match(head, /\|SRCH\|SRCHV2\|/,
  'internal search routes must be included in shared noindex rules');
assert.equal((search.match(/<h1\b/g) || []).length, 2,
  'search template must provide one mutually exclusive H1 for query and discovery states');

assert.match(installOverview, /<link rel="canonical" href="https:\/\/sinisterdiesel\.com\/install-part-overviews\.html">/,
  'install overview landing page must expose its canonical URL');
assert.match(installOverview, /property="og:title"/,
  'install overview landing page must provide social metadata');

for (const file of [
  'templates/ctgyv2-category_listing.mvt',
  'templates/ctgylistv2-category_listing.mvt',
  'templates/ctgyengv2-category_listing.mvt',
  'templates/srch-search_results.mvt',
  'templates/prod-related_products.mvt',
  'templates/prod-product_display.mvt'
]) {
  const source = read(file);
  assert.match(source, /<img[^>]+alt="&mvte:product:name;"/,
    `${file} must give meaningful product images a dynamic product-name alt`);
  assert.match(source, /class="sd2-v2-product-card__link"[^>]+aria-label="View &mvte:product:name;"/,
    `${file} must give repeated View links a product-specific accessible name`);
}

console.log('V2 commerce SEO contracts verified');
