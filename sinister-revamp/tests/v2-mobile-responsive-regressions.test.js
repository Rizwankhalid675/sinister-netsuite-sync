const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/sd2-global.css');
const components = read('js/sd2-v2-components.js');
const headerFiles = [
  'templates/global_header.mvt',
  'templates/cssui-global-header.mvt',
  'templates/cssui-global-header-v2.mvt'
];

for (const file of headerFiles) {
  const header = read(file);
  assert.match(
    header,
    /<button class="sd2-v2-hdr__mobile-search"[^>]*data-v2-search-open[^>]*aria-label="Search"[^>]*>/i,
    `${file} must expose the existing search console from the compact header`
  );
}

assert.match(
  css,
  /@media\s*\(max-width:\s*960px\)[\s\S]*?\.sd2-v2-hdr__mobile-search\s*\{(?=[^}]*display:\s*inline-flex)(?=[^}]*width:\s*44px)(?=[^}]*height:\s*44px)[^}]*\}/i,
  'the mobile search trigger must be visible and retain a 44px target through tablet width'
);
assert.match(
  css,
  /@media\s*\(max-width:\s*380px\)[\s\S]*?\.sd2-v2-hdr__row\s*\{(?=[^}]*padding-inline:\s*8px)(?=[^}]*gap:\s*4px)[^}]*\}[\s\S]*?\.sd2-v2-hdr__garage\s*\{[^}]*display:\s*none[^}]*\}[\s\S]*?\.sd2-v3-shell \.sd2-v2-hdr__logo\s*\{[^}]*min-width:\s*0[^}]*\}[\s\S]*?\.sd2-v2-hdr__logo img\s*\{[^}]*max-width:\s*80px[^}]*\}/i,
  'the 320px header must reserve enough width for menu, search, account, and cart controls'
);
assert.match(
  css,
  /@media\s*\(max-width:\s*520px\)[\s\S]*?\.sd2-v3-shell \.sd2-v2-hdr__logo\s*\{[^}]*min-width:\s*96px[^}]*\}[\s\S]*?\.sd2-v2-hdr__logo img\s*\{[^}]*max-width:\s*96px[^}]*\}/i,
  'the 390px header must compact the logo before clipping utility controls'
);

assert.match(
  components,
  /function\s+setDialogInteractive\(dialog,\s*interactive\)[\s\S]*?toggleAttribute\('inert',\s*!interactive\)[\s\S]*?data-v2-stored-tabindex[\s\S]*?setAttribute\('tabindex',\s*'-1'\)/i,
  'closed drawers must use inert with a tabindex fallback'
);
assert.match(
  components,
  /setDialogInteractive\(drawer,\s*false\)[\s\S]*?function\s+openDrawer[\s\S]*?setDialogInteractive\(drawer,\s*true\)[\s\S]*?function\s+closeDrawer[\s\S]*?setDialogInteractive\(drawer,\s*false\)/i,
  'mobile navigation descendants must only be interactive while open'
);
assert.match(
  components,
  /setDialogInteractive\(panel,\s*false\)[\s\S]*?function\s+open\(toggle\)[\s\S]*?setDialogInteractive\(panel,\s*true\)[\s\S]*?function\s+close\(\)[\s\S]*?setDialogInteractive\(panel,\s*false\)/i,
  'cart drawer descendants must only be interactive while open'
);
assert.match(
  components,
  /function\s+closeCompetingPanels\(\)[\s\S]*?setDialogInteractive\(dialog,\s*false\)/i,
  'opening Garage must make any competing navigation or cart drawer inert again'
);

assert.match(
  css,
  /@media\s*\(max-width:\s*1040px\)[\s\S]*?body\.sd2-filter-sheet-open \.grecaptcha-badge\s*\{[^}]*bottom:\s*calc\(93px\s*\+\s*env\(safe-area-inset-bottom\)\)!important[^}]*\}/i,
  'the required reCAPTCHA badge must clear the fixed mobile filter action'
);
assert.doesNotMatch(
  css,
  /body\.sd2-filter-sheet-open \.grecaptcha-badge\s*\{[^}]*(?:display:\s*none|visibility:\s*hidden|opacity:\s*0)/i,
  'the filter-sheet collision fix must not hide required reCAPTCHA branding'
);

assert.match(
  css,
  /\.sd2-v2-cart-vehicle a\s*\{(?=[^}]*display:\s*inline-flex)(?=[^}]*min-width:\s*44px)(?=[^}]*min-height:\s*44px)[^}]*\}/i,
  'the empty-cart Add action must provide a 44px target'
);
assert.match(
  css,
  /\.sd2-v2-product-card__link\s*\{(?=[^}]*flex-basis:\s*44px!important)(?=[^}]*width:\s*44px!important)(?=[^}]*height:\s*44px!important)[^}]*\}/i,
  'product-card detail arrows must provide a 44px target at the end of the cascade'
);

assert.match(
  css,
  /@media\s*\(max-width:\s*380px\)[\s\S]*?\.sd2-v3-hero-data > div\s*\{(?=[^}]*grid-template-columns:\s*72px\s+minmax\(0,1fr\))(?=[^}]*padding-inline:\s*12px)[^}]*\}[\s\S]*?\.sd2-v3-hero-data strong\s*\{(?=[^}]*overflow:\s*visible)(?=[^}]*text-overflow:\s*clip)(?=[^}]*white-space:\s*normal)[^}]*\}/i,
  '320px category facts must preserve complete values instead of ellipsizing them'
);

console.log('V2 mobile responsive regression contracts verified');
