const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'templates', 'sfnt.mvt'), 'utf8');
const header = fs.readFileSync(path.join(root, 'templates', 'cssui-global-header.mvt'), 'utf8');
const head = fs.readFileSync(path.join(root, 'templates', 'cssui-global-head.mvt'), 'utf8');
const fontPreconnect = fs.readFileSync(path.join(root, 'css', 'preconnect-google-fonts.json'), 'utf8');
const googleFonts = fs.readFileSync(path.join(root, 'css', 'google-fonts.json'), 'utf8');
const themeStyles = fs.readFileSync(path.join(root, 'css', 'theme-styles.css'), 'utf8');
const components = fs.readFileSync(path.join(root, 'js', 'sd2-v2-components.js'), 'utf8');

assert.doesNotMatch(
  home,
  /class="sd2-v2-home-intro"/,
  'homepage must not cover first paint with a timed full-screen intro'
);

assert.match(
  home,
  /<img\s+class="sd2-depth-layer"[^>]*fetchpriority="high"[^>]*decoding="async"[^>]*width="1774"[^>]*height="887"[^>]*>/,
  'homepage LCP image must be explicitly high priority, asynchronously decoded, and intrinsically sized'
);

assert.match(
  header,
  /<img\s+src="&mvte:readytheme:logo_image;"\s+alt="&mvt:readytheme:logo_alt;"\s+width="2400"\s+height="876">/,
  'shared header logo must reserve its intrinsic aspect ratio'
);

const scrollHandler = components.match(/var onScroll = function \(\) \{([^}]*)\};/);
assert.ok(scrollHandler, 'shared header must retain its passive sticky scroll handler');
assert.doesNotMatch(
  scrollHandler[1],
  /getBoundingClientRect\(\)/,
  'sticky scroll handler must not force synchronous layout measurement'
);

assert.equal(
  (head.match(/Module_Code=mvga&amp;Filename=mvga\.js/g) || []).length,
  1,
  'shared head must load the Miva Google Analytics runtime only once'
);

assert.doesNotMatch(
  head,
  /cdn\.jsdelivr\.net\/npm\/slick-carousel/,
  'shared head must use the bundled carousel styles instead of duplicate CDN stylesheets'
);

assert.match(
  head,
  /<mvt:if expr="'PROD' CIN toupper\( l\.settings:page:code \) OR toupper\( l\.settings:page:code \) EQ 'PATR'">[\s\S]*?pro\.ip-api\.com[\s\S]*?<\/mvt:if>/,
  'the synchronous geolocation lookup must only run on product routes that consume its result'
);

assert.match(
  head,
  /g\.sd2_seo_page_code EQ 'SFNTV2?'[\s\S]*?<link rel="preload" as="image" href="https:\/\/sinisterdiesel\.com\/mm5\/graphics\/00000001\/8\/Generated%20image%201\.png" fetchpriority="high">/,
  'the homepage LCP image must be discoverable from the shared head'
);

const parsedFontPreconnect = JSON.parse(fontPreconnect);
assert.ok(
  parsedFontPreconnect.attributes.some((attribute) => attribute.name === 'crossorigin'),
  'the Google Fonts asset preconnect must include crossorigin'
);

const parsedGoogleFonts = JSON.parse(googleFonts);
assert.ok(
  parsedGoogleFonts.attributes.some((attribute) => attribute.name === 'media' && attribute.value === 'print'),
  'the remote font stylesheet must not block first paint'
);
assert.ok(
  parsedGoogleFonts.attributes.some((attribute) => attribute.name === 'onload' && /this\.media='all'/.test(attribute.value)),
  'the remote font stylesheet must activate after its non-blocking load'
);
assert.equal(
  (themeStyles.match(/@font-face\s*\{[\s\S]*?font-display:\s*swap;[\s\S]*?\}/g) || []).length,
  5,
  'all five legacy storefront faces must allow immediate fallback text'
);

console.log('V2 homepage performance contracts verified');
