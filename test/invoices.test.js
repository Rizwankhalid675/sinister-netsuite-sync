const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NETSUITE_ACCOUNT_ID ||= 'TEST_ACCOUNT';
process.env.NETSUITE_CONSUMER_KEY ||= 'test';
process.env.NETSUITE_CONSUMER_SECRET ||= 'test';
process.env.NETSUITE_TOKEN_ID ||= 'test';
process.env.NETSUITE_TOKEN_SECRET ||= 'test';

const { ensureOrderReconciled, syncInvoiceForOrder } = require('../flows/invoices');

const order = { id: 42, total: 108, orderdate: 1700000000 };

test('reconciles a legacy tracking record only after exact NetSuite total comparison', async () => {
  const saved = [];
  const state = { netsuiteId: '33', legacyField: 'preserved' };
  const result = await ensureOrderReconciled(order, state, {
    getSalesOrderFinancialSummary: async () => ({ id: '33', total: 108 }),
    saveOrderState: (id, value) => saved.push([id, structuredClone(value)]),
  });
  assert.equal(result.reconciled, true);
  assert.equal(result.legacyField, 'preserved');
  assert.deepEqual(result.reconciliation, { mivaTotalCents: 10800, netsuiteTotalCents: 10800 });
  assert.deepEqual(saved, [[42, result]]);
});

test('leaves a legacy tracking record blocked and unchanged on a total mismatch', async () => {
  let saveCalls = 0;
  const state = { netsuiteId: '33', legacyField: 'preserved' };
  await assert.rejects(() => ensureOrderReconciled(order, state, {
    getSalesOrderFinancialSummary: async () => ({ id: '33', total: 107.99 }),
    saveOrderState: () => { saveCalls += 1; },
  }), /does not reconcile/i);
  assert.deepEqual(state, { netsuiteId: '33', legacyField: 'preserved' });
  assert.equal(saveCalls, 0);
});

test('adopts existing deposit and invoice by deterministic external ID without writes', async () => {
  let depositCreates = 0;
  let invoiceCreates = 0;
  const checkpoints = [];
  const result = await syncInvoiceForOrder(order, {
    syncState: { netsuiteId: '33', reconciled: true },
    invoiceState: {},
    getTransactionsByExternalId: async (externalId, type) => type === 'customerdeposit'
      ? [{ id: '44', externalid: externalId }]
      : [{ id: '55', externalid: externalId }],
    createCustomerDeposit: async () => { depositCreates += 1; return { id: '99' }; },
    createInvoiceFromSalesOrder: async () => { invoiceCreates += 1; return { id: '98' }; },
    getSalesOrderStatus: async () => 'E',
    applyDeposit: async () => {},
    saveInvoiceState: (id, value) => checkpoints.push([id, structuredClone(value)]),
  });
  assert.deepEqual(result, { status: 'complete', depositId: '44', invoiceId: '55', nsOrderId: '33' });
  assert.equal(depositCreates, 0);
  assert.equal(invoiceCreates, 0);
  assert.equal(checkpoints[0][1].depositId, '44');
  assert.equal(checkpoints.at(-1)[1].invoiceId, '55');
});

test('does not create a deposit or invoice before fulfillment eligibility', async () => {
  const checkpoints = [];
  let depositCreates = 0;
  let invoiceCreates = 0;
  const result = await syncInvoiceForOrder(order, {
    syncState: { netsuiteId: '33', reconciled: true },
    invoiceState: {},
    getTransactionsByExternalId: async () => [],
    createCustomerDeposit: async () => { depositCreates += 1; return { id: '44' }; },
    createInvoiceFromSalesOrder: async () => { invoiceCreates += 1; return { id: '55' }; },
    getSalesOrderStatus: async () => 'B',
    saveInvoiceState: (id, value) => checkpoints.push([id, structuredClone(value)]),
  });
  assert.deepEqual(result, { status: 'waiting', depositId: null, invoiceId: null, nsOrderId: '33' });
  assert.equal(depositCreates, 0);
  assert.equal(invoiceCreates, 0);
  assert.equal(checkpoints.length, 0);
});

test('never creates an invoice while NetSuite is Pending Approval', async () => {
  let depositCreates = 0;
  let invoiceCreates = 0;
  const result = await syncInvoiceForOrder(order, {
    syncState: { netsuiteId: '33', reconciled: true },
    invoiceState: {},
    getTransactionsByExternalId: async () => [],
    createCustomerDeposit: async () => { depositCreates += 1; return { id: '44' }; },
    createInvoiceFromSalesOrder: async () => { invoiceCreates += 1; return { id: '55' }; },
    getSalesOrderStatus: async () => 'A',
    saveInvoiceState: () => {},
  });
  assert.deepEqual(result, { status: 'waiting', depositId: null, invoiceId: null, nsOrderId: '33' });
  assert.equal(depositCreates, 0);
  assert.equal(invoiceCreates, 0);
});

test('blocks ambiguous deposits before any accounting write', async () => {
  let writes = 0;
  await assert.rejects(() => syncInvoiceForOrder(order, {
    syncState: { netsuiteId: '33', reconciled: true },
    invoiceState: {},
    getTransactionsByExternalId: async (externalId, type) => type === 'customerdeposit'
      ? [{ id: '44' }, { id: '45' }]
      : [],
    getSalesOrderStatus: async () => 'E',
    createCustomerDeposit: async () => { writes += 1; return { id: '99' }; },
    saveInvoiceState: () => { writes += 1; },
  }), /multiple customerdeposit/i);
  assert.equal(writes, 0);
});

test('recovers an invoice ID after an HTTP 400 and checkpoints it once', async () => {
  let invoiceLookups = 0;
  const checkpoints = [];
  const result = await syncInvoiceForOrder(order, {
    syncState: { netsuiteId: '33', reconciled: true },
    invoiceState: { depositId: '44' },
    getTransactionsByExternalId: async (externalId, type) => {
      if (type === 'customerdeposit') return [];
      invoiceLookups += 1;
      return invoiceLookups === 1 ? [] : [{ id: '55', externalid: externalId }];
    },
    createInvoiceFromSalesOrder: async () => { throw new Error('400 USER_ERROR'); },
    getSalesOrderStatus: async () => 'E',
    applyDeposit: async () => {},
    saveInvoiceState: (id, value) => checkpoints.push([id, structuredClone(value)]),
  });
  assert.equal(result.invoiceId, '55');
  assert.equal(invoiceLookups, 2);
  assert.equal(checkpoints.at(-1)[1].invoiceId, '55');
});

test('a restart with checkpointed transaction IDs never creates duplicates', async () => {
  let creates = 0;
  const result = await syncInvoiceForOrder(order, {
    syncState: { netsuiteId: '33', reconciled: true },
    invoiceState: { depositId: '44', invoiceId: '55' },
    getTransactionsByExternalId: async () => { throw new Error('lookup should not run'); },
    createCustomerDeposit: async () => { creates += 1; return { id: '99' }; },
    createInvoiceFromSalesOrder: async () => { creates += 1; return { id: '98' }; },
    applyDeposit: async () => {},
    saveInvoiceState: () => {},
  });
  assert.equal(result.status, 'complete');
  assert.equal(creates, 0);
});
