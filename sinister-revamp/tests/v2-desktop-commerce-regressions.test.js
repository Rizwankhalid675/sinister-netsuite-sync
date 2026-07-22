const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const components = read('js/sd2-v2-components.js');
const css = read('css/sd2-global.css');

assert.match(
  components,
  /empty\.setAttribute\(['"]role['"],\s*['"]status['"]\)[\s\S]*?empty\.setAttribute\(['"]aria-live['"],\s*['"]polite['"]\)/,
  'header search fallback must announce changing search status accessibly'
);
assert.match(
  components,
  /function\s+hasProviderResults\s*\([^)]*\)[\s\S]*?function\s+showSearchFallback\s*\([^)]*\)[\s\S]*?No instant matches[\s\S]*?Press Search/,
  'header search must provide a useful fallback when autocomplete supplies no results'
);
assert.match(
  components,
  /window\.setTimeout\(showSearchFallback,\s*\d+\)/,
  'header search fallback must wait briefly for an autocomplete provider before replacing the searching state'
);
assert.match(
  components,
  /new MutationObserver\([\s\S]*?hasProviderResults\(\)[\s\S]*?empty\.hidden\s*=\s*true/,
  'autocomplete results must suppress the fallback instead of competing with provider content'
);
assert.match(
  components,
  /form\.addEventListener\(['"]submit['"],\s*function\s*\(\)/,
  'native search submission must remain intact'
);

const lognGuard = css.lastIndexOf('LOGN DESKTOP HERO FIT GUARD');
assert.ok(lognGuard >= 0, 'LOGN must have a final scoped desktop heading-fit guard');
assert.match(
  css.slice(lognGuard),
  /#js-LOGN\s+\.sd2-v2-auth__panel\s+\.sd2-v2-account-hero\s*\{[^}]*padding-inline:\s*clamp\(28px,2\.25vw,36px\)[^}]*\}/,
  'LOGN login/create hero cards must reserve enough inline room for their headings'
);
assert.match(
  css.slice(lognGuard),
  /#js-LOGN\s+\.sd2-v2-auth__panel\s+\.sd2-v2-account-hero\s+h1\s*\{(?=[^}]*max-width:\s*100%)(?=[^}]*font-size:\s*clamp\(44px,3vw,52px\))[^}]*\}/,
  'LOGN login/create hero headings must use a desktop scale that fits their cards'
);

console.log('v2 desktop commerce regressions: search fallback and LOGN heading fit verified');
