const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/sd2-global.css');
const components = read('js/sd2-v2-components.js');
const headerFiles = [
  'templates/global_header.mvt',
  'templates/cssui-global-header.mvt',
  'templates/cssui-global-header-v2.mvt'
];

for (const file of headerFiles) {
  const header = read(file);
  assert.match(
    header,
    /<button class="sd2-v2-hdr__mobile-search"[^>]*data-v2-search-open[^>]*aria-label="Search"[^>]*>/i,
    `${file} must expose the existing search console from the compact header`
  );
}

assert.match(
  css,
  /@media\s*\(max-width:\s*960px\)[\s\S]*?\.sd2-v2-hdr__mobile-search\s*\{(?=[^}]*display:\s*inline-flex)(?=[^}]*width:\s*44px)(?=[^}]*height:\s*44px)[^}]*\}/i,
  'the mobile search trigger must be visible and retain a 44px target through tablet width'
);
assert.match(
  css,
  /@media\s*\(max-width:\s*380px\)[\s\S]*?\.sd2-v2-hdr__row\s*\{(?=[^}]*padding-inline:\s*8px)(?=[^}]*gap:\s*4px)[^}]*\}[\s\S]*?\.sd2-v2-hdr__garage\s*\{[^}]*display:\s*none[^}]*\}[\s\S]*?\.sd2-v3-shell \.sd2-v2-hdr__logo\s*\{[^}]*min-width:\s*0[^}]*\}[\s\S]*?\.sd2-v2-hdr__logo img\s*\{[^}]*max-width:\s*80px[^}]*\}/i,
  'the 320px header must reserve enough width for menu, search, account, and cart controls'
);
assert.match(
  css,
  /@media\s*\(max-width:\s*520px\)[\s\S]*?\.sd2-v3-shell \.sd2-v2-hdr__logo\s*\{[^}]*min-width:\s*96px[^}]*\}[\s\S]*?\.sd2-v2-hdr__logo img\s*\{[^}]*max-width:\s*96px[^}]*\}/i,
  'the 390px header must compact the logo before clipping utility controls'
);

assert.match(
  components,
  /function\s+setDialogInteractive\(dialog,\s*interactive\)[\s\S]*?toggleAttribute\('inert',\s*!interactive\)[\s\S]*?data-v2-stored-tabindex[\s\S]*?setAttribute\('tabindex',\s*'-1'\)/i,
  'closed drawers must use inert with a tabindex fallback'
);
assert.match(
  components,
  /setDialogInteractive\(drawer,\s*false\)[\s\S]*?function\s+openDrawer[\s\S]*?setDialogInteractive\(drawer,\s*true\)[\s\S]*?function\s+closeDrawer[\s\S]*?setDialogInteractive\(drawer,\s*false\)/i,
  'mobile navigation descendants must only be interactive while open'
);
assert.match(
  components,
  /setDialogInteractive\(panel,\s*false\)[\s\S]*?function\s+open\(toggle\)[\s\S]*?setDialogInteractive\(panel,\s*true\)[\s\S]*?function\s+close\(\)[\s\S]*?setDialogInteractive\(panel,\s*false\)/i,
  'cart drawer descendants must only be interactive while open'
);
assert.match(
  components,
  /function\s+closeCompetingPanels\(\)[\s\S]*?setDialogInteractive\(dialog,\s*false\)/i,
  'opening Garage must make any competing navigation or cart drawer inert again'
);

assert.match(
  css,
  /@media\s*\(max-width:\s*1040px\)[\s\S]*?body\.sd2-filter-sheet-open \.grecaptcha-badge\s*\{[^}]*bottom:\s*calc\(93px\s*\+\s*env\(safe-area-inset-bottom\)\)!important[^}]*\}/i,
  'the required reCAPTCHA badge must clear the fixed mobile filter action'
);
assert.doesNotMatch(
  css,
  /body\.sd2-filter-sheet-open \.grecaptcha-badge\s*\{[^}]*(?:display:\s*none|visibility:\s*hidden|opacity:\s*0)/i,
  'the filter-sheet collision fix must not hide required reCAPTCHA branding'
);

assert.match(
  css,
  /\.sd2-v2-cart-vehicle a\s*\{(?=[^}]*display:\s*inline-flex)(?=[^}]*min-width:\s*44px)(?=[^}]*min-height:\s*44px)[^}]*\}/i,
  'the empty-cart Add action must provide a 44px target'
);
assert.match(
  css,
  /\.sd2-v2-product-card__link\s*\{(?=[^}]*flex-basis:\s*44px!important)(?=[^}]*width:\s*44px!important)(?=[^}]*height:\s*44px!important)[^}]*\}/i,
  'product-card detail arrows must provide a 44px target at the end of the cascade'
);

assert.match(
  css,
  /@media\s*\(max-width:\s*380px\)[\s\S]*?\.sd2-v3-hero-data > div\s*\{(?=[^}]*grid-template-columns:\s*72px\s+minmax\(0,1fr\))(?=[^}]*padding-inline:\s*12px)[^}]*\}[\s\S]*?\.sd2-v3-hero-data strong\s*\{(?=[^}]*overflow:\s*visible)(?=[^}]*text-overflow:\s*clip)(?=[^}]*white-space:\s*normal)[^}]*\}/i,
  '320px category facts must preserve complete values instead of ellipsizing them'
);

function behavioralElement(classes = [], attributes = {}) {
  const classNames = new Set(classes);
  const attrs = { ...attributes };
  return {
    children: [],
    dataset: {},
    events: {},
    hidden: false,
    parentElement: null,
    style: {},
    textContent: '',
    classList: {
      add(...names) { names.forEach(name => classNames.add(name)); },
      remove(...names) { names.forEach(name => classNames.delete(name)); },
      contains(name) { return classNames.has(name); },
      toggle(name, force) {
        const enabled = force === undefined ? !classNames.has(name) : force;
        enabled ? classNames.add(name) : classNames.delete(name);
        return enabled;
      }
    },
    addEventListener(type, listener) { this.events[type] = listener; },
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
    contains(node) {
      for (let current = node; current; current = current.parentElement) {
        if (current === this) return true;
      }
      return false;
    },
    focus() { behavioralDocument.activeElement = this; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    matches(selector) {
      if (selector === '.sd2-v2-cart-drawer') return classNames.has('sd2-v2-cart-drawer');
      if (selector === '.sd2-v2-cart-panel') return classNames.has('sd2-v2-cart-panel');
      if (selector === '[data-v2-drawer]') return Object.prototype.hasOwnProperty.call(attrs, 'data-v2-drawer');
      if (selector === '[data-v2-garage-toggle]') return Object.prototype.hasOwnProperty.call(attrs, 'data-v2-garage-toggle');
      return false;
    },
    closest(selector) {
      for (let current = this; current; current = current.parentElement) {
        if (current.matches && current.matches(selector)) return current;
      }
      return null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    removeAttribute(name) { delete attrs[name]; },
    setAttribute(name, value) { attrs[name] = String(value); },
    toggleAttribute(name, force) {
      const enabled = force === undefined ? !Object.prototype.hasOwnProperty.call(attrs, name) : force;
      if (enabled) attrs[name] = '';
      else delete attrs[name];
      return enabled;
    }
  };
}

let behavioralDocument;
function exerciseCartToGarageTransition() {
  const cartRoot = behavioralElement(['sd2-v2-cart-drawer']);
  const cartPanel = behavioralElement(['sd2-v2-cart-panel', 'is-open'], { 'aria-hidden': 'false' });
  const cartScrim = behavioralElement(['sd2-v2-cart-scrim', 'is-open']);
  const cartTrigger = behavioralElement([], { 'data-v2-cart-open': '', 'aria-expanded': 'true' });
  const cartGarageAdd = behavioralElement([], { 'data-v2-garage-toggle': '' });
  cartPanel.appendChild(cartGarageAdd);
  cartRoot.appendChild(cartPanel);
  cartRoot.querySelector = selector => selector === '.sd2-v2-cart-panel' ? cartPanel : null;
  cartPanel.querySelectorAll = () => [cartGarageAdd];

  const garageRoot = behavioralElement();
  const garagePanel = behavioralElement(['sd2-v2-garage-panel'], { 'aria-hidden': 'true' });
  const garageScrim = behavioralElement(['sd2-v2-garage-scrim']);
  const garageClose = behavioralElement();
  garagePanel.appendChild(garageClose);
  garagePanel.querySelector = () => garageClose;
  const form = behavioralElement();
  const make = behavioralElement();
  const engine = behavioralElement();
  const year = behavioralElement();
  const cardEmpty = behavioralElement();
  const cardName = behavioralElement();
  const cardSpec = behavioralElement();
  const savedWrap = behavioralElement();
  const savedList = behavioralElement();
  const garageParts = {
    '.sd2-v2-garage-panel': garagePanel,
    '.sd2-v2-garage-scrim': garageScrim,
    '[data-v2-garage-form]': form,
    '[data-v2-garage-field="make"]': make,
    '[data-v2-garage-field="engine"]': engine,
    '[data-v2-garage-field="year"]': year,
    '[data-v2-garage-card-empty]': cardEmpty,
    '[data-v2-garage-card-name]': cardName,
    '[data-v2-garage-card-spec]': cardSpec,
    '[data-v2-garage-shop]': null,
    '[data-v2-garage-shop-label]': null,
    '[data-v2-garage-saved-wrap]': savedWrap,
    '[data-v2-garage-saved-list]': savedList
  };
  garageRoot.querySelector = selector => garageParts[selector] || null;
  garageRoot.querySelectorAll = selector => selector === '[data-v2-garage-close]' ? [garageClose] : [];

  const documentEvents = {};
  behavioralDocument = {
    activeElement: null,
    body: { appendChild() {}, style: {} },
    addEventListener(type, listener) { documentEvents[type] = listener; },
    createElement() { return behavioralElement(); },
    querySelector(selector) {
      if (selector === '[data-v2-garage]') return garageRoot;
      if (selector === '[data-v2-cart-open]') return cartTrigger;
      if (selector === '[data-v2-search] form') return null;
      if (selector.includes('.sd2-v2-garage-panel.is-open')) {
        if (garagePanel.classList.contains('is-open')) return garagePanel;
        if (cartPanel.classList.contains('is-open')) return cartPanel;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-v2-drawer], .sd2-v2-cart-drawer, .sd2-v2-search-console') return [cartRoot];
      if (selector === '[data-v2-search-open], [data-v2-cart-open]') return [cartTrigger];
      if (selector === '.sd2-v2-scrim, .sd2-v2-cart-scrim, .sd2-v2-search-scrim') return [cartScrim];
      if (selector === '[data-v2-garage-toggle]') return [cartGarageAdd];
      if (selector === '[data-v2-garage-label]') return [];
      return [];
    }
  };

  class MutationObserver { observe() {} }
  const window = {
    dispatchEvent() {},
    localStorage: { getItem() { return '[]'; }, setItem() {} },
    location: { href: 'https://example.test/', origin: 'https://example.test' }
  };
  const helperStart = components.indexOf('function setDialogInteractive');
  const helperEnd = components.indexOf('/* Retired campaign aliases', helperStart);
  const garageStart = components.indexOf('/* Garage Experience V2 controller');
  const garageEnd = components.indexOf('/* Cart Drawer controller', garageStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart && garageStart >= 0 && garageEnd > garageStart,
    'dialog helper and Garage controller must be extractable for behavioral testing');
  vm.runInNewContext(
    components.slice(helperStart, helperEnd) + components.slice(garageStart, garageEnd),
    { Array, Boolean, CustomEvent: class CustomEvent {}, JSON, MutationObserver, URL, document: behavioralDocument, window }
  );

  documentEvents.click({ target: cartGarageAdd, preventDefault() {} });
  assert.equal(cartPanel.classList.contains('is-open'), false, 'Garage opening must close the actual cart panel');
  assert.equal(cartPanel.getAttribute('aria-hidden'), 'true', 'the closed cart panel must be hidden from assistive technology');
  assert.equal(cartGarageAdd.getAttribute('tabindex'), '-1', 'the closed cart Add action must leave the tab order');
  assert.equal(garagePanel.classList.contains('is-open'), true, 'Garage must become the sole active overlay');
  assert.equal(behavioralDocument.activeElement, garageClose, 'Garage opening must focus its first control');

  garageClose.events.click();
  assert.equal(garagePanel.classList.contains('is-open'), false, 'Garage close must clear its active state');
  assert.equal(garagePanel.getAttribute('aria-hidden'), 'true', 'Garage close must restore its hidden state');
  assert.equal(behavioralDocument.activeElement, cartTrigger, 'Garage close must restore focus outside the now-hidden cart');
  assert.equal(cartGarageAdd.getAttribute('tabindex'), '-1', 'the hidden cart must remain outside the tab order after Garage closes');
}

exerciseCartToGarageTransition();

console.log('V2 mobile responsive regression contracts verified');
