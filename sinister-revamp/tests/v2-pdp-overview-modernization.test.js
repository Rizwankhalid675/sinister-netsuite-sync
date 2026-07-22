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
  const nav = source.search(/<nav\b[^>]*\bclass="[^"]*\bsd2-v2-product-tabs\b/);
  const overview = source.search(/<section\b[^>]*\bid="description"/);
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

assert.match(css,
  /@media\s*\(max-width:700px\)[\s\S]*?#description\s+\.sd2-v2-pdp-copy\s+table\s*\{[^}]*display:\s*block[^}]*overflow-x:\s*auto/is,
  'legacy Overview tables must scroll within their own mobile container');

console.log('PDP navigation placement and Overview modernization contracts verified');
