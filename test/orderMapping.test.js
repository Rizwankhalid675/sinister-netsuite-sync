const test = require('node:test');
const assert = require('node:assert/strict');
const {
  expandMivaItems,
  validateMivaOrderTotals,
  buildItemSkuCandidates,
  resolveExpandedLines,
  buildNetsuiteLines,
  assertProtectionItemTaxable,
  assertTotalsMatch,
} = require('../lib/orderMapping');

const order2766295 = {
  id: 2766295,
  total: 1420.88,
  total_tax: 102.19,
  total_ship: 0,
  items: [{
    line_id: 5137848,
    code: 'SD-ARP-HEAD-6_0',
    sku: 'SD-ARP-HEAD-6.0',
    name: 'Sinister Diesel Head Stud and Gasket Combo Kit',
    quantity: 1,
    price: 845.99,
    total: 1292.83,
    tax: 100.19,
    options: [
      { attribute: 'intake', attr_prompt: 'Intake Gaskets', value: 'SD-IGK-FORD-03', opt_prompt: 'Intake Gasket Kit', price: 90 },
      { attribute: 'exhaust', attr_prompt: 'Exhaust Gaskets', value: 'FD-EG-KIT', opt_prompt: 'Exhaust Gaskets', price: 117.44 },
      { attribute: 'heads', attr_prompt: 'Head Gaskets', value: 'fd-6_0-20', opt_prompt: 'OEM Ford 20mm', price: 239.40 },
    ],
  }],
  charges: [
    { type: 'enshield_charge', descrip: 'Enshield Package Protection', amount: 25.86, tax: 2 },
    { type: 'SHIPPING', amount: 0, tax: 0 },
    { type: 'TAX', amount: 102.19, tax: 0 },
  ],
};

test('expands a Miva kit into its parent and price-bearing option lines', () => {
  const lines = expandMivaItems(order2766295);
  assert.deepEqual(lines.map(({ sku, amountCents }) => [sku, amountCents]), [
    ['SD-ARP-HEAD-6.0', 84599],
    ['SD-IGK-FORD-03', 9000],
    ['FD-EG-KIT', 11744],
    ['fd-6_0-20', 23940],
  ]);
  assert.equal(lines.reduce((sum, line) => sum + line.amountCents, 0), 129283);
  assert.deepEqual(validateMivaOrderTotals(order2766295, lines), {
    productCents: 129283,
    chargeCents: 12805,
    orderCents: 142088,
  });
});

test('ignores zero-price descriptive options and inherits parent quantity', () => {
  const order = {
    total: 40,
    items: [{ line_id: 1, sku: 'BASE', quantity: 2, price: 10, total: 40, tax: 0, options: [
      { value: 'NONE', opt_prompt: 'No thanks', price: 0 },
      { value: 'ADDON', opt_prompt: 'Addon', price: 10 },
    ] }],
    charges: [],
  };
  const lines = expandMivaItems(order);
  assert.deepEqual(lines.map(({ sku, quantity, amountCents }) => [sku, quantity, amountCents]), [
    ['BASE', 2, 2000],
    ['ADDON', 2, 2000],
  ]);
});

test('rejects an expanded product total that does not equal the Miva item total', () => {
  const lines = expandMivaItems(order2766295);
  lines[1].amountCents -= 1;
  assert.throws(() => validateMivaOrderTotals(order2766295, lines), /item 5137848.*exactly/i);
});

test('rejects a one-cent Miva order total mismatch', () => {
  const lines = expandMivaItems(order2766295);
  const changedOrder = { ...order2766295, total: 1420.89 };
  assert.throws(() => validateMivaOrderTotals(changedOrder, lines), /order 2766295.*exactly/i);
});

test('builds deterministic SKU punctuation candidates', () => {
  assert.deepEqual(buildItemSkuCandidates('fd-6_0-20'), ['fd-6_0-20', 'FD-6.0-20']);
});

test('resolves each expanded line exactly once and rejects missing or ambiguous SKUs', async () => {
  const lines = expandMivaItems(order2766295);
  const ids = { 'SD-ARP-HEAD-6.0': [{ id: '13609' }], 'SD-IGK-FORD-03': [{ id: '2317' }], 'FD-EG-KIT': [{ id: '13573' }], 'FD-6.0-20': [{ id: '13132' }] };
  const resolved = await resolveExpandedLines(lines, async (candidate) => ids[candidate] || []);
  assert.deepEqual(resolved.map((line) => line.itemId), ['13609', '2317', '13573', '13132']);
  await assert.rejects(() => resolveExpandedLines([{ ...lines[0], sku: 'MISSING' }], async () => []), /MISSING.*not found/i);
  await assert.rejects(() => resolveExpandedLines([lines[0]], async () => [{ id: '1' }, { id: '2' }]), /multiple NetSuite items/i);
});

test('verifies an override ID resolves to the expected exact SKU', async () => {
  const [line] = expandMivaItems(order2766295);
  const resolved = await resolveExpandedLines(
    [line],
    async () => [],
    { 'SD-ARP-HEAD-6.0': '13609' },
    async () => [{ id: '13609', itemid: 'SD-ARP-HEAD-6.0', isinactive: 'F' }]
  );
  assert.equal(resolved[0].itemId, '13609');
});

test('rejects missing, mismatched, or ambiguous override metadata', async () => {
  const [line] = expandMivaItems(order2766295);
  const overrides = { 'SD-ARP-HEAD-6.0': '13609' };
  await assert.rejects(
    () => resolveExpandedLines([line], async () => [], overrides, async () => []),
    /override.*13609.*not found/i
  );
  await assert.rejects(
    () => resolveExpandedLines([line], async () => [], overrides, async () => [{ id: '13609', itemid: 'WRONG-SKU' }]),
    /override.*does not match/i
  );
  await assert.rejects(
    () => resolveExpandedLines([line], async () => [], overrides, async () => [
      { id: '13609', itemid: 'SD-ARP-HEAD-6.0' },
      { id: '13609', itemid: 'SD-ARP-HEAD-6.0' },
    ]),
    /override.*multiple/i
  );
});

test('builds separate custom-price lines and taxable Enshield protection', async () => {
  const expanded = expandMivaItems(order2766295).map((line, index) => ({ ...line, itemId: String(index + 1) }));
  const lines = buildNetsuiteLines(expanded, order2766295);
  assert.equal(lines.length, 5);
  assert.deepEqual(lines.map((line) => line.amount), [845.99, 90, 117.44, 239.40, 25.86]);
  assert.equal(lines[4].item.id, '10322');
  assert.equal(lines[4].taxcode.id, '12260');
  assert.equal(lines[1].custcol_hb_miva_order_line_id, 5137848);
  assert.equal('custcol_hb_miva_order_line_id' in lines[4], false);
});

test('requires a taxable protection item when Miva charged protection tax', () => {
  assert.throws(() => assertProtectionItemTaxable(order2766295, { taxschedule: '2' }), /tax schedule 1/i);
  assert.doesNotThrow(() => assertProtectionItemTaxable(order2766295, { taxschedule: '1' }));
});

test('requires exact post-create total equality in integer cents', () => {
  assert.doesNotThrow(() => assertTotalsMatch(1420.88, 1420.88));
  assert.throws(() => assertTotalsMatch(1420.88, 1420.87), /does not reconcile/i);
  assert.throws(() => assertTotalsMatch(1420.88, 1420.89), /does not reconcile/i);
});
