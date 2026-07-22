const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

function element(text = '') {
  return {
    children: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    dataset: {},
    events: {},
    hidden: false,
    style: { setProperty() {} },
    textContent: text,
    addEventListener(type, listener) { this.events[type] = listener; },
    getAttribute(name) { return this.attributes && this.attributes[name]; },
    setAttribute(name, value) { this.attributes = this.attributes || {}; this.attributes[name] = value; },
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function exerciseStaleProviderClear() {
  const empty = element('Start typing to see parts, categories, and guides.');
  const results = element();
  results.children = [empty];
  const input = element();
  const form = element();
  const consoleElement = element();
  const scrim = element();
  const header = element();
  header.getBoundingClientRect = () => ({ bottom: 100 });
  const root = element();
  root.querySelector = selector => ({
    '.sd2-v2-search-console': consoleElement,
    '.sd2-v2-search-scrim': scrim,
    '[data-v2-search-input]': input,
    'form': form,
    '[data-v2-search-empty]': empty,
    '.sd2-v2-search-console__results': results
  }[selector] || null);

  let timerId = 0;
  const timers = new Map();
  const window = {
    addEventListener() {},
    clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem() { return '[]'; }, setItem() {} },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }
  };
  const document = {
    body: { style: {} },
    addEventListener() {},
    querySelector(selector) {
      if (selector === '[data-v2-search]') return root;
      if (selector === '.sd2-v2-hdr') return header;
      return null;
    },
    querySelectorAll() { return []; }
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(target) { target.notifyMutation = () => this.callback([{ type: 'childList' }]); }
  }

  const start = components.indexOf('/* Search Console open/close');
  const end = components.indexOf('/* Live listing layout guard', start);
  assert.ok(start >= 0 && end > start, 'shared search controller must be extractable for behavioral testing');
  vm.runInNewContext(components.slice(start, end), { Array, Boolean, JSON, MutationObserver, document, window });

  input.value = 'query A';
  input.events.input();
  results.children.push(element('Provider result A'));
  results.notifyMutation();
  assert.equal(empty.hidden, true, 'provider result A should suppress the fallback');

  input.value = 'query B';
  input.events.input();
  results.children = [empty];
  results.notifyMutation();
  for (const callback of [...timers.values()]) callback();

  return { empty, timers };
}

const staleProviderClear = exerciseStaleProviderClear();
assert.equal(staleProviderClear.empty.hidden, false,
  'clearing stale results for a new query must restart the visible fallback state');
assert.equal(staleProviderClear.empty.textContent, 'No instant matches. Press Search to view all results.',
  'a new query with no provider response must finish on the accessible fallback copy');

console.log('v2 desktop commerce regressions: search fallback and LOGN heading fit verified');
