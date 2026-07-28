const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOrderFilters } = require('../miva');

test('builds an exact read-only Miva order ID filter', () => {
  const filters = buildOrderFilters({ orderId: '2766295' });
  assert.deepEqual(filters[1], {
    name: 'search',
    value: [{ field: 'id', operator: 'EQ', value: '2766295' }],
  });
});

test('rejects a non-numeric Miva order ID', () => {
  assert.throws(() => buildOrderFilters({ orderId: '2766295 OR 1=1' }), /numeric/i);
});
