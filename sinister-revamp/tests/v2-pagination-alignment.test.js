const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'sd2-global.css'), 'utf8');
const marker = 'V40: Left-Aligned Catalog Pagination';
const markerIndex = css.lastIndexOf(marker);

assert.notEqual(markerIndex, -1,
  'the final cascade must contain an authoritative catalog-pagination alignment layer');

const alignment = css.slice(markerIndex);

assert.match(alignment,
  /\.page-links\.sd2-v2-pagination\s*\{(?=[^}]*justify-content:\s*flex-start!important)(?=[^}]*width:\s*100%!important)(?=[^}]*padding-inline:\s*16px!important)[^}]*\}/s,
  'every native and rollup catalog paginator must align its controls to the left of the shared full-width rail');
assert.match(alignment,
  /\.page-links\.sd2-v2-pagination\s+\.page-links-title\s*\{(?=[^}]*position:\s*static!important)(?=[^}]*transform:\s*none!important)[^}]*\}/s,
  'the Page(s) label must remain in flow beside the left-aligned controls');
assert.match(alignment,
  /\.page-links\.sd2-v2-pagination\s+:is\(\.page-links-container,\.page-disp\)\s*\{(?=[^}]*justify-content:\s*flex-start!important)[^}]*\}/s,
  'nested native pagination wrappers must use the same left alignment as rollup pagination');
assert.match(alignment,
  /@media\s*\(max-width:\s*680px\)[\s\S]*?\.page-links\.sd2-v2-pagination\s*\{(?=[^}]*justify-content:\s*flex-start!important)(?=[^}]*padding-inline:\s*10px!important)[^}]*\}/s,
  'compact pagination must preserve the same left alignment with tighter rail padding');

console.log('V2 catalog pagination alignment contracts verified');
