const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NETSUITE_ACCOUNT_ID ||= 'TEST_ACCOUNT';
process.env.NETSUITE_CONSUMER_KEY ||= 'test';
process.env.NETSUITE_CONSUMER_SECRET ||= 'test';
process.env.NETSUITE_TOKEN_ID ||= 'test';
process.env.NETSUITE_TOKEN_SECRET ||= 'test';

const { evaluateOrderParity } = require('../scripts/dry-run-order-parity');

function referenceOrder() {
  return {
    id: 2766295,
    total: 1420.88,
    total_tax: 102.19,
    total_ship: 0,
    items: [{
      line_id: 5137848,
      sku: 'SD-ARP-HEAD-6.0',
      name: 'Kit',
      quantity: 1,
      price: 845.99,
      total: 1292.83,
      tax: 100.19,
      options: [
        { attribute: 'intake', value: 'SD-IGK-FORD-03', price: 90 },
        { attribute: 'exhaust', value: 'FD-EG-KIT', price: 117.44 },
        { attribute: 'heads', value: 'fd-6_0-20', price: 239.40 },
      ],
    }],
    charges: [
      { type: 'enshield_charge', amount: 25.86, tax: 2 },
      { type: 'SHIPPING', amount: 0, tax: 0 },
      { type: 'TAX', amount: 102.19, tax: 0 },
    ],
  };
}

function readOnlyDependencies(schedule = '1') {
  const bySku = {
    'SD-IGK-FORD-03': [{ id: '2317', itemid: 'SD-IGK-FORD-03' }],
    'FD-EG-KIT': [{ id: '13573', itemid: 'FD-EG-KIT' }],
    'FD-6.0-20': [{ id: '13132', itemid: 'FD-6.0-20' }],
  };
  return {
    getItemsBySku: async (sku) => bySku[sku] || [],
    getItemsByInternalId: async (id) => [{ id, itemid: 'SD-ARP-HEAD-6.0' }],
    getItemMetadata: async () => ({ id: '10322', itemid: 'Enhanced Shipping Protection', taxschedule: schedule }),
  };
}

test('reports exact reference mappings and cent totals as ready', async () => {
  const report = await evaluateOrderParity(referenceOrder(), readOnlyDependencies());
  assert.equal(report.ready, true);
  assert.deepEqual(report.lines.map(({ sku, itemId, amountCents }) => [sku, itemId, amountCents]), [
    ['SD-ARP-HEAD-6.0', '13609', 84599],
    ['SD-IGK-FORD-03', '2317', 9000],
    ['FD-EG-KIT', '13573', 11744],
    ['fd-6_0-20', '13132', 23940],
    ['Enhanced Shipping Protection', '10322', 2586],
  ]);
  assert.deepEqual(report.totalsCents, {
    product: 129283,
    shipping: 0,
    tax: 10219,
    protection: 2586,
    order: 142088,
  });
  assert.equal(report.protectionItem.currentTaxSchedule, '1');
  assert.ok(Object.values(report.checks).every(Boolean));
});

test('reports not ready when protection item 10322 is not taxable', async () => {
  const report = await evaluateOrderParity(referenceOrder(), readOnlyDependencies('2'));
  assert.equal(report.ready, false);
  assert.equal(report.checks.protectionTaxSchedule, false);
});

test('reports not ready when internally consistent order totals differ from reference cents', async () => {
  const order = referenceOrder();
  order.items[0].price = 846;
  order.items[0].total = 1292.84;
  order.total = 1420.89;
  const report = await evaluateOrderParity(order, readOnlyDependencies());
  assert.equal(report.ready, false);
  assert.equal(report.checks.expectedTotals, false);
});
