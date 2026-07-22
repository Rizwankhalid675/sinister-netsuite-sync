const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '../css/sd2-global.css'), 'utf8');

assert.match(css,
  /@media\s*\(min-width:901px\)[\s\S]*?#description\.sd2-v3-pdp-narrative\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*\.3fr\)\s+minmax\(0,\s*1fr\)/i,
  'desktop legacy descriptions must reserve more width for the reading column');

assert.match(css,
  /@media\s*\(min-width:901px\)[\s\S]*?#description\s+\.sd2-v2-pdp-copy\s*>\s*:is\(ul,\s*ol\)\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/i,
  'long desktop description lists must use the available editorial width');

console.log('V2 PDP long-description density contracts verified');
