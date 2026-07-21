const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const head = read('templates/cssui-global-head.mvt');
const storefront = read('templates/sfntv2.mvt');
const product = read('templates/prodv2.mvt');
const search = read('templates/srchv2.mvt');
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
assert.match(head, /"@type":\s*"WebSite"/,
  'storefront graph must describe the public WebSite');
assert.match(head, /"@type":\s*"SearchAction"/,
  'WebSite schema must expose the live site-search action');

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

assert.match(product, /<script type="application\/ld\+json">[\s\S]*"@type":\s*"Product"/,
  'product template must emit Product JSON-LD');
assert.match(product, /"@type":\s*"Offer"/,
  'product JSON-LD must include an Offer');
assert.match(product, /"priceCurrency":\s*"USD"/,
  'product Offer must declare USD');
assert.match(product, /schema\.org\/(?:InStock|OutOfStock)/,
  'product Offer must use live inventory availability');
assert.doesNotMatch(product, /aggregateRating/,
  'product schema must not fabricate aggregate ratings');
assert.doesNotMatch(product, /\[Placeholder\]|TBD/,
  'product SEO markup must not contain placeholder data');

assert.match(head, /\|SRCH\|SRCHV2\|/,
  'internal search routes must be included in shared noindex rules');
assert.equal((search.match(/<h1\b/g) || []).length, 2,
  'search template must provide one mutually exclusive H1 for query and discovery states');

console.log('V2 commerce SEO contracts verified');
