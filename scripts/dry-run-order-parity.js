require('dotenv').config();
const { getOrders } = require('../miva');
const { getItemsBySku, getItemsByInternalId, getItemMetadata } = require('../netsuite');
const {
  moneyToCents,
  expandMivaItems,
  validateMivaOrderTotals,
  resolveExpandedLines,
} = require('../lib/orderMapping');

const ORDER_OVERRIDES = { 'SD-ARP-HEAD-6.0': '13609' };
const EXPECTED_ITEM_IDS = ['13609', '2317', '13573', '13132', '10322'];
const EXPECTED_TOTALS_CENTS = {
  product: 129283,
  shipping: 0,
  tax: 10219,
  protection: 2586,
  order: 142088,
};

async function evaluateOrderParity(order, dependencies = {}) {
  const skuLookup = dependencies.getItemsBySku || getItemsBySku;
  const itemIdLookup = dependencies.getItemsByInternalId || getItemsByInternalId;
  const metadataLookup = dependencies.getItemMetadata || getItemMetadata;
  const expanded = expandMivaItems(order);
  const totals = validateMivaOrderTotals(order, expanded);
  const resolved = await resolveExpandedLines(expanded, skuLookup, ORDER_OVERRIDES, itemIdLookup);
  const protection = (order.charges || []).find((charge) => charge.type === 'enshield_charge');
  const protectionItem = await metadataLookup('10322');
  const protectionTaxExpected = moneyToCents(protection?.tax) > 0;
  const protectionCents = moneyToCents(protection?.amount);
  const lines = [
    ...resolved.map((line) => ({
      sku: line.sku,
      itemId: String(line.itemId),
      quantity: line.quantity,
      rateCents: line.rateCents,
      amountCents: line.amountCents,
      taxable: line.taxable,
    })),
    ...(protection ? [{
      sku: 'Enhanced Shipping Protection',
      itemId: '10322',
      quantity: 1,
      rateCents: protectionCents,
      amountCents: protectionCents,
      taxable: protectionTaxExpected,
    }] : []),
  ];
  const totalsCents = {
    product: totals.productCents,
    shipping: moneyToCents(order.total_ship || order.shipping_cost),
    tax: moneyToCents(order.total_tax),
    protection: protectionCents,
    order: totals.orderCents,
  };
  const checks = {
    referenceOrder: String(order.id) === '2766295',
    itemIds: JSON.stringify(lines.map((line) => line.itemId)) === JSON.stringify(EXPECTED_ITEM_IDS),
    expectedTotals: Object.entries(EXPECTED_TOTALS_CENTS).every(
      ([key, expected]) => totalsCents[key] === expected
    ),
    protectionTaxSchedule: !protectionTaxExpected || String(protectionItem?.taxschedule) === '1',
  };
  return {
    mode: 'READ_ONLY_DRY_RUN',
    orderId: String(order.id),
    lines,
    totalsCents,
    protectionItem: {
      id: protectionItem?.id ? String(protectionItem.id) : null,
      currentTaxSchedule: protectionItem?.taxschedule ? String(protectionItem.taxschedule) : null,
      requiredTaxSchedule: protectionTaxExpected ? '1' : null,
    },
    checks,
    ready: Object.values(checks).every(Boolean),
  };
}

async function main() {
  const orderId = String(process.argv[2] || '');
  if (!/^\d+$/.test(orderId)) throw new Error('Usage: node scripts/dry-run-order-parity.js <miva-order-id>');
  const orders = await getOrders({ orderId, batchSize: 1 });
  const order = orders.find((candidate) => String(candidate.id) === orderId);
  if (!order) throw new Error(`Miva order ${orderId} was not found`);
  const report = await evaluateOrderParity(order);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`DRY RUN FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { evaluateOrderParity, main };
