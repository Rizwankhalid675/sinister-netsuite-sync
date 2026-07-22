const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Install Hub exposes one unambiguous platforms fragment', () => {
  const source = read('templates/install-hub.mvt');
  assert.equal((source.match(/\bid="platforms"/g) || []).length, 1);
  assert.match(source, /href="https:\/\/sinisterdiesel\.com\/install-hub\.html#platforms"/);
  assert.match(source, /id="platform-library"/);
});

test('shipping-protection hotspots are meaningful and safe controls', () => {
  const source = read('templates/bask.mvt');
  assert.match(source, /<button\b[^>]*id="learn_more_close"[^>]*type="button"[^>]*aria-label="Close shipping protection details"[^>]*><\/button>/);
  assert.match(source, /<a\b[^>]*id="learn_more_link"[^>]*href="https:\/\/sinisterdiesel\.com\/shipping-policies\.html"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*aria-label="Read shipping protection policy"[^>]*><\/a>/);
  assert.doesNotMatch(source, /href=""/);
  assert.equal((source.match(/\.click\(function \(event\)/g) || []).length, 2);
});

test('blog reply and comment forms use paired unique labels and valid structure', () => {
  const source = read('templates/blog-content.mvt');
  assert.match(source, /<button\b[^>]*class="[^"]*sb-collapsible[^"]*"[^>]*type="button"[^>]*id="reply-toggle-&mvte:comment:id;"[^>]*aria-controls="reply-form-&mvte:comment:id;"[^>]*aria-expanded="false"[^>]*>/);
  assert.match(source, /<form\b[^>]*id="reply-form-&mvte:comment:id;"/);
  for (const field of ['title', 'author', 'body']) {
    assert.match(source, new RegExp(`for="reply-${field}-&mvte:comment:id;"`));
    assert.match(source, new RegExp(`id="reply-${field}-&mvte:comment:id;"`));
  }
  for (const field of ['title', 'author', 'body']) {
    assert.match(source, new RegExp(`for="blog-comment-${field}"`));
    assert.match(source, new RegExp(`id="blog-comment-${field}"`));
  }
  assert.doesNotMatch(source, /id="(?:commentTitle|comment)"/);
  assert.equal(
    (source.match(/<\/ul>\s*<input type="hidden" name="scotsblogger_category_code"[^>]*>\s*<\/fieldset>\s*<\/form>/g) || []).length,
    2
  );
  assert.match(source, /setAttribute\("aria-expanded",\s*isOpen\s*\?\s*"true"\s*:\s*"false"\)/);
});

test('homepage tabs have reciprocal panel associations and synchronized accessibility state', () => {
  const home = read('templates/sfnt.mvt');
  const motion = read('js/sd2-motion.js');
  for (const platform of ['powerstroke', 'duramax', 'cummins']) {
    assert.match(home, new RegExp(`role="tabpanel"[^>]*id="sd2-v5-truck-panel-${platform}"[^>]*aria-labelledby="sd2-v5-truck-tab-${platform}"[^>]*data-v5-truck="${platform}"`));
    assert.match(home, new RegExp(`role="tab"[^>]*id="sd2-v5-truck-tab-${platform}"[^>]*aria-controls="sd2-v5-truck-panel-${platform}"[^>]*data-v5-truck-select="${platform}"`));
  }
  for (const mode of ['daily', 'tow', 'performance']) {
    assert.match(home, new RegExp(`role="tab"[^>]*id="sd2-v4-mode-tab-${mode}"[^>]*aria-controls="sd2-v4-mode-panel-${mode}"[^>]*data-v4-mode="${mode}"`));
    assert.match(home, new RegExp(`role="tabpanel"[^>]*id="sd2-v4-mode-panel-${mode}"[^>]*aria-labelledby="sd2-v4-mode-tab-${mode}"[^>]*aria-hidden="(?:true|false)"[^>]*data-v4-mode-panel="${mode}"`));
  }
  assert.match(motion, /panel\.setAttribute\("aria-hidden",\s*active\s*\?\s*"false"\s*:\s*"true"\)/);
  assert.doesNotMatch(motion, /panel\.hidden\s*=/);
});

test('PDP tabs use one roving tab stop and update it on activation', () => {
  const product = read('templates/prod-product_display-v2-test.mvt');
  const components = read('js/sd2-v2-components.js');
  const tabMarkup = product.match(/<div class="sd2-v2-product-tabs__list"[\s\S]*?<\/div>/)[0];
  assert.equal((tabMarkup.match(/tabindex="0"/g) || []).length, 1);
  assert.equal((tabMarkup.match(/tabindex="-1"/g) || []).length, 3);
  assert.match(components, /item\.setAttribute\('tabindex',\s*item === tab \? '0' : '-1'\)/);
  assert.match(components, /panel\.hidden = panel\.id !== tab\.getAttribute\('aria-controls'\)/);
});
