const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'templates', 'sfnt.mvt'), 'utf8');

assert.doesNotMatch(
  home,
  /class="sd2-v2-home-intro"/,
  'homepage must not cover first paint with a timed full-screen intro'
);

assert.match(
  home,
  /<img\s+class="sd2-depth-layer"[^>]*fetchpriority="high"[^>]*decoding="async"[^>]*>/,
  'homepage LCP image must be explicitly high priority and asynchronously decoded'
);

console.log('V2 homepage performance contracts verified');
