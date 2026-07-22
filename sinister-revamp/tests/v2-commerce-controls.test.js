const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/sd2-global.css'), 'utf8');
const components = fs.readFileSync(path.join(root, 'js/sd2-v2-components.js'), 'utf8');
const categoryListings = [
  'templates/ctgy-category_listing.mvt',
  'templates/layout_ctgy-category_listing.mvt',
  'templates/ctgyv2-category_listing.mvt',
  'templates/ctgyengv2-category_listing.mvt',
  'templates/ctgylistv2-category_listing.mvt'
].map((file) => ({ file, source: fs.readFileSync(path.join(root, file), 'utf8') }));
const stickyTemplate = fs.readFileSync(path.join(root, 'templates/sd2-v2-sticky-buy-bar.mvt'), 'utf8');

assert.match(stickyTemplate, /class="sd2-btn sd2-btn--primary"/, 'sticky purchase action must use the shared primary button');

assert.match(
  css,
  /\.sd2-btn\s*\{[^}]*border-radius:\s*6px[^}]*font-family:\s*var\(--sd2-font-display\)[^}]*font-size:\s*15px[^}]*text-transform:\s*uppercase/is,
  'the shared V2 button must use the approved squared geometry and visible display typography'
);

assert.match(
  css,
  /--sd2-button-text-size:\s*15px[\s\S]*?:is\(\.sd2-btn,\.sd2-v2-button,\.c-button,input\[type="submit"\],button\[type="submit"\]\):not\(\.sd2-btn--compact\)\s*\{[^}]*border-radius:\s*6px[^}]*font-family:\s*var\(--sd2-font-display\)[^}]*font-size:\s*var\(--sd2-button-text-size\)[^}]*text-transform:\s*uppercase/is,
  'the final canonical-button layer must preserve the display typography contract across V2 pages'
);

assert.doesNotMatch(
  css,
  /\.sd2-v2-sticky-buy>\.sd2-btn\s*\{[^}]*border-radius:\s*12px/i,
  'sticky purchase action must not restore the obsolete 12px capsule radius'
);
assert.doesNotMatch(
  css,
  /\.sd2-btn\s*\{[^}]*border-radius:\s*999px/i,
  'the shared V2 button must not be restored to pill geometry by a later polish layer'
);

assert.match(
  css,
  /\.sd2-v2-pdp \.sd2-v2-sticky-buy>\.sd2-btn\s*\{[^}]*font-family:\s*var\(--sd2-font-display\)[^}]*font-size:\s*15px[^}]*text-transform:\s*uppercase/is,
  'sticky purchase action must use visible V2 display-button typography'
);

assert.match(
  css,
  /\.sd2-v2-pdp \.sd2-v2-sticky-buy>div strong\s*\{[^}]*font-family:\s*var\(--sd2-font-display\)/is,
  'sticky product title must use the V2 display face'
);

assert.match(
  css,
  /\.sd2-v2-pdp \.sd2-v2-sticky-buy>\.sd2-btn:is\(:hover,:focus-visible\)\s*\{[^}]*background:\s*#fff[^}]*color:\s*#07101f/is,
  'sticky action must retain its high-contrast white treatment on interaction'
);

const interactionContract = css.lastIndexOf('V2 INTERACTION COLOR CONTRACT');
const stickyInteractionGuard = css.lastIndexOf('The compact PDP purchase bar is intentionally');
assert.ok(
  stickyInteractionGuard > interactionContract,
  'sticky purchase interaction guard must follow the global primary-button interaction contract'
);
assert.match(
  css.slice(stickyInteractionGuard),
  /\.sd2-v2-pdp \.sd2-v2-sticky-buy > \.sd2-btn:is\(:hover,:focus-visible,:active\)[^{]*\{[^}]*background:\s*#fff[^}]*color:\s*#07101f!important/is,
  'final sticky interaction guard must prevent the global blue hover/active state'
);

assert.match(
  css,
  /@media\s*\(max-width:\s*560px\)[\s\S]*?\.sd2-v2-pdp\s+\.sd2-v2-sticky-buy\.is-visible\s*\{(?=[^}]*width:\s*min\(460px,calc\(100%\s*\+\s*16px\)\))(?=[^}]*max-width:\s*calc\(100vw\s*-\s*24px\))[^}]*\}/is,
  'mobile sticky purchase bar must compensate for the padded PDP containing block without leaving the viewport'
);

assert.match(
  css,
  /@media\s*\(max-width:\s*360px\)[\s\S]*?\.sd2-v2-pdp\s+\.sd2-v2-sticky-buy\.is-visible\s*\{[^}]*grid-template-columns:\s*1fr/is,
  'very narrow PDPs must stack sticky product details and purchase action instead of collapsing the title column'
);
assert.ok(
  css.lastIndexOf('V2 PDP FINAL NARROW GUARD') > css.lastIndexOf('grid-template-columns:minmax(0,1fr) auto;'),
  'the very-narrow sticky guard must follow the general mobile two-column rule in the cascade'
);

assert.match(
  css,
  /\.klaviyo-close-form\s*\{(?=[^}]*display:\s*inline-flex)(?=[^}]*padding:\s*0\s+18px)(?=[^}]*border:\s*0!important)(?=[^}]*border-radius:\s*6px!important)(?=[^}]*font-family:\s*var\(--sd2-font-display\)!important)[^}]*\}/is,
  'Klaviyo No Thanks action must use the canonical V2 button geometry and typography'
);

assert.match(
  css,
  /\.klaviyo-close-form\s+:is\(span,div\)\s*\{[^}]*border:\s*0!important[^}]*outline:\s*0!important/is,
  'Klaviyo dismiss action must remove the nested third-party text outline'
);

assert.match(
  css,
  /\[data-sd2-rollup-product\]\[hidden\]\s*\{[^}]*display:\s*none\s*!important/is,
  'client-paginated descendant categories must remove hidden product cards from layout'
);

assert.match(
  components,
  /function\s+paginationTargets\s*\([^)]*\)[\s\S]*?currentPage\s*-\s*1[\s\S]*?currentPage\s*\+\s*1/is,
  'large descendant categories must render a compact pagination window around the current page'
);
assert.doesNotMatch(
  components,
  /for\s*\(var\s+page\s*=\s*1;\s*page\s*<=\s*pages;\s*page\s*\+=\s*1\)/is,
  'rollup pagination must not render one control for every category page'
);
assert.match(
  components,
  /setAttribute\(['"]aria-current['"],\s*['"]page['"]\)/is,
  'rollup pagination must identify the current page to assistive technology'
);

for (const { file, source } of categoryListings) {
  assert.match(
    source,
    /product:price\s+GT\s+0[\s\S]*?sd2-v2-price__current[\s\S]*?Choose options/is,
    `${file} must not advertise configurable zero-base-price products as $0.00`
  );
  assert.match(
    source,
    /product:price\s+GT\s+0[\s\S]*?<form[\s\S]*?<mvt:else>[\s\S]*?Choose Options/is,
    `${file} must route zero-base-price products to configuration instead of direct add-to-basket`
  );
}
assert.match(
  css,
  /\.sd2-v2-price__current--configure\s*\{(?=[^}]*font-family:\s*var\(--sd2-font-body\))(?=[^}]*font-size:\s*15px)(?=[^}]*letter-spacing:\s*0)[^}]*\}/is,
  'the configurable-price label must read as supporting copy rather than a dollar amount'
);

console.log('v2 commerce controls: sticky purchase typography and button geometry verified');
