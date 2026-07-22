const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const header = read('templates/global_header.mvt');
assert.match(header, /href="&mvte:urls:ACLN:auto;"[^>]*aria-label="Account"/,
  'live header must route accounts to the configured ACLN page');
assert.match(header, /data-v2-cart-open[^>]*aria-expanded="false"/);
assert.equal((header.match(/aria-modal="true"/g) || []).length, 4,
	'mobile navigation, search, garage, and cart overlays must identify themselves as modal dialogs');

const footer = read('templates/global_footer.mvt');
for (const title of ['Resources', 'Help Center', 'Quick Links']) {
  assert.match(footer, new RegExp(`<h2 class="sd2-v2-footer__col-title">${title}</h2>`));
}
assert.match(footer, /<mvt:item name="head" param="footer_js_dev" \/>/,
  'canonical V2 footer must load development component resources');
assert.match(footer, /<mvt:item name="head" param="footer_js" \/>/,
  'canonical V2 footer must load production component resources');
assert.match(read('templates/ousm.mvt'), /<mvt:item name="head" param="css_list(?:_dev)?" \/>/,
  'order upsell flow must load the V2 stylesheet resources');

const search = read('templates/srchv2.mvt');
for (const route of [
  '/ford-powerstroke-powerstroke-diesel-truck-parts-online.html',
  '/shop-gm-duramax-diesel-parts-sinister-diesel.html',
  '/dodge-cummins-diesel-performance-parts-sinister-diesel.html',
  '/intercoolers-pipes.html',
  '/view-all-filtration-kits.html',
  '/turbos.html'
]) assert.ok(search.includes(route), `search staging page must preserve destination ${route}`);

const home = read('templates/sfntv2.mvt');
assert.ok(!/class="sd2-v2-platform-card[^>]+href="&mvte:urls:CTGYENGV2:auto;"/.test(home),
  'platform cards must not all route to one context-free staging URL');

const js = read('js/sd2-v2-components.js');
assert.match(js, /opener\.setAttribute\('aria-expanded', 'true'\)/);
assert.match(js, /opener\.setAttribute\('aria-expanded', 'false'\); opener\.focus\(\)/);
assert.match(js, /applications\.some\(function \(application\) \{ return applicationMatches\(application, vehicle\); \}\)/,
  'PDP fitment must evaluate real combination-facet applications against Garage');
assert.match(js, /Does not fit your/);
assert.match(js, /Fitment is not confirmed/,
  'missing application data must not be presented as a positive fit');
assert.match(read('templates/prod-product_display.mvt'), /data-v2-product-fitments/);
assert.match(read('templates/prod-product_display-v2.mvt'), /data-v2-product-fitments/);

const css = read('css/sd2-global.css');
for (const darkSurface of [
  'sd2-help-form-shell__rail',
  'sd2-v4-power-journey',
  'sd2-v3-process-card',
  'sd2-v2-fitment-confirm',
  'sd2-v2-buybox',
  'sd2-v2-footer'
]) assert.ok(css.lastIndexOf(darkSurface) > css.indexOf('V2 TYPOGRAPHY CONTRACT'),
  `${darkSurface} needs a final surface-aware contrast override after global typography`);
assert.match(css, /\.sd2-help-form-shell__rail>h2 \{ color:#fff!important;/,
  'help workflow rail headings must remain readable on navy');

// Registered live commerce pages remain the source of truth until copied V2
// page item assignments are completed and verified in Miva Admin.
assert.match(read('templates/prod.mvt'), /<mvt:item name="product_display"\s*\/>/);
assert.match(read('templates/ocst.mvt'), /<mvt:item name="customer"\s*\/>/);
assert.match(read('templates/ocst.mvt'), /<mvt:item name="basket"\s*\/>/);
assert.match(read('templates/acln.mvt'), /<mvt:item name="orderhistory_list"\s*\/>/);

console.log('v2 storefront readiness contracts verified');
