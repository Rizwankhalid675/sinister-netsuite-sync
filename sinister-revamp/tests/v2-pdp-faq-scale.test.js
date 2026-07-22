const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '../css/sd2-global.css'), 'utf8');

assert.match(
  css,
  /@media\s*\(min-width:901px\)[\s\S]*?\.sd2-v2-pdp\s+#faq\s+\.sd2-v2-accordion__trigger\s*\{(?=[^}]*min-height:\s*72px)(?=[^}]*padding:\s*20px\s+24px)(?=[^}]*font-size:\s*clamp\(18px,1\.35vw,21px\))[^}]*\}/,
  'desktop PDP FAQ rows must use the balanced supporting-content scale'
);

assert.match(
  css,
  /\.sd2-v2-pdp\s+#faq\s+\.sd2-v2-accordion__panel\s+p\s*\{(?=[^}]*font-size:\s*16px)(?=[^}]*line-height:\s*1\.6)[^}]*\}/,
  'desktop PDP FAQ answers must remain readable without competing with headings'
);

console.log('V2 PDP FAQ desktop scale contracts verified');
