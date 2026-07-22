const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/sd2-global.css'), 'utf8');
const fontConfig = JSON.parse(fs.readFileSync(path.join(root, 'css/google-fonts.json'), 'utf8'));
const fontUrl = String(fontConfig.url || fontConfig.URL || fontConfig.href || JSON.stringify(fontConfig));

for (const family of ['Inter', 'Oswald', 'IBM+Plex+Mono']) {
  assert.ok(fontUrl.includes(family), `Google Fonts configuration must load ${family.replaceAll('+', ' ')}`);
}

const premiumLayer = css.indexOf('V2 PREMIUM PRESENTATION CONSISTENCY');
assert.ok(premiumLayer >= 0, 'the stylesheet must include the final V2 premium presentation layer');
const finalCss = css.slice(premiumLayer);

assert.match(
  finalCss,
  /\[data-v2-editorial-page\]\s+:is\(mmx-hero,mmx-video,mmx-image-across,mmx-text-editor\)[^{]*\{[^}]*font-family:\s*var\(--sd2-font-body\)/is,
  'MMX editorial hosts must inherit the V2 body typeface'
);
assert.match(
  finalCss,
  /\[data-v2-editorial-page\][^{]*\{[^}]*--mmx-display-3-font:\s*normal 600 clamp\(34px,4vw,48px\)\/1\.05 var\(--sd2-font-display\)/is,
  'MMX display-3 headings must use the controlled Oswald display scale'
);
assert.match(
  finalCss,
  /#mmx-text-banner__text-banner[^{]*\{[^}]*--mmx-display-3-font:\s*normal 600 clamp\(34px,4vw,48px\)\/1\.05 var\(--sd2-font-display\)/is,
  'the live sale sequence must receive the MMX display contract even before its page wrapper is published'
);
assert.match(
  finalCss,
  /#mmx-video__mmx_video[^{]*\{[^}]*width:\s*min\(100%,520px\)/is,
  'the portrait rewards guide must be constrained independently of landscape media'
);
assert.match(
  finalCss,
  /#mmx-video__mmx_video\s*>\s*mmx-text\[slot="heading"\][\s\S]*?--mmx-display-2-font:[^;]+var\(--sd2-font-display\)!important/is,
  'rewards section headings must override the MMX shadow-root theme with Oswald'
);
assert.match(
  finalCss,
  /#SA_review_wrapper\s+\.SA__review_bar[^{]*\{[^}]*display:\s*grid!important[^}]*grid-template-columns:\s*38px minmax\(0,1fr\)[^}]*min-height:\s*40px/is,
  'Shopper Approved rating bars must retain a visible height'
);
assert.match(
  finalCss,
  /#SA_review_wrapper\s+\.SA__review_bars[^{]*\{[^}]*display:\s*block!important[^}]*min-height:\s*10px/is,
  'Shopper Approved rating fills must not remain hidden by the widget stylesheet'
);
assert.match(
  finalCss,
  /#SA_review_wrapper\s+:is\(\.sa-widget-filter,\.sa-page-num,\.sa-page-next,\.sa-page-prev\)[^{]*\{[^}]*min-height:\s*44px/is,
  'review filters and pagination must use accessible premium control sizing'
);
assert.match(
  finalCss,
  /#sb-pagination\s+a[^{]*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/is,
  'blog pagination must use consistent control sizing'
);
assert.match(
  finalCss,
  /:is\(\.sd2-v2-listing,\.sd2-v2-search-page,\.sd2-v2-filter-sheet\)\s+\.u-font-small[^{]*\{[^}]*font-family:\s*var\(--sd2-font-body\)!important[^}]*font-size:\s*11px/is,
  'catalog utility labels must not fall back to the legacy Play face or unreadable sizing'
);
assert.match(
  finalCss,
  /\.klaviyo-form-YbRcU3\s+\.ql-font-poppins[^{]*\{[^}]*font-family:\s*var\(--sd2-font-body\)!important/is,
  'the military signup heading must follow the V2 body typography instead of Klaviyo Poppins'
);
assert.match(
  finalCss,
  /\.klaviyo-form-YbRcU3\s+\.needsclick[^{]*\{[^}]*font-family:\s*var\(--sd2-font-body\)!important/is,
  'Klaviyo controls and supporting copy must inherit the V2 body typeface'
);
assert.match(
  finalCss,
  /\.sd2-v2-footer__log-all[^{]*\{[^}]*min-height:\s*44px/is,
  'footer utility actions must meet the shared control height'
);

assert.match(
  finalCss,
  /\.sd2-v2-pdp\s+#faq\s+\.sd2-v2-pdp-section__header[^{]*\{[^}]*position:\s*static/is,
  'PDP FAQ heading must stay aligned with the accordion instead of floating mid-section'
);
assert.match(
  finalCss,
  /\.sd2-v2-pdp\s+\.sd2-v2-product-hero\s+\.sd2-v2-breadcrumbs[^{]*\{[^}]*color:\s*rgba\(255,255,255,\.72\)[^}]*font-size:\s*14px/is,
  'dark PDP hero breadcrumbs must remain readable at the approved utility size'
);
assert.match(
  finalCss,
  /\.sd2-v3-shell\s+\.sd2-v2-mega__list\s+a[^{]*\{[^}]*font-size:\s*15px[^}]*line-height:\s*1\.4/is,
  'desktop mega-menu links must use a consistent readable navigation scale'
);
assert.match(
  finalCss,
  /\.sd2-v2-pdp\s+\.sd2-v2-sticky-buy>div strong[^{]*\{[^}]*display:\s*-webkit-box[^}]*-webkit-line-clamp:\s*2[^}]*white-space:\s*normal/is,
  'compact sticky purchase titles must wrap to two lines instead of clipping immediately'
);
assert.match(
  finalCss,
  /@media\s*\(max-width:900px\)[\s\S]*?\.sd2-v3-process-card,[\s\S]*?\.sd2-v3-process-card:nth-child\(3\)[^{]*\{[^}]*min-height:\s*clamp\(380px,58vh,500px\)/is,
  'tablet and mobile build-path cards must not retain the oversized desktop viewport height'
);
assert.match(
  finalCss,
  /\.sd2-v19-truck-search-schema__edit[^{]*\{[^}]*background:\s*#2149dd[^}]*color:\s*#fff!important[^}]*font-family:\s*var\(--sd2-font-display\)!important/is,
  'the Garage search edit action must have an explicit high-contrast V2 background'
);
assert.match(
  finalCss,
  /\.sd2-v5-truck__hud\s+\.sd2-btn[^{]*\{[^}]*min-height:\s*48px[^}]*padding-inline:\s*20px/is,
  'Truck Lab entry actions must retain a full premium control target'
);
assert.match(
  finalCss,
  /@media\s*\(max-width:560px\)[\s\S]*?\.sd2-v2-pdp\s+\.sd2-v2-sticky-buy>div strong[^{]*\{[^}]*-webkit-line-clamp:\s*3/is,
  'narrow PDP sticky purchase titles must preserve three readable lines'
);

const selectionLayer = css.slice(css.lastIndexOf('V41: Technical Blue Selection'));
assert.match(
  selectionLayer,
  /::selection\s*\{(?=[^}]*background:\s*#2149dd)(?=[^}]*color:\s*#fff)(?=[^}]*text-shadow:\s*none)[^}]*\}/s,
  'every storefront surface must use the Technical Blue text-selection treatment'
);
assert.match(
  selectionLayer,
  /::-moz-selection\s*\{(?=[^}]*background:\s*#2149dd)(?=[^}]*color:\s*#fff)(?=[^}]*text-shadow:\s*none)[^}]*\}/s,
  'Firefox must receive the same Technical Blue text-selection treatment'
);

console.log('v2 premium presentation: typography, media, review, and control contracts verified');
