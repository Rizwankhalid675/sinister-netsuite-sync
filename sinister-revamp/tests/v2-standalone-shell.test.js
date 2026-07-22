const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/sd2-global.css');

const standaloneInstallTemplates = [
  'templates/install-hub.mvt',
  'templates/install-tutorials-overview.mvt',
  'templates/install-tutorials-powerstroke.mvt',
  'templates/install-tutorials-duramax.mvt',
  'templates/install-tutorials-cummins.mvt',
  'templates/install-part-overviews.mvt'
];

const standaloneInstallHeaderTemplates = [
  ...standaloneInstallTemplates,
  'templates/install-hub-header.mvt'
];

standaloneInstallTemplates.forEach(file => {
  const template = read(file);
  assert.match(template, /<body class="[^"]*sd2-install-library-page[^"]*">/,
    `${file} must remain in the scoped standalone-install shell family`);
  assert.match(template, /sd2-global\.css\?T=20260722v46/,
    `${file} must use the current standalone-shell stylesheet cache key`);
  assert.match(template, /<script defer src="\/mm5\/scripts\/00000001\/b37\/sd2-v2-components\.js\?T=20260722v46"><\/script>/,
    `${file} must load the shared V2 interaction controller`);
  assert.match(template, /<script defer src="\/mm5\/scripts\/00000001\/b37\/sd2-motion\.js\?T=20260722v46"><\/script>/,
    `${file} must load the shared V2 motion controller`);
});

standaloneInstallHeaderTemplates.forEach(file => {
  const template = read(file);
  const canonicalRoutes = [
    ['home', 'href="/"'],
    ['account', 'href="/customer-account.html"'],
    ['search', 'action="/search.html"'],
    ['order history', 'href="/order-history-list.html"'],
    ['help center', 'href="/help-center.html"'],
    ['basket', 'href="/basket-contents.html"']
  ];

  canonicalRoutes.forEach(([label, markup]) => {
    assert.ok(template.includes(markup), `${file} must use the canonical ${label} route`);
  });

  assert.doesNotMatch(template, /&mvte:urls:(?:SFNT|ACLN|SRCH|ORDH|NEWS|BASK):/,
    `${file} must not depend on page-scoped Miva URL tokens for shared-shell routes`);
});

assert.match(css,
  /body\.sd2-install-library-page\s*\{[^}]*margin:\s*0(?:px)?(?:\s*!important)?\s*;/s,
  'standalone install pages must not inherit the browser default body margin');

assert.match(css,
  /body\.sd2-install-library-page\s+\.sd2-v3-shell\s*>\s*\.sd2-v2-hdr-trust\s*\{(?=[^}]*display:\s*flex\s*!important)(?=[^}]*min-height:\s*36px)[^}]*\}/s,
  'standalone install pages must expose their native trust rail when no ReadyTheme banner item is assigned');

assert.match(css,
  /\.sd2-v2-search-console\s*\{(?=[^}]*visibility:\s*hidden)(?=[^}]*pointer-events:\s*none)[^}]*\}/s,
  'a closed search console must not leak transformed content above the viewport');

assert.match(css,
  /\.sd2-v2-search-console\.is-open\s*\{(?=[^}]*visibility:\s*visible)(?=[^}]*pointer-events:\s*auto)[^}]*\}/s,
  'the open search console must restore visibility and interaction');

console.log('v2 standalone shell contracts verified');
