const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/sd2-global.css');
const js = read('js/sd2-v2-components.js');
const basket = read('templates/bask-basket.mvt');
const basketPage = read('templates/bask.mvt');
const upsell = read('templates/ous1.mvt');
const coreScripts = read('js/core_scripts.js');
const coreScriptsLegacy = read('js/core_scripts_no_integrety.js');

assert.match(basket, /name="Action" value="QTYG"[\s\S]*?data-v2-qty-minus[\s\S]*?data-v2-qty-plus/,
  'full basket must retain native Miva QTYG controls');
assert.match(js, /requestSubmit\(submitter\)/,
  'quantity controller must use requestSubmit with the native update submitter');
assert.doesNotMatch(js, /function step\(delta\)[\s\S]*?form\.submit\(\)/,
  'quantity controller must not bypass the native submit event with form.submit()');

assert.match(coreScripts, /if \(!currentModal\) \{\s*return;\s*\}/,
  'legacy shipping estimator must tolerate the V2 basket intentionally omitting its modal');
assert.match(coreScriptsLegacy, /if \(!currentModal\) \{\s*return;\s*\}/,
  'alternate core bundle must carry the same null-safe shipping estimator guard');
assert.doesNotMatch(basketPage, /"(?:AddedItemProductName|ProductName)":\s*"&mvt:(?:added_product|item):name;"/,
  'basket analytics must not inject raw catalog names into JavaScript strings');
assert.match(basketPage, /"AddedItemProductName":\s*"&mvtj:added_product:name;"/,
  'added-product analytics name must use Miva JavaScript-string encoding');
assert.match(basketPage, /"ProductName":\s*"&mvtj:item:name;"/,
  'basket item analytics names must use Miva JavaScript-string encoding');
assert.match(basketPage, /window\._learnq\s*=\s*window\._learnq\s*\|\|\s*\[\];\s*window\._learnq\.push/s,
  'basket analytics must queue safely when the Klaviyo library is delayed or unavailable');
assert.doesNotMatch(basketPage, /assigned_categories" value="'\[\\"'"/,
  'basket analytics category arrays must not begin with a duplicate quote');
assert.match(basketPage, /foreach iterator="category" array="global:assigned_categories">\s*<mvt:if expr="POS2 GT 1">/s,
  'nested basket category arrays must use their actual foreach depth when adding commas');

assert.match(js, /data-v2-cart-qty-minus/,
  'mini-cart renderer must expose a decrease quantity control');
assert.match(js, /data-v2-cart-qty-plus/,
  'mini-cart renderer must expose an increase quantity control');
assert.match(js, /payload\.set\('Action', 'QTYG'\)/,
  'mini-cart updates must use the native Miva QTYG action');
assert.match(js, /Basket_Group/,
  'mini-cart updates must preserve the live basket group identifier');
assert.match(js, /requestUrl\.searchParams\.set\('ajax', '1'\)/,
  'drawer hydration must request the compact Miva mini-basket fragment');

assert.match(css, /V2 COMMERCE FLOW REPAIR/,
  'commerce repair rules must live in a final, auditable cascade layer');
assert.match(css, /:is\([^)]*\.sd2-v2-checkout[^)]*\)[\s\S]*?:is\(input:not/,
  'native checkout fields must be included in the scoped commerce control layer');
assert.match(css, /\.sd2-v3-shell \.sd2-v2-mega__panel[^{]*\{(?=[^}]*max-width:)(?=[^}]*max-height:)[^}]*\}/s,
  'mega-menu panel must be constrained in both dimensions');
assert.match(css, /\.sd2-v2-cart-panel \.sd2-v2-cart-qty[^{]*\{[^}]*grid-template-columns:\s*44px\s+minmax\(44px,1fr\)\s+44px/s,
  'mini-cart quantity controls must expose three stable 44px targets');
assert.match(css, /\.sd2-v2-cart-item \.sd2-v2-qty\[data-v2-qty\] input\[type="number"\][^{]*\{[^}]*appearance:\s*textfield!important/s,
  'full-cart quantity inputs must suppress the browser number spinner');
assert.match(css, /\.sd2-v2-cart-item \.sd2-v2-qty\[data-v2-qty\] input\[type="number"\]::-webkit-inner-spin-button[^{]*\{[^}]*display:\s*none/s,
  'full-cart quantity inputs must suppress the Chromium number spinner');
assert.match(css, /\.sd2-v2-cart-item \.sd2-v2-qty\[data-v2-qty\]:has\(\.sd2-v2-qty__update\)[^{]*\{[^}]*grid-template-columns:\s*44px\s+64px\s+44px\s+minmax\(100px,auto\)/s,
  'full-cart quantity and update actions must share stable aligned columns');
assert.match(css, /:focus-visible[^{]*\{[^}]*outline:\s*3px solid/s,
  'commerce controls must retain a visible keyboard focus outline');
assert.match(css, /\.sd2-v2-checkout input\[type="radio"\][^{]*\{(?=[^}]*width:\s*20px!important)(?=[^}]*height:\s*20px!important)[^}]*\}/s,
  'native checkout radios must not inherit oversized legacy input dimensions');
assert.match(css, /#js-OSEL \.sd2-v2-checkout input\[type="radio"\][^{]*\{[^}]*appearance:\s*none!important[^}]*border-radius:\s*50%!important/s,
  'checkout radios must render as consistent circular controls');
assert.match(css, /#js-OSEL \.sd2-v2-checkout input\[type="radio"\]:checked::before[^{]*\{[^}]*transform:\s*scale\(1\)/s,
  'selected checkout radios must expose a clear inner-dot state');
assert.match(css, /\.page-links\.sd2-v2-pagination[^{]*\{(?=[^}]*width:\s*100%!important)(?=[^}]*overflow:\s*hidden!important)[^}]*\}/s,
  'long catalog pagination must remain inside its listing container');
assert.match(css, /\.sd2-v2-account \.sd2-v2-order-action[^{]*\{[^}]*min-width:\s*132px/s,
  'order-history actions must not clip their labels');
assert.match(css, /#js-OUS1 \.sd2-v6-upsell__console h2[^{]*\{[^}]*font-size:\s*clamp\(28px,3vw,44px\)/s,
  'special-offer product name must use the compact responsive type scale');
assert.match(css, /#js-OUS1 \.sd2-v6-upsell__console h2[^{]*\{[^}]*-webkit-text-fill-color:\s*#07101f/s,
  'special-offer product name must remain dark on the white console');
assert.match(css, /#js-OUS1 \.sd2-v6-upsell__actions form:first-child[^{]*\{[^}]*background:\s*#2049df!important[^}]*color:\s*#fff!important/s,
  'special-offer primary action must retain a visible blue fill and white label');
assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.sd2-v6-upsell__visual[^{]*\{[^}]*min-height:\s*300px/s,
  'special-offer visual must remain compact on phones');
assert.match(upsell, /aria-live="polite"/,
  'special-offer savings must be exposed as a coherent live value');

console.log('v2 commerce flow repair contracts verified');
