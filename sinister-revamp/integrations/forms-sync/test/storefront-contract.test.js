'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

global.window = {
  location: { search: '', pathname: '/' },
  addEventListener() {}
};
global.document = {
	documentElement: { dataset: {} },
	readyState: 'loading',
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; }
};

const helpForms = require('../../../js/sd2-v2-components.js');

test('normalizes a returns request for the shared Monday relay', () => {
  const payload = helpForms.normalizeHelpPayload({
    name: ' Rizwan Khalid ',
    email: ' R.KHALID@example.com ',
    phone: ' 9165550123 ',
    details: ' Need to return this part. ',
    orderNumber: ' 12345 ',
    itemSku: ' SD-TEST ',
    returnType: ' Exchange ',
    reason: ' Wrong fitment ',
    website: ''
  }, 'returns-exchanges');

  assert.deepEqual(payload, {
    name: 'Rizwan Khalid',
    email: 'r.khalid@example.com',
    phone: '9165550123',
    subject: 'Returns / Exchanges Request',
    message: [
      'Need to return this part.',
      '',
      'Order Number: 12345',
      'Item / SKU: SD-TEST',
      'Return Type: Exchange',
      'Reason: Wrong fitment'
    ].join('\n'),
    source: 'support',
    company_website: ''
  });
});

test('uses the temporary relay only when the permanent hostname is not routed', async () => {
	const calls = [];
	const result = await helpForms.sendSalesInquiry(
		'https://forms-api.sinisterdiesel.com/api/forms/submit',
		{ email: 'r.khalid@example.com', message: 'Test' },
		async (url) => {
			calls.push(url);
			if (calls.length === 1) return { ok: false, status: 404, async json() { throw new Error('HTML'); } };
			return { ok: true, status: 200, async json() { return { ok: true, id: '123' }; } };
		},
		'https://conditioning-gorgeous-ddr-vids.trycloudflare.com/api/forms/submit'
	);

	assert.equal(result.ok, true);
	assert.deepEqual(calls, [
		'https://forms-api.sinisterdiesel.com/api/forms/submit',
		'https://conditioning-gorgeous-ddr-vids.trycloudflare.com/api/forms/submit'
	]);
});

test('all Help Center templates use the permanent shared forms relay', () => {
  const root = path.resolve(__dirname, '../../..');
  const templates = [
    'help-online-account-issues.mvt',
    'help-order-status.mvt',
    'help-sinister-tech-support.mvt',
    'help-warranty-inquiry.mvt',
    'returns_exchanges.mvt',
    'shipping-protection-requests.mvt'
  ];

  for (const template of templates) {
    const source = fs.readFileSync(path.join(root, 'templates', template), 'utf8');
    assert.match(source, /data-endpoint="https:\/\/forms-api\.sinisterdiesel\.com\/api\/forms\/submit"/, template);
	assert.match(source, /data-fallback-endpoint="https:\/\/conditioning-gorgeous-ddr-vids\.trycloudflare\.com\/api\/forms\/submit"/, template);
    assert.doesNotMatch(source, /\/api\/help-forms\//, template);
  }

	const sales = fs.readFileSync(path.join(root, 'templates', 'help-sales-inquiry.mvt'), 'utf8');
	assert.match(sales, /https:\/\/forms-api\.sinisterdiesel\.com\/api\/forms\/submit/);
	assert.match(sales, /https:\/\/conditioning-gorgeous-ddr-vids\.trycloudflare\.com\/api\/forms\/submit/);
});
