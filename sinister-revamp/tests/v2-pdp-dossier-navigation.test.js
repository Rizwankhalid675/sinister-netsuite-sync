const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const product = fs.readFileSync(path.join(root, 'templates', 'prod-product_display.mvt'), 'utf8');
const components = fs.readFileSync(path.join(root, 'js', 'sd2-v2-components.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'sd2-global.css'), 'utf8');

const sections = ['description', 'specifications', 'installation', 'reviews', 'faq'];

test('PDP dossier links remain on the current product route', () => {
  assert.match(product, /<nav[^>]+data-v2-pdp-jumpnav[^>]*>/i);

  for (const section of sections) {
    assert.match(
      product,
      new RegExp(`href="&mvte:urls:PROD:auto_sep;Product_Code=&mvta:product:code;#${section}"`),
      `${section} must use Miva's explicit PROD route so an empty product:link cannot resolve through /mm5/`,
    );
  }

  assert.doesNotMatch(
    product,
    /<nav class="sd2-v2-product-tabs[^>]*>[\s\S]*?href="#[^"]+"[\s\S]*?<\/nav>/i,
    'dossier navigation must not contain bare fragment links',
  );
});

test('PDP dossier navigation progressively scrolls and tracks its active section', () => {
  assert.match(components, /querySelectorAll\('\[data-v2-pdp-jumpnav\]'\)/);
  assert.match(components, /history\.pushState\(null,\s*'',\s*window\.location\.pathname\s*\+\s*window\.location\.search\s*\+\s*pair\.link\.hash\)/,
    'history updates must use an origin-relative product URL so Miva basehref cannot resolve them through /mm5/');
  assert.match(components, /aria-current/);
  assert.match(components, /IntersectionObserver/);
  assert.match(components, /prefers-reduced-motion/);
  assert.match(components, /document\.addEventListener\('DOMContentLoaded',\s*initDossierJumpnav/);
  assert.match(components, /document\.addEventListener\('click',[\s\S]*?true\s*\)/,
    'the jumpnav must use delegated capture so late Miva DOM replacement cannot remove the handler');
  assert.match(components, /event\.stopImmediatePropagation\(\)/,
    'the enhanced jumpnav must prevent a second navigation handler from replacing the product route');
  assert.match(components, /window\.location\.href\.split\('#'\)\[0\][\s\S]*?link\.hash/,
    'rendered jump links must inherit the exact live product URL before legacy Miva handlers run');
});

test('desktop dossier hierarchy is stronger without changing the mobile scale', () => {
  assert.match(
    css,
    /@media\s*\(min-width:\s*901px\)[\s\S]*?\.sd2-v3-product-jumpnav a\s*\{[^}]*font-size:\s*clamp\(14px,\s*1\.05vw,\s*16px\)/i,
  );
  assert.match(css, /\.sd2-v3-product-jumpnav a\[aria-current="location"\]/i);
  assert.match(
    css,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.sd2-v3-product-jumpnav a\s*\{[^}]*font-size:\s*12px/i,
  );
});
