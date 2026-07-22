const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../templates/shipping-policies.mvt'), 'utf8');

assert.match(source, /data-v2-editorial-page/);
assert.match(source, /data-editorial-variant="shipping-policy"/);
assert.match(source, /data-v2-shipping-policy/);
assert.match(source, /data-v2-policy-content/);
assert.match(source, /aria-labelledby="shipping-policy-title"/);

for (const required of [
  'Order processing time',
  'Shipping Protection, Risk of Loss & Claims Policy',
  'Free Shipping Policy',
  'UPS Ground Transit Time Map',
  "image( 'shipping_map' )",
  'help-check-order-status.html',
  'help-shipping-protection-requests.html'
]) {
  assert.ok(source.includes(required), `shipping policy must preserve ${required}`);
}

assert.doesNotMatch(source, /navigationset\(\s*'static_navigation'\s*\)/);

console.log('shipping policy V2 template verified');
