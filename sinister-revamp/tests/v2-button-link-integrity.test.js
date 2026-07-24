const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/sd2-global.css');
const home = read('templates/sfnt.mvt');
const motion = read('js/sd2-motion.js');
const components = read('js/sd2-v2-components.js');

const auditedLinkSources = [
  'templates/aboutus.mvt',
  'templates/authorized-resellers.mvt',
  'templates/core-returns.mvt',
  'templates/faqs.mvt',
  'templates/genuine-sinister-parts.mvt',
  'templates/install-hub.mvt',
  'templates/install-instructions.mvt',
  'templates/install-part-overviews.mvt',
  'templates/install-tutorials-cummins.mvt',
  'templates/install-tutorials-duramax.mvt',
  'templates/install-tutorials-overview.mvt',
  'templates/install-tutorials-powerstroke.mvt',
  'templates/jobapplication.mvt',
  'templates/not-suing-over-blue.mvt',
  'templates/prpo.mvt',
  'templates/shipping-policies.mvt',
  'templates/spons.mvt',
  'templates/warr.mvt',
  'properties/readytheme_contentsection/faqs_content.mvt'
];

for (const file of auditedLinkSources) {
  assert.doesNotMatch(
    read(file),
    /href="(?!\/|https?:|#|&mvte:)[^"?#]+\.html(?:[?#][^"]*)?"/i,
    `${file} must use root-relative URLs so Miva basehref cannot redirect links into /mm5/`
  );
}

assert.match(
  css,
  /\.sd2-policy__content a:not\(\.sd2-cp__button\):not\(\.sd2-btn\):not\(\.sd2-v2-button\):not\(\.c-button\)/,
  'policy prose-link color must not override button text contrast'
);
assert.match(
  css,
  /\.sd2-blog__stage :is\(button,input\[type="submit"\]\)\s*\{(?=[^}]*background:\s*#101a31)(?=[^}]*color:\s*#fff!important)(?=[^}]*font-family:\s*var\(--sd2-font-display\)!important)[^}]*\}/is,
  'blog submit actions must use a complete, high-contrast V2 button treatment'
);
assert.doesNotMatch(
  css,
  /:is\(\.sd2-v2-buybox,\.sd2-v4-build-console__machine,\.sd2-cp__section--dark\) :is\(input,select,textarea,option\)/,
  'dark-panel field normalization must not style submit inputs as white fields'
);
assert.doesNotMatch(
  css,
  /:is\(\.sd2-v2-pdp,\.sd2-v2-cart-page,\.sd2-v2-checkout,\.sd2-v2-checkout-shell,\.sd2-v2-account,\.sd2-v6-upsell\)\s*:is\(input:not\(\[type="hidden"\]\):not\(\[type="radio"\]\):not\(\[type="checkbox"\]\),select,textarea\)/,
  'commerce field normalization must exclude submit, button, reset, and image inputs'
);
assert.match(
  css,
  /\.sd2-v2-hdr__util-item\.t-site-header__basket-link,[\s\S]*?\.sd2-v2-drawer__close\s*\{(?=[^}]*min-width:\s*44px!important)(?=[^}]*min-height:\s*44px!important)[^}]*\}/i,
  'shared icon controls must retain a 44px pointer target at the end of the cascade'
);
assert.match(
  css,
  /\.sd2-v2-hdr__account-link,[\s\S]*?\.sd2-v2-hdr__util-item\.t-site-header__basket-link,[\s\S]*?\{(?=[^}]*min-width:\s*44px!important)(?=[^}]*min-height:\s*44px!important)[^}]*\}/i,
  'the mobile account icon must share the canonical 44px pointer target'
);
assert.match(
  css,
  /\.page-links\.sd2-v2-pagination :is\([^)]*page-links-inactive[^)]*\),[\s\S]*?\.page-links\.sd2-v2-pagination--rollup button\s*\{(?=[^}]*display:\s*inline-flex!important)(?=[^}]*min-width:\s*44px!important)(?=[^}]*min-height:\s*44px!important)[^}]*\}/i,
  'catalog pagination buttons must use valid display syntax and 44px pointer targets'
);
assert.doesNotMatch(css, /\bdis\s*:/i, 'button and pagination declarations must not contain the invalid dis property');

for (const platform of ['Powerstroke', 'Duramax', 'Cummins']) {
  assert.match(
    home,
    new RegExp(`<a class="sd2-btn sd2-btn--light"[^>]*data-v4-route-direct[^>]*>Enter ${platform}<\\/a>`, 'i'),
    `${platform} Truck Lab CTA must use immediate native navigation`
  );
}
assert.match(
  motion,
  /if\s*\(link\.hasAttribute\("data-v4-route-direct"\)\)\s*return;/,
  'the branded route wipe must allow reliability-critical CTAs to use native navigation'
);
assert.match(
  motion,
  /event\.target\.closest\("a,button,\.sd2-v5-truck__hud"\)/,
  'Truck Lab tilt must stand down over HUD controls so the target cannot move before pointer-down'
);
assert.match(
  motion,
  /pointerdown"[\s\S]*?event\.target\.closest\("button,\.sd2-v5-truck__hud"\)/,
  'Truck Lab drag initiation must allow the visible truck image while protecting HUD controls'
);
assert.match(
  motion,
  /stage\.addEventListener\("click"[\s\S]*?suppressVisualClick[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?true\s*\)/,
  'a completed Truck Lab image drag must suppress its synthetic follow-up navigation without disabling normal image links'
);
assert.match(
  motion,
  /stage\.addEventListener\("dragstart",\s*function\s*\(event\)\s*\{\s*event\.preventDefault\(\);\s*\}\)/,
  'Truck Lab must prevent native image dragging from cancelling its pointer gesture'
);
assert.match(
  css,
  /\.sd2-v5-truck\.is-active\s*\{(?=[^}]*transition:\s*opacity\s+\.45s\s+ease,\s*filter\s+\.6s\s+ease)(?![^}]*transition:[^}]*transform)[^}]*\}/is,
  'the active Truck Lab slide must immediately stabilize transform geometry while retaining opacity and filter motion'
);
assert.match(
  motion,
  /var\s+dragPointerId\s*=\s*null;/,
  'Truck Lab drag handling must track the active pointer independently from its start position'
);
assert.match(
  motion,
  /pointermove"[\s\S]*?Math\.abs\(event\.clientX\s*-\s*dragStart\)\s*<=\s*8[\s\S]*?stage\.setPointerCapture\(event\.pointerId\)/,
  'Truck Lab must capture only after pointer movement proves a drag, preserving normal image-link clicks'
);
assert.match(
  motion,
  /stage\.releasePointerCapture\(pointerId\)/,
  'Truck Lab drag cleanup must release its captured pointer'
);
assert.match(
  motion,
  /stage\.addEventListener\("pointerleave"[\s\S]*?event\.pointerId\s*===\s*dragPointerId[\s\S]*?stage\.hasPointerCapture\(event\.pointerId\)[\s\S]*?clearDrag\(\)/,
  'Truck Lab must clear an uncaptured pointer that leaves before the drag threshold'
);
assert.match(
  motion,
  /function\s+clearDrag\(\)\s*\{[\s\S]*?--truck-px",\s*"0"[\s\S]*?--truck-py",\s*"0"/,
  'Truck Lab drag cleanup must return pointer tilt to neutral after an outside-stage release'
);
assert.match(
  motion,
  /tab\.addEventListener\("keydown"[\s\S]*?event\.key\s*===\s*"Home"[\s\S]*?event\.key\s*===\s*"End"[\s\S]*?select\(requestedIndex,\s*true\)/,
  'Truck Lab tabs must support Arrow, Home, and End keyboard selection while moving focus with the active tab'
);
assert.match(
  css,
  /\.sd2-v2-scrim\s*\{(?=[^}]*z-index:\s*1199)[^}]*\}[\s\S]*?\.sd2-v2-drawer\s*\{(?=[^}]*z-index:\s*1200)[^}]*\}/i,
  'the open mobile navigation layer must sit above the V3 floating header so its close control remains clickable'
);
assert.match(
  css,
  /@media\s*\(min-width:\s*381px\)\s+and\s+\(max-width:\s*480px\)\s*\{[\s\S]*?\.sd2-v5-truck-controls\s*\{(?=[^}]*width:\s*calc\(100%\s*-\s*84px\))(?=[^}]*margin-inline:\s*6px\s+auto)[^}]*\}/i,
  'common phone-width Truck Lab controls must stay left of the fixed reCAPTCHA badge hit area without shrinking narrow-phone targets'
);
assert.match(
  css,
  /@media\s*\(max-width:\s*380px\)\s*\{[\s\S]*?\.sd2-v5-truck-controls\s*\{(?=[^}]*width:\s*min\(252px,\s*calc\(100%\s*-\s*12px\)\))(?=[^}]*grid-template-columns:\s*44px\s+minmax\(0,1fr\)\s+44px)[^}]*\}/i,
  'narrow-phone Truck Lab controls must clear reCAPTCHA while retaining 44px arrow and numbered-tab targets through the 361px breakpoint'
);
assert.match(
  css,
  /\.sd2-v2-build-story__body\s+\.sd2-btn:is\(:hover,:focus-visible,:active\)\s*\{(?=[^}]*background:\s*#fff)(?=[^}]*color:\s*#07101f!important)[^}]*\}/,
  'Build Blueprint CTA interaction states must keep dark text on the white surface'
);
assert.match(
  css,
  /\.sd2-v2-build-story__body\s+\.sd2-btn:visited\s*\{(?=[^}]*background:\s*#3159eb)(?=[^}]*color:\s*#fff!important)[^}]*\}/,
  'Build Blueprint CTA visited state must retain its blue surface and white label'
);
assert.equal(
  (home.match(/href="\/#sd2-v2-platforms-title"[^>]*data-sd2-scroll-to="sd2-v2-platforms-title"/g) || []).length,
  2,
  'both homepage platform CTAs must use root-safe fallbacks and same-document scroll targets'
);
assert.match(
  components,
  /document\.querySelectorAll\('\[data-sd2-scroll-to\]'\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?target\.scrollIntoView/,
  'homepage platform CTAs must bypass Miva basehref and scroll to the rendered target'
);
assert.match(
  css,
  /#sd2-v2-platforms-title\s*\{[^}]*scroll-margin-top:\s*180px[^}]*\}/,
  'the homepage platform target must clear the sticky V2 header when scrolled into view'
);

console.log('V2 button contrast and internal-link integrity contracts verified');
