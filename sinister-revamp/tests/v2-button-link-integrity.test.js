const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/sd2-global.css');

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
  /\.page-links\.sd2-v2-pagination :is\([^)]*page-links-inactive[^)]*\),[\s\S]*?\.page-links\.sd2-v2-pagination--rollup button\s*\{(?=[^}]*display:\s*inline-flex!important)(?=[^}]*min-width:\s*44px!important)(?=[^}]*min-height:\s*44px!important)[^}]*\}/i,
  'catalog pagination buttons must use valid display syntax and 44px pointer targets'
);
assert.doesNotMatch(css, /\bdis\s*:/i, 'button and pagination declarations must not contain the invalid dis property');

console.log('V2 button contrast and internal-link integrity contracts verified');
