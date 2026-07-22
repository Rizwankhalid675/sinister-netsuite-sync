const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/sd2-global.css');
const product = read('templates/prod-product_display.mvt');
const blog = read('templates/blog-content.mvt');

assert.match(css,
  /\.sd2-v2-pgrid-wrap\s*\{(?=[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\))[^}]*\}/s,
  'catalog wrapper must use a shrinkable grid track so controls and cards cannot widen the page');
assert.match(css,
  /\[data-v2-editorial-page\]\s*>\s*\.sd2-wrap\s*\{(?=[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\))[^}]*\}/s,
  'editorial wrapper must use a shrinkable track around third-party embeds');
assert.match(css,
  /@media\s*\(max-width:\s*560px\)[\s\S]*?\[data-editorial-variant="promotion-form"\]\s+\.klaviyo-form-YbRcU3\s*\{(?=[^}]*width:\s*100%\s*!important)(?=[^}]*min-width:\s*0\s*!important)[^}]*\}/s,
  'mobile Klaviyo root must be constrained to the editorial card');
assert.match(css,
  /\[data-editorial-variant="promotion-form"\]\s+\.klaviyo-form-YbRcU3\s+form\s*\{(?=[^}]*max-width:\s*100%\s*!important)(?=[^}]*overflow:\s*hidden\s*!important)[^}]*\}/s,
  'the injected Klaviyo form must not retain its 600px canvas on mobile');
assert.match(css,
  /\.klaviyo-form-YbRcU3\s+form\s*>\s*div\s*>\s*div\s*\{[^}]*flex-direction:\s*column\s*!important/s,
  'the promotion form top-level two-column field rows must stack on mobile');
assert.match(css,
  /\.klaviyo-form-YbRcU3\s+form\s*>\s*div\s*>\s*div\s*\{(?=[^}]*height:\s*auto\s*!important)(?=[^}]*gap:\s*10px\s*!important)[^}]*\}/s,
  'stacked Klaviyo rows must release the vendor fixed row height and add separation');
assert.match(css,
  /\.klaviyo-form-YbRcU3\s+form\s*>\s*div\s*>\s*div\s*>\s*div\s*\{(?=[^}]*width:\s*100%\s*!important)(?=[^}]*flex:\s*0\s+0\s+auto\s*!important)[^}]*\}/s,
  'each injected Klaviyo field wrapper must occupy its own full-width mobile row');
assert.match(css,
  /#SA_review_wrapper\s+:is\(\.SA__review_widget,\.SA__review_widget_item,\.SA__review_content,\.SA__review_bar_container,\.SA__review_bar\)\s*\{(?=[^}]*width:\s*100%\s*!important)(?=[^}]*box-sizing:\s*border-box)[^}]*\}/s,
  'Shopper Approved mobile rows must remain inside the review card');

assert.doesNotMatch(product, /<a href="#faq">FAQ<\/a>/,
  'PDP FAQ jump must not resolve against Miva basehref to /mm5/#faq');
assert.match(product, /<a href="&mvte:urls:PROD:auto_sep;Product_Code=&mvta:product:code;#faq">FAQ<\/a>/,
	'PDP FAQ jump must use an explicit product route when product:link is empty');

assert.doesNotMatch(blog, /<section id="sb-pagination">\s*<h[1-6]\b/s,
	'blog pagination controls must not masquerade as a document heading');
assert.match(blog, /<section id="sb-pagination">\s*<nav\b[^>]*aria-label="Blog pagination"/s,
	'blog pagination controls must expose a named navigation landmark');
for (const label of ['Recent Posts', 'Categories', 'Archives']) {
	assert.doesNotMatch(blog, new RegExp(`<h4\\b[^>]*>${label}<\\/h4>`),
		`blog sidebar heading ${label} must not skip from the article h2 hierarchy to h4`);
}

console.log('V2 final site-audit regression contracts verified');
