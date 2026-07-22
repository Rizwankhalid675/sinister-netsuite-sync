const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'templates', 'install-instructions.mvt'), 'utf8');

for (const hook of ['data-v2-install-page', 'data-v2-install-library', 'data-v2-install-accordions']) {
  assert.ok(source.includes(hook), `missing stable ${hook} hook`);
}

for (const integration of [
  "Runtime_CategoryProductList_Load_Query",
  "Category_Code: categoryCode",
  "Runtime_CategoryProductList_Load_Query",
  "merchant.mvc?Screen=PROD&Product_Code=",
  "extractFirstPdfFromHtml",
  "extractVideoIdFromHtml",
  "sdInstallAssetCache_v1",
  "BRAND_CATEGORIES"
]) {
  assert.ok(source.includes(integration), `lost install-library integration: ${integration}`);
}

assert.match(source, /id="sdInstallSearch"[^>]*type="search"/);
assert.match(source, /class="sd-acc__btn"[^>]*aria-expanded="false"/);
assert.match(source, /btn\.setAttribute\('aria-expanded','true'\)/);
assert.match(source, /btn\.setAttribute\('aria-expanded','false'\)/);
assert.match(source, /@media \(max-width:600px\)/, 'page needs a narrow-screen card fallback');
assert.match(source, /@media \(prefers-reduced-motion:reduce\)/, 'page needs a reduced-motion fallback');
assert.doesNotMatch(source, /<script[^>]+src=/, 'custom behavior must remain zero-dependency');

console.log('v2 install instructions: template verified');
