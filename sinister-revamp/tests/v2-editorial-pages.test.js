const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const variants = {
  'templates/salerestr.mvt': 'prose',
  'templates/policies-terms-conditions.mvt': 'policy-index',
  'templates/dlrq.mvt': 'dealer-application',
  'templates/mildisc.mvt': 'promotion-form',
  'templates/rewards.mvt': 'media-guide',
  'templates/blog.mvt': 'blog',
  'templates/customer-reviews.mvt': 'reviews',
  'templates/race-parts-notice.mvt': 'legal-notice',
  'templates/smap.mvt': 'directory',
  'templates/sinister-notice.mvt': 'legal-notice',
  'templates/spons.mvt': 'campaign'
};

for (const [file, variant] of Object.entries(variants)) {
  const source = read(file);
  assert.match(source, /data-v2-editorial-page/, `${file} must opt into the editorial page system`);
  assert.match(source, new RegExp(`data-editorial-variant="${variant}"`), `${file} must use the ${variant} variant`);
}

for (const file of [
  'templates/policies-terms-conditions.mvt',
  'templates/customer-reviews.mvt',
  'templates/race-parts-notice.mvt',
  'templates/smap.mvt',
  'templates/sinister-notice.mvt'
]) {
  assert.doesNotMatch(read(file), /navigationset\(\s*'static_navigation'\s*\)/, `${file} must not render the legacy About sidebar`);
}

const preservationChecks = [
  ['templates/salerestr.mvt', /<mvt:item name="sequence"\s*\/>/],
  ['templates/policies-terms-conditions.mvt', /navigationset\(\s*'policies-terms-conditions'\s*\)/],
  ['templates/dlrq.mvt', /dealerapp\.pdf/],
  ['templates/dlrq.mvt', /forms\.monday\.com\/forms\/embed/],
  ['templates/mildisc.mvt', /static\.klaviyo\.com/],
  ['templates/mildisc.mvt', /klaviyo-form-YbRcU3/],
  ['templates/rewards.mvt', /<mvt:item name="sequence"\s*\/>/],
  ['templates/blog.mvt', /<mvt:item name="content"\s*\/>/],
  ['templates/blog.mvt', /&mvt:scotsblogger:metadata:jsonld:blog;/],
  ['templates/customer-reviews.mvt', /contentsection\(\s*'customer-reviews'\s*\)/],
  ['templates/race-parts-notice.mvt', /contentsection\(\s*'race-parts-notice'\s*\)/],
  ['templates/smap.mvt', /<mvt:item name="sitemap"\s*\/>/],
  ['templates/sinister-notice.mvt', /contentsection\(\s*'sinister-notice'\s*\)/],
  ['templates/spons.mvt', /contentsection\(\s*'sponsor_app'\s*\)/]
];

for (const [file, pattern] of preservationChecks) {
  assert.match(read(file), pattern, `${file} lost required live content or integration markup`);
}

const css = read('css/sd2-global.css');
for (const selector of [
  '[data-v2-editorial-page]',
  '[data-editorial-variant="prose"]',
  '[data-editorial-variant="directory"]',
  '[data-editorial-variant="dealer-application"]',
  '[data-editorial-variant="media-guide"]',
  '[data-editorial-variant="reviews"]'
]) {
  assert.ok(css.includes(selector), `shared CSS must contain ${selector}`);
}

assert.doesNotMatch(css, /\[class\*="sitemap"\]/, 'directory rules must not match every nested sitemap class');
assert.doesNotMatch(css, /^\.sd2-editorial-workflow/m, 'dealer workflow rules must remain scoped to its editorial variant');
assert.match(css, /\[data-editorial-variant="reviews"\] #SA_review_wrapper \{[^}]*overflow-x:\s*auto/s,
  'fixed-width review widgets need a contained horizontal overflow fallback');
assert.match(css, /\.sd2-blog__hero :is\(p,li,a,label,button\) \{[^}]*font-family:\s*var\(--sd2-font-body\)!important/s,
  'blog hero supporting copy must use the V2 body typeface');

console.log(`v2 editorial pages: ${Object.keys(variants).length} templates verified`);
