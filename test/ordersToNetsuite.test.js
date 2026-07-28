const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NETSUITE_ACCOUNT_ID ||= 'TEST_ACCOUNT';
process.env.NETSUITE_CONSUMER_KEY ||= 'test';
process.env.NETSUITE_CONSUMER_SECRET ||= 'test';
process.env.NETSUITE_TOKEN_ID ||= 'test';
process.env.NETSUITE_TOKEN_SECRET ||= 'test';

const { syncSingleOrder, mapOrderToNetsuite } = require('../flows/ordersToNetsuite');

function makeOrder(overrides = {}) {
  return {
    id: 42,
    total: 108,
    total_tax: 8,
    total_ship: 0,
    items: [{ line_id: 7, sku: 'EXACT-SKU', quantity: 1, price: 100, total: 100, tax: 8, options: [] }],
    charges: [{ type: 'TAX', amount: 8, tax: 0 }],
    ...overrides,
  };
}

function makeDependencies(overrides = {}) {
  return {
    syncedOrders: {},
    getItemsBySku: async (sku) => [{ id: '11', itemid: sku }],
    getItemsByInternalId: async () => [],
    getItemMetadata: async () => null,
    getTransactionsByMivaOrderId: async () => [],
    ensureCustomer: async () => '22',
    createSalesOrder: async () => ({ id: '33' }),
    getSalesOrderFinancialSummary: async (id) => ({ id, total: 108 }),
    saveSyncState: () => {},
    ...overrides,
  };
}

test('skips an order already present in tracking without external calls', async () => {
  let externalCalls = 0;
  const deps = makeDependencies({
    syncedOrders: { 42: { netsuiteId: '33' } },
    getItemsBySku: async () => { externalCalls += 1; return []; },
    getTransactionsByMivaOrderId: async () => { externalCalls += 1; return []; },
  });
  const result = await syncSingleOrder(makeOrder(), deps);
  assert.deepEqual(result, { status: 'skipped', netsuiteId: '33', reconciled: false });
  assert.equal(externalCalls, 0);
});

test('adopts one existing NetSuite sales order without creating a customer or order', async () => {
  let customerCalls = 0;
  let createCalls = 0;
  const saved = [];
  const deps = makeDependencies({
    getTransactionsByMivaOrderId: async () => [{ id: '91', recordtype: 'salesorder', total: 108 }],
    ensureCustomer: async () => { customerCalls += 1; return '22'; },
    createSalesOrder: async () => { createCalls += 1; return { id: '33' }; },
    getSalesOrderFinancialSummary: async () => ({ id: '91', total: 108 }),
    saveSyncState: (id, state) => saved.push([id, structuredClone(state)]),
  });
  const result = await syncSingleOrder(makeOrder(), deps);
  assert.deepEqual(result, { status: 'adopted', netsuiteId: '91', reconciled: true });
  assert.equal(customerCalls, 0);
  assert.equal(createCalls, 0);
  assert.equal(saved.at(-1)[1].reconciled, true);
  assert.equal(saved.at(-1)[1].reconciliation.mivaTotalCents, 10800);
  assert.equal(saved.at(-1)[1].reconciliation.netsuiteTotalCents, 10800);
});

test('blocks ambiguous existing sales orders before customer creation', async () => {
  let customerCalls = 0;
  let saveCalls = 0;
  const deps = makeDependencies({
    getTransactionsByMivaOrderId: async () => [{ id: '91' }, { id: '92' }],
    ensureCustomer: async () => { customerCalls += 1; return '22'; },
    saveSyncState: () => { saveCalls += 1; },
  });
  await assert.rejects(() => syncSingleOrder(makeOrder(), deps), /multiple NetSuite sales orders/i);
  assert.equal(customerCalls, 0);
  assert.equal(saveCalls, 0);
});

test('checkpoints a newly created order before exact total reconciliation', async () => {
  const saved = [];
  const deps = makeDependencies({
    saveSyncState: (id, state) => saved.push([id, structuredClone(state)]),
  });
  const result = await syncSingleOrder(makeOrder(), deps);
  assert.deepEqual(result, { status: 'created', netsuiteId: '33', reconciled: true });
  assert.equal(saved.length, 2);
  assert.equal(saved[0][1].netsuiteId, '33');
  assert.equal(saved[0][1].reconciled, false);
  assert.equal(saved[1][1].reconciled, true);
});

test('retains the created NetSuite ID and blocks on a total mismatch', async () => {
  const saved = [];
  const deps = makeDependencies({
    getSalesOrderFinancialSummary: async () => ({ id: '33', total: 107.99 }),
    saveSyncState: (id, state) => saved.push([id, structuredClone(state)]),
  });
  await assert.rejects(() => syncSingleOrder(makeOrder(), deps), /does not reconcile/i);
  assert.equal(saved.length, 2);
  assert.equal(saved[0][1].netsuiteId, '33');
  assert.equal(saved.at(-1)[1].reconciled, false);
  assert.equal(saved.at(-1)[1].reconciliation.netsuiteTotalCents, 10799);
});

test('blocks invalid item resolution before duplicate or customer lookups', async () => {
  let duplicateCalls = 0;
  let customerCalls = 0;
  const deps = makeDependencies({
    getItemsBySku: async () => [],
    getTransactionsByMivaOrderId: async () => { duplicateCalls += 1; return []; },
    ensureCustomer: async () => { customerCalls += 1; return '22'; },
  });
  await assert.rejects(() => syncSingleOrder(makeOrder(), deps), /not found/i);
  assert.equal(duplicateCalls, 0);
  assert.equal(customerCalls, 0);
});

test('creates separate itemized payload lines in Pending Approval status', () => {
  const order = makeOrder({
    charges: [{ type: 'enshield_charge', descrip: 'Enhanced Shipping Protection', amount: 25.86, tax: 0 }],
  });
  const resolved = [
    { itemId: '13609', description: 'Parent', quantity: 1, rateCents: 84599, amountCents: 84599, taxable: true, mivaLineId: 7 },
    { itemId: '2317', description: 'Intake', quantity: 1, rateCents: 9000, amountCents: 9000, taxable: true, mivaLineId: 7 },
    { itemId: '13573', description: 'Exhaust', quantity: 1, rateCents: 11744, amountCents: 11744, taxable: true, mivaLineId: 7 },
    { itemId: '13132', description: 'Heads', quantity: 1, rateCents: 23940, amountCents: 23940, taxable: true, mivaLineId: 7 },
  ];
  const { payload } = mapOrderToNetsuite(order, '22', resolved);
  assert.deepEqual(payload.orderstatus, { id: 'A' });
  assert.deepEqual(payload.item.items.map((line) => [line.item.id, line.rate, line.amount]), [
    ['13609', 845.99, 845.99],
    ['2317', 90, 90],
    ['13573', 117.44, 117.44],
    ['13132', 239.40, 239.40],
    ['10322', 25.86, 25.86],
  ]);
});
