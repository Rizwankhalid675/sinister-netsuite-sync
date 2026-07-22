const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const templateFiles = fs.readdirSync(path.join(root, 'templates'))
  .filter((file) => file.endsWith('.mvt'));
const templates = templateFiles.map((file) => read(path.join('templates', file))).join('\n');

const createAccount = read('templates/acad.mvt');
assert.doesNotMatch(createAccount, /Revamp V2 route takeover fallback/,
  'create-account must rely on its assigned branch resources, not invalid fallback URLs');
assert.doesNotMatch(createAccount, /(?:href|src)="\/(?:mm5\/)?(?:css|scripts)\/00000001\/sd2-|(?:href|src)="\/sd2-/,
  'create-account must not request branch assets from paths that return HTML/404 responses');

for (const deadPath of ['/powerstroke.html', '/duramax.html', '/cummins.html', '/mens_shirts.html']) {
  assert.ok(!templates.includes(`href="${deadPath}"`) && !templates.includes(`sinisterdiesel.com${deadPath}`),
    `templates must not link to confirmed 404 route ${deadPath}`);
}
assert.doesNotMatch(read('properties/readytheme_navigationset/links_help.json'), /"link_dest":\s*"news"/,
  'Join Sinister Insider must not point to the deleted news page');

const orderHistory = read('templates/ordh.mvt');
assert.doesNotMatch(orderHistory, /<main class="sd2-v2-account"[^>]*>\s*<div class="sd2-wrap">/,
  'order history must not nest a full-width sd2-wrap inside the already constrained account shell');

const css = read('css/sd2-global.css');
assert.match(css, /\.sd2-v2-account\s*\{(?=[^}]*width:\s*100%)(?=[^}]*box-sizing:\s*border-box)[^}]*\}/s,
  'account shell must own a border-box viewport width so legacy Miva content cannot widen mobile pages');
assert.match(css, /\.sd2-v2-account\s*>\s*\*\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s,
  'direct account children must be allowed to shrink inside the mobile viewport');
assert.match(css, /\.sd2-v2-listing[^}]*\.c-button--clear[^}]*\{[^}]*min-height:\s*44px/s,
  'catalog clear-filter controls must meet the 44px interaction target');
assert.match(css, /\.sd2-v2-search-page\s+\.sd2-v2-filter-rail\s+\.c-button--clear\s*\{[^}]*min-height:\s*44px/s,
  'live category/search shells must give Clear Filters a 44px interaction target');
assert.match(css, /\.sd2-v2-filter-rail\s+\.x-refinery__selected-filters\s+\.c-button--clear\s*\{(?=[^}]*min-height:\s*44px)(?=[^}]*display:\s*inline-flex)[^}]*\}/s,
  'native body-level refinery Clear Filters actions must meet the 44px interaction target');
assert.match(css, /\.x-collapsing-breadcrumbs__button\s*\{(?=[^}]*min-width:\s*44px)(?=[^}]*min-height:\s*44px)[^}]*\}/s,
  'collapsed account breadcrumb actions must expose a 44px square touch target');
assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.sd2-v2-cart-item\s+\.sd2-v2-qty\[data-v2-qty\]:has\(\.sd2-v2-qty__update\)\s*\{[^}]*width:\s*100%[^}]*grid-template-columns:\s*44px\s+minmax\(52px,1fr\)\s+44px/s,
  'mobile basket quantity controls must shrink to the cart-item content column');
assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.sd2-v2-cart-item\s+\.sd2-v2-qty__update\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s,
  'mobile basket Update action must occupy its own contained row');
assert.match(css, /\.klaviyo-close-form\s*\{(?=[^}]*min-width:\s*44px)(?=[^}]*min-height:\s*44px)[^}]*\}/s,
  'Klaviyo teaser close actions must expose a 44px hit target');

// The authenticated account suite should use the same branded workspace
// language as the approved V2 storefront without changing Miva behavior.
assert.match(css, /V2 ACCOUNT WORKSPACE POLISH/,
  'account workspace polish layer should be present');
assert.match(css, /\.sd2-v2-account-hero\s*\{(?=[^}]*background:)(?=[^}]*color:\s*#fff)(?=[^}]*border-radius:)[^}]*\}/s,
  'account hero should use the branded dark technical surface');
assert.match(css, /\.sd2-v2-account-nav\s*\{(?=[^}]*background:\s*#fff)(?=[^}]*box-shadow:)(?=[^}]*border-radius:)[^}]*\}/s,
  'account navigation should render as a premium segmented rail');
assert.match(css, /\.sd2-v2-account\s*>\s*:is\(\.sd2-v2-account-card,\.sd2-v2-account-empty,\.sd2-v2-account-panel\)\s*\{[^}]*max-width:\s*none/s,
  'direct account content should use the available workspace width');
assert.match(css, /\.sd2-v2-account-table\s+th\s*\{(?=[^}]*background:\s*#0a1528)(?=[^}]*color:\s*#9bb4ff)[^}]*\}/s,
  'account tables should use the V2 technical header treatment');
assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.sd2-v2-account-nav\s*\{[^}]*overflow-x:\s*auto/s,
  'mobile account navigation should remain a single scrollable rail');
assert.match(css, /\.sd2-v2-account-hero\s+\.sd2-v3-account-overview\s*\{(?=[^}]*background:\s*rgba\(3,12,29,\.62\))(?=[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\))[^}]*\}/s,
  'dashboard account tools should remain legible as a dark three-column telemetry rail');

const wishLists = read('templates/wlst-wishlists.mvt');
assert.match(wishLists, /aria-label="View [^"]+"[^>]*>\s*<span[^>]*>View<\/span>/s,
  'wish-list row actions must expose a visible View label instead of an icon-only control');
assert.match(css, /V2 ACCOUNT CONTROL REFINEMENT/,
  'account pagination, sorting, and row-action refinement layer should be present');
assert.match(css, /\.t-page-ordh\s+\.sd2-v2-pagination\s*\{(?=[^}]*width:\s*100%)(?=[^}]*border:\s*0)(?=[^}]*background:\s*transparent)(?=[^}]*box-shadow:\s*none)[^}]*\}/s,
  'order-history pagination must be a contained full-width action row rather than a floating pill');
assert.match(css, /\.t-page-ordh\s+#l-sort_by\s*\{(?=[^}]*min-height:\s*48px)(?=[^}]*border-radius:\s*12px)(?=[^}]*padding:)[^}]*\}/s,
  'order-history sorting must use the polished V2 select treatment');
assert.match(css, /\.t-page-ordh\s+\.sd2-v2-pagination\s+input\[type="submit"\]\s*\{(?=[^}]*min-width:\s*112px)(?=[^}]*min-height:\s*48px)(?=[^}]*border-radius:\s*8px)(?=[^}]*background:\s*#0a1528)(?=[^}]*color:\s*#fff)[^}]*\}/s,
  'order-history page actions must use a branded, accessible V2 button');
assert.match(css, /\.t-page-wlst\s+\.sd2-v2-table-responsive\s+tbody\s+td:last-child\s+\.sd2-v2-button\s*\{(?=[^}]*min-width:\s*92px)(?=[^}]*min-height:\s*42px)(?=[^}]*display:\s*inline-flex)[^}]*\}/s,
  'wish-list row actions must render as a clear, consistently sized control');

for (const file of ['templates/global_header.mvt', 'templates/cssui-global-header.mvt', 'templates/cssui-global-header-v2.mvt']) {
  assert.match(read(file), /class="sd2-v2-hdr__garage"[^>]*aria-label="Open vehicle garage"/,
    `${file} must retain an accessible name when the mobile breakpoint hides its visible label`);
  assert.match(read(file), /data-hook="close-search"[^>]*data-v2-search-close|data-v2-search-close[^>]*data-hook="close-search"/,
    `${file} must expose the compatibility close-search hook expected by Miva searchfield runtime`);
}
assert.match(read('js/theme.js'), /init:\s*function\s*\(\)\s*\{\s*if\s*\(typeof \$\.loadScript !== 'function'\)\s*\{\s*return;\s*\}/s,
  'legacy theme initialization must exit safely when its core script loader is not assigned');
for (const file of ['js/core_scripts.js', 'js/core_scripts_no_integrety.js']) {
  assert.match(read(file), /ui\/js\/theme\.js\?v=1\.09/,
    `${file} must cache-bust the guarded legacy theme resource`);
}

console.log('V2 release-candidate regression contracts verified');
