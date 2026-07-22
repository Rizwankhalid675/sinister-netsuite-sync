const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/sd2-global.css');
const template = read('templates/ous1.mvt');

assert.match(css, /V2 CHECKOUT OFFER POLISH/,
  'the checkout offer polish must live in a final, auditable cascade layer');
assert.match(css, /#js-OUS1 \.sd2-v6-upsell__hero h1[^{]*\{[^}]*-webkit-text-fill-color:\s*#071426!important/s,
  'the desktop offer headline must remain high contrast on the light canvas');
assert.match(css, /#js-OUS1 \.sd2-v6-upsell__stage[^{]*\{[^}]*box-shadow:\s*0 30px 80px/s,
  'the offer stage must retain the premium V2 depth treatment');
assert.match(css, /#js-OUS1 \.sd2-v6-upsell__actions form:last-child :is\(input\[type="submit"\],button\)[^{]*\{[^}]*background:\s*#f7f9fc!important/s,
  'the decline action must remain visually secondary');
assert.match(css, /#js-OUS1 \.sd2-v6-upsell__actions form:first-child :is\(input\[type="submit"\],button\):hover[^{]*\{[^}]*transform:\s*translateY\(-2px\)/s,
  'the primary action must provide restrained premium hover feedback');
assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?#js-OUS1 \.sd2-v6-upsell__hero h1[^{]*\{[^}]*font-size:\s*clamp\(38px,12vw,48px\)/s,
  'the polished headline must remain responsive on phones');

assert.match(template, /name="Action" value="AUPR"/,
  'the native Miva add-to-order action must remain intact');
assert.match(template, /<mvt:item name="buttons" param="AddToOrder" \/>/,
  'the native Miva add button must remain intact');
assert.match(template, /<mvt:item name="buttons" param="DoNotAddToOrder" \/>/,
  'the native Miva decline button must remain intact');

console.log('v2 checkout offer premium contracts verified');
