const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '../css/sd2-global.css'), 'utf8');

for (const selector of [
  '#reviews .sd2-v2-review-summary::after',
  '#installation .sd2-v2-feature-list strong',
  '.sd2-v2-spec-table th'
]) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(css,
    new RegExp(`${escaped}\\s*\\{[^}]*font-size:\\s*11px`, 'i'),
    `${selector} must meet the V2 readable technical-label floor`);
}

console.log('V2 PDP readable technical-label contracts verified');
