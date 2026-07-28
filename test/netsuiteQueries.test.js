const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NETSUITE_ACCOUNT_ID ||= 'TEST_ACCOUNT';
process.env.NETSUITE_CONSUMER_KEY ||= 'test';
process.env.NETSUITE_CONSUMER_SECRET ||= 'test';
process.env.NETSUITE_TOKEN_ID ||= 'test';
process.env.NETSUITE_TOKEN_SECRET ||= 'test';

const {
  buildMivaOrderLookupQuery,
  buildExternalIdLookupQuery,
  buildItemIdLookupQuery,
} = require('../netsuite');

test('builds an exact sales-order lookup for a Miva order ID', () => {
  assert.equal(
    buildMivaOrderLookupQuery('2766295'),
    "SELECT id, recordtype, externalid, foreigntotal, total FROM transaction WHERE custbody_hb_miva_order_id = '2766295' AND recordtype = 'salesorder'"
  );
});

test('escapes external IDs and allowlists accounting record types', () => {
  assert.equal(
    buildExternalIdLookupQuery("MIVA_INV_4'2", 'invoice'),
    "SELECT id, recordtype, externalid, foreigntotal, total FROM transaction WHERE externalid = 'MIVA_INV_4''2' AND recordtype = 'invoice'"
  );
  assert.throws(() => buildExternalIdLookupQuery('MIVA_X_42', 'salesorder'), /unsupported record type/i);
});

test('validates numeric item IDs before building item metadata queries', () => {
  assert.equal(
    buildItemIdLookupQuery('10322'),
    'SELECT id, itemid, itemtype, taxschedule, isinactive FROM item WHERE id = 10322 AND isinactive = \'F\''
  );
  assert.throws(() => buildItemIdLookupQuery('10322 OR 1=1'), /numeric item ID/i);
});
